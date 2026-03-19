/**
 * FullApp.tsx
 * 完整应用逻辑 — 所有 Provider、Hook、布局和业务组件。
 * 通过 React.lazy 由 App.tsx 异步加载，不阻塞首帧渲染。
 *
 * ⚡ Splash 机制：
 *    1. Tauri 启动时显示 splashscreen 窗口（静态 HTML，毫秒级加载）
 *    2. 主窗口 visible:false，后台加载 React 应用
 *    3. AppContent 挂载完成后：关闭 splash → 显示主窗口
 */
import React, { Suspense, useEffect, useRef } from 'react'
import { getCurrentWindow, Window as TauriWindow } from '@tauri-apps/api/window'
import { convertFileSrc } from '@tauri-apps/api/core'
import { SettingsProvider, useSettings } from './context/SettingsContext'
import { I18nProvider, useI18n } from './context/I18nContext'
import { ToastContainer } from './context/ToastContext'
import { CommandProvider } from './context/CommandContext'
import { ConfirmContainer } from './context/ConfirmContext'
import { SessionProvider } from './context/SessionContext'
import { FeatureProvider } from './context/FeatureContext'
import { useSessionManager } from './hooks/useSessionManager'
import { useEditorLayout } from './hooks/useEditorLayout'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { composeProviders } from './utils/composeProviders'

// 重型组件懒加载
const Layout = React.lazy(() => import('./components/layout/Layout').then(m => ({ default: m.Layout })));

// ─── Provider 组合（声明式扁平化） ────────────────────────────────
const RootProviders = composeProviders(
    SettingsProvider,
    I18nProvider,
    ErrorBoundary,
    CommandProvider,
);

// ─── 窗口位置持久化 ─────────────────────────────────────────────


const WINDOW_STATE_KEY = 'tcom-window-state';

interface WindowState {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
}

/** 从 localStorage 恢复窗口位置和尺寸 */
async function restoreWindowState() {
    try {
        const saved = localStorage.getItem(WINDOW_STATE_KEY);
        if (!saved) return;
        const state: WindowState = JSON.parse(saved);
        const win = getCurrentWindow();
        const { PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/dpi');

        if (state.maximized) {
            // 先恢复非最大化状态的位置/尺寸（这样取消最大化时位置正确）
            if (state.x >= -100 && state.y >= -100 && state.width > 200 && state.height > 200) {
                await win.setPosition(new PhysicalPosition(state.x, state.y));
                await win.setSize(new PhysicalSize(state.width, state.height));
            }
            await win.maximize();
        } else {
            // 校验位置在屏幕范围内（防止窗口跑到不可见区域）
            if (state.x >= -100 && state.y >= -100 && state.width > 200 && state.height > 200) {
                await win.setPosition(new PhysicalPosition(state.x, state.y));
                await win.setSize(new PhysicalSize(state.width, state.height));
            }
        }
    } catch { /* 恢复失败时使用默认位置 */ }
}

/** 保存当前窗口位置和尺寸到 localStorage（物理像素坐标） */
async function saveWindowState() {
    try {
        const win = getCurrentWindow();
        const maximized = await win.isMaximized();
        // 最大化状态下不保存位置/尺寸（保存上次非最大化的值）
        if (maximized) {
            const saved = localStorage.getItem(WINDOW_STATE_KEY);
            if (saved) {
                const prev: WindowState = JSON.parse(saved);
                prev.maximized = true;
                localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(prev));
            } else {
                localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({ x: 100, y: 100, width: 1200, height: 800, maximized: true }));
            }
            return;
        }
        // outerPosition/outerSize 返回物理像素，直接保存
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        const state: WindowState = {
            x: pos.x, y: pos.y,
            width: size.width, height: size.height,
            maximized: false,
        };
        localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
    } catch { /* 保存失败时静默忽略 */ }
}

// ─── 组件 ──────────────────────────────────────────────────────

/** 完整应用入口（仅主窗口使用，编辑器窗口由 ThemeEditorApp.tsx 处理） */
export default function FullApp() {
    return (
        <RootProviders>
            <AppContent />
        </RootProviders>
    )
}

