export interface ThemeDefinition {
    id: string;
    name: string;
    /** 图片主题标识：true = 需要背景图；普通主题不写此字段 */
    image?: true;
    colors: Record<string, string>;
}

/**
 * 判断一个 CSS 变量名是否为「面板/区域背景」类型
 */
function isBgKey(key: string): boolean {
    return key.endsWith('-bg') || key.endsWith('-background');
}

/**
 * 排除规则：这些变量即使是背景色，也不应参与透明度令牌混合。
 * 弹出层需保持可读、交互按钮保持实色。
 */
const JIT_EXCLUDE_PATTERNS = [
    'dialog', 'menu', 'dropdown', 'toast', 'popover', 'tooltip', // 弹出层
    'overlay',                                                     // 遮罩层
    'button', 'btn',                                               // 按钮
    'selection', 'highlight', 'match',                             // 选区
    'scrollbar',                                                    // 滚动条
    'checkbox', 'switch',                                          // 表单控件
    'badge', 'label-bg', 'tag-bg',                                 // 小型标记
    'debugging',                                                    // 调试态
    'conn-start', 'conn-stop', 'conn-disabled',                    // 连接按钮
    'progress',                                                     // 进度条
    'danger',                                                       // 危险操作
    'success-bg', 'error-bg', 'warning-bg', 'info-bg',            // 状态色
];

/**
 * 后缀排除：以这些结尾的变量名排除（交互态按钮背景）
 */
const JIT_EXCLUDE_SUFFIXES = [
    '-hover-bg',       // 悬停态背景（按钮/列表项）
    '-focus-bg',       // 聚焦态背景
    '-pressed-bg',     // 按下态背景
];

function isJitExcluded(key: string): boolean {
    const k = key.toLowerCase();
    // 后缀精确匹配
    if (JIT_EXCLUDE_SUFFIXES.some(s => k.endsWith(s))) return true;
    // 子串模糊匹配
    return JIT_EXCLUDE_PATTERNS.some(p => k.includes(p));
}

/**
 * 将主题的所有 CSS 变量注入到 :root
 * 切换时先清除上一个主题的所有 CSS 变量，避免残留
 *
 * 【JIT 拦截器模式】：
 * 对背景色 hex 值自动包上 color-mix(in srgb, hex calc(var(--tcom-ui-opacity,100)*1%), transparent)
 * 当没有背景图时 --tcom-ui-opacity 默认 100，等同于纯色。
 * 当开启背景图且滑块拖动时，浏览器 GPU 自动让所有背景变半透明！
 */
/** 追踪上一次 applyTheme 写入的变量名集合，用于差分清理 */
let _lastThemeVarKeys: Set<string> = new Set();

/**
 * 将主题的所有 CSS 变量注入到 :root
 * 切换时做差分更新：只删除旧主题独有的变量，避免清空排版/背景等非主题变量。
 *
 * 【JIT 拦截器模式】：
 * 对背景色 hex 值自动包上 color-mix(in srgb, hex calc(var(--tcom-ui-opacity,100)*1%), transparent)
 * 当没有背景图时 --tcom-ui-opacity 默认 100，等同于纯色。
 * 当开启背景图且滑块拖动时，浏览器 GPU 自动让所有背景变半透明！
 */
export function applyTheme(theme: ThemeDefinition): void {
    const root = document.documentElement;
    const inlineStyle = root.style;

    console.time(`[Theme] applyTheme(${theme.id})`);

    // ── Step 1：构建新主题变量 map ──
    const newVars = new Map<string, string>();
    Object.entries(theme.colors).forEach(([key, value]) => {
        if (isBgKey(key) && !isJitExcluded(key) && value.startsWith('#')) {
            newVars.set(key, `color-mix(in srgb, ${value} calc(var(--tcom-ui-opacity, 100) * 1%), transparent)`);
        } else {
            newVars.set(key, value);
        }
    });

    // ── Step 2：差分删除（仅删除旧主题有但新主题没有的变量，不碰排版/背景等变量）──
    _lastThemeVarKeys.forEach(oldKey => {
        if (!newVars.has(oldKey)) {
            inlineStyle.removeProperty(oldKey);
        }
    });

    // ── Step 3：写入新主题变量（同步，无 rAF 竞态风险）──
    newVars.forEach((value, key) => {
        inlineStyle.setProperty(key, value);
    });

    // 记录本次写入的变量名集合，供下次差分使用
    _lastThemeVarKeys = new Set(newVars.keys());

    // 标记当前主题 ID，供 CSS 选择器匹配
    root.setAttribute('data-theme', theme.id);

    // 清除所有旧的主题 class
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
    if (theme.id !== 'dark') {
        const safeClassName = theme.id.replace(/[^a-zA-Z0-9-]/g, '-');
        if (safeClassName) {
            document.body.classList.add(`theme-${safeClassName}`);
        }
    }

    console.timeEnd(`[Theme] applyTheme(${theme.id})`);
    console.log(`%c[Theme] 写入变量数: ${newVars.size}，删除旧变量数: ${_lastThemeVarKeys.size}`, 'color:#C586C0');
}

/**
 * 将主题定义序列化为 JSON 字符串（用于导出）
 */
export function exportTheme(theme: ThemeDefinition): string {
    return JSON.stringify(theme, null, 2);
}

/**
 * 从 JSON 字符串解析主题定义（用于导入）
 * 返回 null 表示格式无效
 */
export function importTheme(json: string): ThemeDefinition | null {
    try {
        const parsed = JSON.parse(json);
        if (
            typeof parsed.id === 'string' &&
            typeof parsed.colors === 'object' &&
            parsed.colors !== null
        ) {
            const result: ThemeDefinition = {
                id: parsed.id,
                name: typeof parsed.name === 'string' ? parsed.name : parsed.id,
                colors: parsed.colors,
            };
            // image 字段：true 表示图片主题
            if (parsed.image === true || parsed.type === 'image') result.image = true;
            return result;
        }
    } catch {
        // 解析失败
    }
    return null;
}
