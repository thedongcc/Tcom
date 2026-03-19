/**
 * app.ts
 * appAPI 适配层 — 应用级 IPC（恢复出厂、splash 控制）。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerAppAPI(): void {
    window.appAPI = {
        factoryReset: () =>
            invoke('app_factory_reset'),

        // Tauri 不需要 splash 机制（原生窗口启动极快），提供空实现
        splashReady: () => { /* noop */ },
        splashProgress: () => { /* noop */ },
    }
}
