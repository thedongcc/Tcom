/**
 * crashReporter.ts
 * 崩溃上报核心模块 — 面包屑追踪 + 错误采集 + 飞书 Webhook 上报。
 *
 * 功能：
 * - 环形缓冲区记录最近 30 条用户操作轨迹（面包屑）
 * - 自动采集点击事件作为面包屑
 * - 采集设备/环境信息（OS、版本、窗口尺寸等）
 * - 构建飞书消息卡片并通过 Rust Command 发送
 * - 启动时检查上次 Rust Panic 崩溃
 */

// ─── 类型定义 ────────────────────────────────────────────────────

/** 面包屑条目 */
export interface Breadcrumb {
    /** 时间戳 */
    timestamp: string;
    /** 分类：click/navigation/action/serial/error */
    category: string;
    /** 描述 */
    message: string;
    /** 附加数据 */
    data?: Record<string, unknown>;
}

/** 上报 payload */
export interface CrashReportPayload {
    /** 错误名称 */
    errorName: string;
    /** 错误消息 */
    errorMessage: string;
    /** 错误堆栈 */
    errorStack: string;
    /** 错误来源 */
    source: string;
    /** 操作系统信息 */
    os: string;
    /** App 版本号 */
    appVersion: string;
    /** 窗口尺寸 */
    windowSize: string;
    /** 屏幕分辨率 */
    screenResolution: string;
    /** 面包屑轨迹 */
    breadcrumbs: Breadcrumb[];
    /** 上报时间 */
    reportTime: string;
}

// ─── 面包屑环形缓冲区 ────────────────────────────────────────────

const MAX_BREADCRUMBS = 30;
const breadcrumbs: Breadcrumb[] = [];

/** 添加面包屑 */
export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
    const now = new Date();
    const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    breadcrumbs.push({ timestamp, category, message, data });

    // 超出上限时移除最早的
    if (breadcrumbs.length > MAX_BREADCRUMBS) {
        breadcrumbs.shift();
    }
}

/** 获取面包屑快照 */
function getBreadcrumbs(): Breadcrumb[] {
    return [...breadcrumbs];
}

// ─── 环境信息采集 ─────────────────────────────────────────────────

/** 获取操作系统信息 */
function getOsInfo(): string {
    const { userAgent, platform } = navigator;
    // 从 userAgent 提取 Windows 版本
    const winMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
    if (winMatch) {
        const ntVersion = winMatch[1];
        const versionMap: Record<string, string> = {
            '10.0': 'Windows 10/11',
            '6.3': 'Windows 8.1',
            '6.2': 'Windows 8',
            '6.1': 'Windows 7',
        };
        return versionMap[ntVersion] || `Windows NT ${ntVersion}`;
    }
    return platform || 'Unknown';
}

/** 获取 App 版本号 */
async function getAppVersion(): Promise<string> {
    try {
        if (window.updateAPI?.getVersion) {
            return await window.updateAPI.getVersion();
        }
    } catch { /* 静默忽略 */ }
    return 'unknown';
}

// ─── 飞书消息卡片构建 ────────────────────────────────────────────

import { buildFeishuCard } from './feishuCard';

// ─── 隐私合规开关 ─────────────────────────────────────────────

/** localStorage 键名 — 崩溃上报开关 */
const CRASH_REPORT_ENABLED_KEY = 'tcom-crash-report-enabled';

/** 检查用户是否允许发送崩溃报告（默认允许） */
export function isCrashReportEnabled(): boolean {
    try {
        const val = localStorage.getItem(CRASH_REPORT_ENABLED_KEY);
        // 未设置时默认开启；只有明确设为 'false' 才关闭
        return val !== 'false';
    } catch {
        return true;
    }
}

/** 设置崩溃上报开关 */
export function setCrashReportEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(CRASH_REPORT_ENABLED_KEY, String(enabled));
    } catch { /* 静默忽略 */ }
}

// ─── 频率限制（防止恶意刷消息） ────────────────────────────────

/** 每个滑动窗口的最大发送次数 */
const RATE_LIMIT_MAX = 3;
/** 滑动窗口时长（毫秒），60 秒 */
const RATE_LIMIT_WINDOW_MS = 60_000;
/** 同一错误消息的去重间隔（毫秒），5 分钟 */
const DEDUP_INTERVAL_MS = 5 * 60_000;
/** 单次应用会话的最大发送总量 */
const SESSION_MAX_REPORTS = 10;

/** 滑动窗口内的发送时间戳 */
const sendTimestamps: number[] = [];
/** 已发送过的错误消息 → 最后发送时间 */
const sentErrors = new Map<string, number>();
/** 本次会话累计发送次数 */
let sessionReportCount = 0;

/** 检查是否被频率限制（true = 被限制，不应发送） */
function isRateLimited(errorMessage: string): boolean {
    const now = Date.now();

    // 1. 单次会话总量限制
    if (sessionReportCount >= SESSION_MAX_REPORTS) {
        console.warn('[crashReporter] 本次会话已达最大上报次数，跳过');
        return true;
    }

    // 2. 同一错误消息去重
    const lastSent = sentErrors.get(errorMessage);
    if (lastSent && now - lastSent < DEDUP_INTERVAL_MS) {
        console.warn('[crashReporter] 相同错误 5 分钟内已上报过，跳过');
        return true;
    }

    // 3. 滑动窗口频率限制
    // 清理过期时间戳
    while (sendTimestamps.length > 0 && now - sendTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
        sendTimestamps.shift();
    }
    if (sendTimestamps.length >= RATE_LIMIT_MAX) {
        console.warn('[crashReporter] 60 秒内已发送 3 次，触发频率限制');
        return true;
    }

    return false;
}

