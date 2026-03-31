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
            createListener<{ sessionId: string; type: 'RX' | 'TX'; data: number[]; timestamp?: number }>(
                'monitor:data', sessionId,
                (p) => callback(p.type, new Uint8Array(p.data), p.timestamp),
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
            
        startTimedSend: (sessionId, target, data, intervalMs) =>
            invoke('monitor_start_timed_send', { sessionId, target, data, intervalMs }),

        stopTimedSend: (sessionId) =>
            invoke('monitor_stop_timed_send', { sessionId }),

        onTimedSendTickBatch: (sessionId, callback) => {
            let unlisten: UnlistenFn | null = null;
            let disposed = false;
            listen<{ sessionId: string; type: string; target?: string; data: number[]; timestamp: number }[]>('monitor:timed-send-tick-batch', (event) => {
                const batch = event.payload;
                if (batch && batch.length > 0 && batch[0].sessionId === sessionId) {
                    callback(batch.map(e => ({ data: e.data, timestamp: e.timestamp, target: e.target })));
                }
            }).then(fn => {
                if (disposed) fn();
                else unlisten = fn;
            });
            return () => {
                disposed = true;
                unlisten?.();
            };
        },
    }
}
