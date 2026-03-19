/**
 * session.ts
 * sessionAPI 适配层 — 会话持久化 IPC。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerSessionAPI(): void {
    window.sessionAPI = {
        save: (sessions) =>
            invoke('session_save', { sessions }),

        load: () =>
            invoke('session_load'),
    }
}