/** 记录一次成功发送 */
function recordSend(errorMessage: string): void {
    const now = Date.now();
    sendTimestamps.push(now);
    sentErrors.set(errorMessage, now);
    sessionReportCount++;
}

// ─── 上报函数 ──────────────────────────────────────────────────

/** 上报结果类型 */
export type ReportResult = 'sent' | 'rateLimit' | 'failed';

/** 上报错误到飞书 Webhook */
export async function reportError(
    error: Error | string,
    source: string = 'unknown',
): Promise<ReportResult> {
    try {
        const err = typeof error === 'string' ? new Error(error) : error;
        const errorMsg = err.message || String(error);

        // 隐私开关检查 — 用户关闭后静默跳过
        if (!isCrashReportEnabled()) {
            return 'failed';
        }

        // 频率限制检查
        if (isRateLimited(errorMsg)) {
            return 'rateLimit';
        }

        const appVersion = await getAppVersion();

        const payload: CrashReportPayload = {
            errorName: err.name || 'Error',
            errorMessage: errorMsg,
            errorStack: err.stack || '无堆栈信息',
            source,
            os: getOsInfo(),
            appVersion,
            windowSize: `${window.innerWidth}x${window.innerHeight}`,
            screenResolution: `${screen.width}x${screen.height}`,
            breadcrumbs: getBreadcrumbs(),
            reportTime: new Date().toISOString(),
        };

        const card = buildFeishuCard(payload);
        const cardJson = JSON.stringify(card);

        // 通过 Rust Command 发送（绕过 CSP 限制）
        if (window.crashReportAPI?.send) {
            await window.crashReportAPI.send(cardJson);
            recordSend(errorMsg);
            return 'sent';
        } else {
            console.warn('[crashReporter] crashReportAPI 未注册，无法上报');
            return 'failed';
        }
    } catch (e) {
        // 上报本身不应该导致额外崩溃
        console.error('[crashReporter] 上报失败:', e);
        return 'failed';
    }
}

/** 上报 Rust Panic 崩溃（特殊格式） */
export async function reportRustPanic(panicInfo: string): Promise<boolean> {
    try {
        const appVersion = await getAppVersion();

        const payload: CrashReportPayload = {
            errorName: 'Rust Panic',
            errorMessage: '应用上次运行时发生了 Rust 后端崩溃',
            errorStack: panicInfo,
            source: 'rust-panic-hook',
            os: getOsInfo(),
            appVersion,
            windowSize: `${window.innerWidth}x${window.innerHeight}`,
            screenResolution: `${screen.width}x${screen.height}`,
            breadcrumbs: [], // Panic 时无前端面包屑
            reportTime: new Date().toISOString(),
        };

        const card = buildFeishuCard(payload);
        const cardJson = JSON.stringify(card);

        if (window.crashReportAPI?.send) {
            await window.crashReportAPI.send(cardJson);
            return true;
        }
        return false;
    } catch (e) {
        console.error('[crashReporter] Rust Panic 上报失败:', e);
        return false;
    }
}

// ─── 启动检查 ──────────────────────────────────────────────────

/** 启动时检查上次是否 Rust Panic 闪退，若有则上报 */
export async function checkCrashOnStartup(): Promise<string | null> {
    try {
        if (!window.crashReportAPI?.check) return null;

        const crashInfo = await window.crashReportAPI.check();
        if (crashInfo) {
            // ⚠️ 必须先清除标记文件，再上报！
            // 如果先上报再清除，上报过程中再次崩溃会导致标记永远残留 → 死循环
            await window.crashReportAPI.clear?.();
            // 异步上报（不阻塞启动流程）
            reportRustPanic(crashInfo).catch(() => {});
            return crashInfo;
        }
        return null;
    } catch (e) {
        console.error('[crashReporter] 检查崩溃标记失败:', e);
        return null;
    }
}

// ─── 自动面包屑初始化 ───────────────────────────────────────────

/** 初始化自动面包屑采集（点击事件） */
export function initAutoBreadcrumbs(): void {
    // 不采集文本内容的元素标签（防止敏感数据泄露）
    const sensitiveTagNames = new Set(['INPUT', 'TEXTAREA']);

    // 捕获所有点击事件
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        const tag = target.tagName.toLowerCase();

        // 提取有意义的标识符（脱敏处理）
        let action: string;
        if (sensitiveTagNames.has(target.tagName)) {
            // 输入类元素：只记录 id/aria-label，绝不采集文本内容
            action = target.id
                || target.getAttribute('aria-label')
                || target.getAttribute('placeholder')?.substring(0, 20)
                || '[用户输入]';
        } else {
            action = target.getAttribute('data-action')
                || target.getAttribute('data-component')
                || target.id
                || target.getAttribute('aria-label')
                || target.textContent?.trim().substring(0, 30)
                || tag;
        }

        addBreadcrumb('click', `${tag}: ${action}`);
    }, { capture: true, passive: true });
}
