/**
 * tcp.ts
 * tcpAPI 适配层 — TCP 桥接 IPC。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export function registerTcpAPI(): void {
    window.tcpAPI = {
        start: (port) =>
            invoke('tcp_start', { port }),

        stop: (port) =>
            invoke('tcp_stop', { port }),

        write: (port, data) =>
            invoke('tcp_write', { port, data }),

        onData: (callback) => {
            let unlisten: UnlistenFn | null = null
            let disposed = false
            listen<{ port: number; data: number[] }>('tcp:data', (event) => {
                callback(event.payload.port, new Uint8Array(event.payload.data))
            }).then(fn => {
                if (disposed) fn()
                else unlisten = fn
            })
            return () => {
                disposed = true
                unlisten?.()
            }
        },
    }
}
