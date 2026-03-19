/**
 * app.ts
 * appAPI 适配层 — 应用级 IPC（恢复出厂）。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerAppAPI(): void {
    window.appAPI = {
        factoryReset: () =>
            invoke('app_factory_reset'),
    }
}
