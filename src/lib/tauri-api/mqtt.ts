/**
 * mqtt.ts
 * mqttAPI 适配层 — 将 Electron ipcRenderer 替换为 Tauri v2 invoke/listen。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 创建带 connectionId 过滤的事件监听器 */
function createListener<T>(
    eventName: string,
    connectionId: string,
    handler: (payload: T) => void,
): () => void {
    let unlisten: UnlistenFn | null = null
    let disposed = false
    listen<T & { connectionId: string }>(eventName, (event) => {
        if (event.payload.connectionId === connectionId) {
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

export function registerMqttAPI(): void {
    window.mqttAPI = {
        connect: (connectionId, config) =>
            invoke('mqtt_connect', { connectionId, config }),

        disconnect: (connectionId) =>
            invoke('mqtt_disconnect', { connectionId }),

        publish: (connectionId, topic, payload, options) =>
            invoke('mqtt_publish', { connectionId, topic, payload, options }),

        subscribe: (connectionId, topic) =>
            invoke('mqtt_subscribe', { connectionId, topic }),

        unsubscribe: (connectionId, topic) =>
            invoke('mqtt_unsubscribe', { connectionId, topic }),

        onMessage: (connectionId, callback) =>
            createListener<{ connectionId: string; topic: string; payload: number[] }>(
                'mqtt:message', connectionId,
                (p) => callback(p.topic, new Uint8Array(p.payload)),
            ),

        onStatus: (connectionId, callback) =>
            createListener<{ connectionId: string; status: string }>(
                'mqtt:status', connectionId,
                (p) => callback(p.status),
            ),

        onError: (connectionId, callback) =>
            createListener<{ connectionId: string; error: string }>(
                'mqtt:error', connectionId,
                (p) => callback(p.error),
            ),
    }
}
