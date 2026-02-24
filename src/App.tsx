import { Layout } from './components/layout/Layout'
import { SettingsProvider } from './context/SettingsContext'
import { I18nProvider } from './context/I18nContext'
import { ToastProvider } from './context/ToastContext'
import { CommandProvider } from './context/CommandContext'
import { ConfirmProvider } from './context/ConfirmContext'

function App() {
  return (
    <SettingsProvider>
      <I18nProvider>
        <ToastProvider>
          <ConfirmProvider>
            <CommandProvider>
              <Layout>
                <div className="flex flex-1 items-center justify-center h-full">
                  <div className="flex flex-col items-center max-w-md text-center">
                    <h1 className="text-4xl font-bold mb-4 text-[var(--app-foreground)]">Tcom</h1>
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
            </CommandProvider>
          </ConfirmProvider>
        </ToastProvider>
      </I18nProvider>
    </SettingsProvider>
  )
}

export default App
