import { Layout } from './components/layout/Layout'
import { SettingsProvider } from './context/SettingsContext'
import { I18nProvider } from './context/I18nContext'
import { ToastProvider } from './context/ToastContext'
import { CommandProvider } from './context/CommandContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { SessionProvider } from './context/SessionContext'
import { FeatureProvider } from './context/FeatureContext'
import { useSessionManager } from './hooks/useSessionManager'
import { useEditorLayout } from './hooks/useEditorLayout'
import { ThemeColorEditor } from './components/theme/ThemeColorEditor'
import { ErrorBoundary } from './components/common/ErrorBoundary'

function App() {
  const sessionManager = useSessionManager();
  const editorLayout = useEditorLayout();

  // 拦截独立的主题编辑器窗口渲染
  if (window.location.hash.includes('/theme-editor')) {
    return (
      <ErrorBoundary>
        <SettingsProvider>
          <I18nProvider>
            <ThemeColorEditor isOpen={true} onClose={() => { (window as any).themeAPI?.closeThemeEditor(); }} />
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
                <SessionProvider manager={sessionManager}>
                  <FeatureProvider>
                    <Layout editorLayout={editorLayout}>
                      <div className="flex flex-1 items-center justify-center h-full">
                        <div className="flex flex-col items-center max-w-md text-center">
                          <h1 className="text-4xl font-bold mb-4 text-[var(--st-panel-header-text)]">Tcom</h1>
                          <p className="text-lg text-[var(--input-placeholder-color)] mb-8">VS Code Style Serial Debug Assistant</p>

                          <div className="flex gap-4">
                            <button className="px-4 py-2 bg-[var(--button-background)] text-[var(--button-foreground)] text-sm hover:bg-[var(--button-hover-background)] transition-colors flex items-center gap-2">
                              New Connection
                            </button>
                            <button className="px-4 py-2 bg-[var(--button-secondary-background)] text-[var(--button-foreground)] text-sm hover:bg-[var(--button-secondary-hover-background)] transition-colors">
                              Open Log...
                            </button>
                          </div>

                          <div className="mt-12 text-left w-full">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--input-placeholder-color)] mb-2">Recent</h3>
                            <div className="space-y-1">
                              <div className="text-[13px] text-[var(--link-foreground)] hover:underline cursor-pointer">COM3 - 115200</div>
                              <div className="text-[13px] text-[var(--link-foreground)] hover:underline cursor-pointer">COM7 - 9600</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Layout>
                  </FeatureProvider>
                </SessionProvider>
              </CommandProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ErrorBoundary>
      </I18nProvider>
    </SettingsProvider>
  )
}

export default App
