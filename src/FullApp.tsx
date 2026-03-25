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
import { isGlassTheme } from './hooks/useThemeEffects'
import { I18nProvider } from './context/I18nContext'
import { ToastContainer } from './context/ToastContext'
import { CommandProvider } from './context/CommandContext'
import { ProfileProvider } from './context/ProfileContext'
import { ConfirmContainer } from './context/ConfirmContext'
import { SessionProvider } from './context/SessionContext'
import { FeatureProvider } from './context/FeatureContext'
import { useSessionManager } from './hooks/useSessionManager'
import { useEditorLayout } from './hooks/useEditorLayout'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { composeProviders } from './utils/composeProviders'
import { checkCrashOnStartup } from './lib/crashReporter'
import { initFlushOnExit } from './hooks/useFlushOnExit'
import { useWindowState, restoreWindowState } from './hooks/useWindowState'

// 重型组件懒加载
const Layout = React.lazy(() => import('./components/layout/Layout').then(m => ({ default: m.Layout })));

// ─── Provider 组合（声明式扁平化） ────────────────────────────────
const RootProviders = composeProviders(
    SettingsProvider,
    I18nProvider,
    ErrorBoundary,
    ProfileProvider,
    CommandProvider,
);



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
    const { config } = useSettings();
    const windowShown = useRef(false);

    // 初始化退出 Flush 机制（窗口关闭前强制保存所有防抖中的数据）
    useEffect(() => {
        initFlushOnExit();
    }, []);

    // 组件挂载后：恢复窗口位置 → 关闭 Splash → 显示主窗口
    useEffect(() => {
        if (windowShown.current) return;
        windowShown.current = true;

        const showMainWindow = async () => {
            // 0. 检查上次是否 Rust Panic 闪退，若有则自动上报
            const crashInfo = await checkCrashOnStartup();
            if (crashInfo) {
                console.warn('[启动检查] 检测到上次异常退出，已自动上报崩溃日志');
            }

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

    // 窗口位置持久化（定期保存 + 退出前保存）
    useWindowState();

    // 背景图片 URL 计算（仅 Glass/Pic 主题显示）
    const bgImageUrl = (() => {
        if (!isGlassTheme(config.theme)) return null;
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
                            inset: 'var(--bg-inset, 0px)',
                            zIndex: -1,
                            backgroundImage: `url("${bgImageUrl}")`,
                            backgroundSize: config.images.bgSize || 'cover',
                            backgroundPosition: config.images.bgPosition || 'center',
                            backgroundRepeat: 'no-repeat',
                            opacity: 'var(--bg-opacity, 1)',
                            filter: 'var(--glass-filter, none)',
                            pointerEvents: 'none',
                        }}
                    />
                )}

                <Suspense fallback={null}>
                    <Layout editorLayout={editorLayout} />
                </Suspense>
            </FeatureProvider>

            {/* 命令式 UI 渲染容器 — 平铺，不包裹子组件 */}
            <ToastContainer />
            <ConfirmContainer />
        </SessionProvider>
    );
}

