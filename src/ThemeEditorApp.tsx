/**
 * ThemeEditorApp.tsx
 * 主题编辑器独立窗口入口 — 最小化依赖，不加载 Layout/TitleBar 等主窗口组件。
 */
import React, { Suspense } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { SettingsProvider } from './context/SettingsContext'
import { I18nProvider } from './context/I18nContext'
import { ErrorBoundary } from './components/common/ErrorBoundary'

const ThemeColorEditor = React.lazy(() =>
    import('./components/theme/ThemeColorEditor').then(m => ({ default: m.ThemeColorEditor }))
);

export default function ThemeEditorApp() {
    return (
        <ErrorBoundary>
            <SettingsProvider>
                <I18nProvider>
                    <Suspense fallback={
                        <div className="flex items-center justify-center h-screen bg-[var(--app-background,#1e1e1e)]">
                            <div className="text-sm text-[var(--app-foreground,#ccc)] opacity-40">Loading...</div>
                        </div>
                    }>
                        <ThemeColorEditor
                            isOpen={true}
                            onClose={() => { getCurrentWindow().close(); }}
                        />
                    </Suspense>
                </I18nProvider>
            </SettingsProvider>
        </ErrorBoundary>
    );
}