/** 主内容区 — Provider 就绪后渲染，Layout 挂载后关闭 Splash 并显示主窗口 */
function AppContent() {
    const sessionManager = useSessionManager();
    const editorLayout = useEditorLayout();
    const { t } = useI18n();
    const { config } = useSettings();
    const windowShown = useRef(false);

    // 组件挂载后：恢复窗口位置 → 关闭 Splash → 显示主窗口
    useEffect(() => {
        if (windowShown.current) return;
        windowShown.current = true;

        const showMainWindow = async () => {
            // 1. 恢复窗口位置（窗口仍不可见，不会闪烁）
            await restoreWindowState();

            // 2. 等待浏览器完成首帧绘制
            await new Promise<void>(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                });
            });

            // 3. 先关闭 Splash 窗口
            try {
                const splashWin = new TauriWindow('splashscreen');
                await splashWin.close();
            } catch { /* Splash 窗口可能已关闭 */ }

            // 4. 等待 Splash 完全关闭后再显示主窗口（与原始 Electron 行为一致）
            await new Promise(r => setTimeout(r, 50));

            // 5. 显示主窗口
            const mainWin = getCurrentWindow();
            await mainWin.show().catch(() => {});
            await mainWin.setFocus().catch(() => {});
        };

        showMainWindow();
    }, []);

    // 定期保存窗口位置（窗口移动/缩放后）
    useEffect(() => {
        const interval = setInterval(saveWindowState, 2000);
        // 窗口关闭前保存
        const handleBeforeUnload = () => { saveWindowState(); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // 背景图片 URL 计算
    const bgImageUrl = (() => {
        const { rxBackground } = config.images;
        if (!rxBackground) return null;
        const isUrl = /^https?:\/\//.test(rxBackground);
        return isUrl ? rxBackground : convertFileSrc(rxBackground);
    })();

    return (
        <SessionProvider manager={sessionManager}>
            <FeatureProvider>
                {/* 背景图片层 — fixed 铺满窗口，在所有内容下方 */}
                {bgImageUrl && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 0,
                            backgroundImage: `url("${bgImageUrl}")`,
                            backgroundSize: config.images.bgSize || 'cover',
                            backgroundPosition: config.images.bgPosition || 'center',
                            backgroundRepeat: 'no-repeat',
                            opacity: (config.images.bgOpacity ?? 100) / 100,
                            pointerEvents: 'none',
                        }}
                    />
                )}

                <Suspense fallback={null}>
                    <Layout editorLayout={editorLayout}>
                        <div className="flex flex-1 items-center justify-center h-full">
                            <div className="flex flex-col items-center max-w-md text-center">
                                <h1 className="text-4xl font-bold mb-4 text-[var(--st-panel-header-text)]">Tcom</h1>
                                <p className="text-lg text-[var(--input-placeholder-color)] mb-8">{t('welcome.subtitle')}</p>

                                <div className="flex gap-4">
                                    <button className="px-4 py-2 bg-[var(--button-background)] text-[var(--button-foreground)] text-sm hover:bg-[var(--button-hover-background)] transition-colors flex items-center gap-2">
                                        {t('welcome.newConnection')}
                                    </button>
                                    <button className="px-4 py-2 bg-[var(--button-secondary-background)] text-[var(--button-foreground)] text-sm hover:bg-[var(--button-secondary-hover-background)] transition-colors">
                                        {t('welcome.openLog')}
                                    </button>
                                </div>

                                <div className="mt-12 text-left w-full">
                                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--input-placeholder-color)] mb-2">{t('welcome.recent')}</h3>
                                    <div className="space-y-1">
                                        <div className="text-[13px] text-[var(--link-foreground)] hover:underline cursor-pointer">COM3 - 115200</div>
                                        <div className="text-[13px] text-[var(--link-foreground)] hover:underline cursor-pointer">COM7 - 9600</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Layout>
                </Suspense>
            </FeatureProvider>

            {/* 命令式 UI 渲染容器 — 平铺，不包裹子组件 */}
            <ToastContainer />
            <ConfirmContainer />
        </SessionProvider>
    );
}

