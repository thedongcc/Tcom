/**
 * update.ts
 * updateAPI 适配层 — 应用更新（占位实现）。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 创建事件监听器包装 */
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

export function registerUpdateAPI(): void {
    window.updateAPI = {
        getVersion: () =>
            invoke('app_get_version'),

        getStats: () =>
            invoke('app_get_stats'),

        check: () =>
            invoke('update_check'),

        download: () =>
            invoke('update_download'),

        install: () => {
            invoke('update_install').catch(() => { /* 占位 */ })
        },

        listFonts: () =>
            invoke('app_list_fonts'),

        onStatus: (callback) =>
            createGlobalListener<{ status: string; version?: string; error?: string }>(
                'update:status', callback,
            ),

        onProgress: (callback) =>
            createGlobalListener<{ percent: number; bytesPerSecond?: number; total?: number; transferred?: number }>(
                'update:progress', callback,
            ),
    }
}
