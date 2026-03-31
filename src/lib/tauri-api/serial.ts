/**
 * serial.ts
 * serialAPI 适配层 — Tauri v2 invoke/listen 实现串口操作。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 创建事件监听适配器：将 Tauri 异步 listen 包装为同步返回的 cleanup 函数 */
function createListener<T>(
    eventName: string,
    connectionId: string,
    idField: string,
    handler: (payload: T) => void,
): () => void {
    let unlisten: UnlistenFn | null = null
    let disposed = false
    listen<T & Record<string, unknown>>(eventName, (event) => {
        if (event.payload[idField] === connectionId) {
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

export function registerSerialAPI(): void {
    window.serialAPI = {
        listPorts: (options) =>
            invoke('serial_list_ports', { options: options ?? {} }),

        open: (connectionId, options, parserSchemeIds) =>
            invoke('serial_open', { connectionId, options, parserSchemeIds }),

        close: (connectionId) =>
            invoke('serial_close', { connectionId }),

        write: (connectionId, data) => {
            // 将 Uint8Array 转为 number[] 以支持 JSON 序列化
            const payload = data instanceof Uint8Array ? Array.from(data) : data
            return invoke('serial_write', { connectionId, data: payload })
        },

        onData: (connectionId, callback) =>
            createListener<{ connectionId: string; data: number[]; timestamp?: number }>(
                'serial:data', connectionId, 'connectionId',
                (p) => callback(new Uint8Array(p.data), p.timestamp),
            ),

        onClosed: (connectionId, callback) =>
            createListener<{ connectionId: string }>(
                'serial:closed', connectionId, 'connectionId',
                () => callback(),
            ),

        onError: (connectionId, callback) =>
            createListener<{ connectionId: string; error: string }>(
                'serial:error', connectionId, 'connectionId',
                (p) => callback(p.error),
            ),

        // 高精度定时发送
        timedSendStart: (connectionId, data, intervalMs) =>
            invoke('serial_timed_send_start', { connectionId, data, intervalMs }),

        timedSendStop: (connectionId) =>
            invoke('serial_timed_send_stop', { connectionId }),

        onTimedSendTickBatch: (connectionId, callback) => {
            let unlisten: import('@tauri-apps/api/event').UnlistenFn | null = null;
            let disposed = false;
            listen<{ connectionId: string; data: number[]; timestamp: number }[]>('serial:timed-send-tick-batch', (event) => {
                const batch = event.payload;
// log("[Serial Batch Received]", batch);
                if (batch && batch.length > 0 && batch[0].connectionId === connectionId) {
                    callback(batch);
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

        // 动态定时发送
        timedSendStartDynamic: (connectionId, frames, intervalMs, timestampSlots) =>
            invoke('serial_timed_send_start_dynamic', { connectionId, frames, intervalMs, timestampSlots }),
    }
}
