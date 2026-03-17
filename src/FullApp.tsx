/**
 * FullApp.tsx
 * 完整应用逻辑 — 所有 Provider、Hook、布局和业务组件。
 * 通过 React.lazy 由 App.tsx 异步加载，不阻塞首帧渲染。
 */
import React, { Suspense } from 'react'
import { SettingsProvider } from './context/SettingsContext'
import { I18nProvider, useI18n } from './context/I18nContext'
import { ToastProvider } from './context/ToastContext'
import { CommandProvider } from './context/CommandContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { SessionProvider } from './context/SessionContext'
import { FeatureProvider } from './context/FeatureContext'
import { useSessionManager } from './hooks/useSessionManager'
import { useEditorLayout } from './hooks/useEditorLayout'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// 重型组件懒加载
const ThemeColorEditor = React.lazy(() => import('./components/theme/ThemeColorEditor').then(m => ({ default: m.ThemeColorEditor })));
const Layout = React.lazy(() => import('./components/layout/Layout').then(m => ({ default: m.Layout })));

// 懒加载中的 fallback
const LazyFallback = () => (
    <div className="flex-1 flex items-center justify-center opacity-40">
        <div className="text-sm">Loading...</div>
    </div>
);

/** 完整应用入口 */
export default function FullApp() {
    // 独立主题编辑器窗口
    if (window.location.hash.includes('/theme-editor')) {
        return (
            <ErrorBoundary>
                <SettingsProvider>
                    <I18nProvider>
                        <Suspense fallback={<LazyFallback />}>
                            <ThemeColorEditor isOpen={true} onClose={() => { window.themeAPI?.closeThemeEditor(); }} />
                        </Suspense>
                    </I18nProvider>
                </SettingsProvider>
            </ErrorBoundary>
        );
    }

    return (
        <SettingsProvider>
            <I18nProvider>
                <ErrorBoundary>
                    <ToastProvider>
                        <ConfirmProvider>
                            <CommandProvider>
                                <AppContent />
                            </CommandProvider>
                        </ConfirmProvider>
                    </ToastProvider>
                </ErrorBoundary>
            </I18nProvider>
        </SettingsProvider>
    )
}

/** 主内容区 — Provider 就绪后渲染 */
function AppContent() {
    const sessionManager = useSessionManager();
    const editorLayout = useEditorLayout();
    const { t } = useI18n();

    return (
        <SessionProvider manager={sessionManager}>
            <FeatureProvider>
                <Suspense fallback={<LazyFallback />}>
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
        </SessionProvider>
    );
}
