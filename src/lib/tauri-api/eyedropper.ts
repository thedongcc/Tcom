/**
 * eyedropper.ts
 * eyedropperAPI 适配层 — 取色器 IPC。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 创建全局事件监听器包装 */
function createGlobalListener<T>(
    eventName: string,
    handler: (payload: T) => void,
): () => void {
    let unlisten: UnlistenFn | null = null
    let disposed = false
    listen<T>(eventName, (event) => {
        handler(event.payload)
    }).then(fn => {
        if (disposed) fn()
        else unlisten = fn
    })
    return () => {
        disposed = true
        unlisten?.()
    }
}

export function registerEyedropperAPI(): void {
    window.eyedropperAPI = {
        pick: () =>
            invoke('eyedropper_pick'),

        watchStart: () =>
            invoke('eyedropper_watch_start'),

        watchStop: () =>
            invoke('eyedropper_watch_stop'),

        onColor: (cb) =>
            createGlobalListener<string>('eyedropper:color', cb),

        onPicked: (cb) =>
            createGlobalListener<string>('eyedropper:picked', cb),

        onCanceled: (cb) =>
            createGlobalListener<void>('eyedropper:canceled', () => cb()),
    }
}
