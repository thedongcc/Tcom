/**
 * monitor.ts
 * monitorAPI 适配层 — 串口监控模式 IPC。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 创建带 sessionId 过滤的事件监听器 */
function createListener<T>(
    eventName: string,
    sessionId: string,
    handler: (payload: T) => void,
): () => void {
    let unlisten: UnlistenFn | null = null
    let disposed = false
    listen<T & { sessionId: string }>(eventName, (event) => {
        if (event.payload.sessionId === sessionId) {
            handler(event.payload as T)
        }
    }).then(fn => {
        if (disposed) fn()
        else unlisten = fn
    })
    return () => {
        disposed = true
        unlisten?.()
    }
}

export function registerMonitorAPI(): void {
    window.monitorAPI = {
        start: (sessionId, config) =>
            invoke('monitor_start', { sessionId, config }),

        stop: (sessionId) =>
            invoke('monitor_stop', { sessionId }),

        write: (sessionId, target, data) =>
            invoke('monitor_write', { sessionId, target, data }),

        onData: (sessionId, callback) =>
            createListener<{ sessionId: string; type: 'RX' | 'TX'; data: number[] }>(
                'monitor:data', sessionId,
                (p) => callback(p.type, new Uint8Array(p.data)),
            ),

        onError: (sessionId, callback) =>
            createListener<{ sessionId: string; error: string }>(
                'monitor:error', sessionId,
                (p) => callback(p.error),
            ),

        onClosed: (sessionId, callback) =>
            createListener<{ sessionId: string; origin: string; path: string }>(
                'monitor:closed', sessionId,
                (p) => callback({ origin: p.origin, path: p.path }),
            ),

        onPartnerStatus: (sessionId, callback) =>
            createListener<{ sessionId: string; connected: boolean }>(
                'monitor:partner-status', sessionId,
                (p) => callback(p.connected),
            ),
    }
}
