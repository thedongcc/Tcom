/**
 * shell.ts
 * shellAPI 适配层 — 外部链接和文件对话框。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerShellAPI(): void {
    window.shellAPI = {
        openExternal: (url) =>
            invoke('shell_open_external', { url }),

        showOpenDialog: (options) =>
            invoke('shell_show_open_dialog', { options }),
    }
}
