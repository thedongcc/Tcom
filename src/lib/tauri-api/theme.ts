/**
 * theme.ts
 * themeAPI 适配层 — 主题管理和编辑器 IPC。
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

export function registerThemeAPI(): void {
    window.themeAPI = {
        loadAll: () =>
            invoke('theme_load_all'),

        openFolder: () => {
            invoke('theme_open_folder').catch(() => { /* 占位 */ })
        },

        openFile: (themeId) => {
            invoke('theme_open_file', { themeId }).catch(() => { /* 占位 */ })
        },

        updateTitleBar: () => {
            // Tauri 使用 decorations: false，标题栏完全由前端控制，无需 IPC
        },

        onStatusChanged: (callback) =>
            createGlobalListener<boolean>('theme-editor:status-changed', callback),

        openThemeEditor: async () => {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
            const existing = await WebviewWindow.getByLabel('theme-editor')
            if (existing) {
                // toggle：已打开则关闭
                await existing.close()
                return
            }
            // 读取上次窗口位置和大小
            let x: number | undefined, y: number | undefined
            let width = 360, height = 700
            try {
                const saved = JSON.parse(localStorage.getItem('tcom-theme-editor-bounds') || '{}')
                if (saved.x !== undefined) x = saved.x
                if (saved.y !== undefined) y = saved.y
                if (saved.width) width = saved.width
                if (saved.height) height = saved.height
            } catch { /* 忽略 */ }

            const opts: Record<string, unknown> = {
                url: 'index.html',
                title: '主题颜色编辑器',
                width, height,
                minWidth: 300,
                minHeight: 400,
                resizable: true,
                decorations: false,
                alwaysOnTop: true,
            }
            if (x !== undefined && y !== undefined) {
                opts.x = x
                opts.y = y
            } else {
                opts.center = true
            }
            const win = new WebviewWindow('theme-editor', opts as any)

            // 监听移动/缩放，持久化位置（转换为逻辑像素）
            win.once('tauri://created', async () => {
                const savePos = async () => {
                    try {
                        const factor = await win.scaleFactor()
                        const pos = await win.outerPosition()
                        const size = await win.innerSize()
                        localStorage.setItem('tcom-theme-editor-bounds', JSON.stringify({
                            x: Math.round(pos.x / factor),
                            y: Math.round(pos.y / factor),
                            width: Math.round(size.width / factor),
                            height: Math.round(size.height / factor),
                        }))
                    } catch { /* 忽略 */ }
                }
                win.onMoved(savePos)
                win.onResized(savePos)
            })
        },

        closeThemeEditor: async () => {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
            const win = await WebviewWindow.getByLabel('theme-editor')
            if (win) await win.close()
        },

        isWindowOpen: async () => {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
            const win = await WebviewWindow.getByLabel('theme-editor')
            return win !== null
        },

        save: (id, themeDef) =>
            invoke('theme_editor_save', { id, themeDef }),

        applyPreview: async (edits) => {
            const { emit } = await import('@tauri-apps/api/event')
            await emit('theme:apply-preview', edits)
        },

        getPendingEdits: async (themeId) => {
            try {
                const all = JSON.parse(localStorage.getItem('tcom-theme-editor-pending') || '{}')
                return all[themeId] || {}
            } catch { return {} }
        },

        getAllPendingEdits: async () => {
            try {
                return JSON.parse(localStorage.getItem('tcom-theme-editor-pending') || '{}')
            } catch { return {} }
        },

        clearAllPendingEdits: () => {
            localStorage.removeItem('tcom-theme-editor-pending')
        },

        setPendingEdits: (themeId, edits) => {
            try {
                const all = JSON.parse(localStorage.getItem('tcom-theme-editor-pending') || '{}')
                all[themeId] = edits
                localStorage.setItem('tcom-theme-editor-pending', JSON.stringify(all))
            } catch { /* 忽略 */ }
        },

        startInspectorMode: async () => {
            const { emit } = await import('@tauri-apps/api/event')
            await emit('theme-editor:start-inspector')
        },

        stopInspectorMode: async () => {
            const { emit } = await import('@tauri-apps/api/event')
            await emit('theme-editor:inspector-stopped')
        },

        stopInspector: async () => {
            const { emit } = await import('@tauri-apps/api/event')
            await emit('theme-editor:inspector-stopped')
        },

        componentPicked: async (data) => {
            const { emit } = await import('@tauri-apps/api/event')
            await emit('theme-editor:component-picked', data)
        },

        onComponentPicked: (callback) =>
            createGlobalListener<{ compKey: string | null; className: string; outerHTML: string }>(
                'theme-editor:component-picked', callback,
            ),

        onInspectorStarted: (callback) =>
            createGlobalListener<void>('theme-editor:start-inspector', () => callback()),

        onInspectorStopped: (callback) =>
            createGlobalListener<void>('theme-editor:inspector-stopped', () => callback()),

        getExpandedGroups: async () => {
            try {
                const stored = localStorage.getItem('tcom-theme-editor-expanded')
                return stored ? JSON.parse(stored) : []
            } catch {
                return []
            }
        },

        setExpandedGroups: (groups) => {
            try {
                localStorage.setItem('tcom-theme-editor-expanded', JSON.stringify(groups))
            } catch { /* 忽略 */ }
        },

        initData: async () => {
            const pendingEdits = JSON.parse(localStorage.getItem('tcom-theme-editor-pending') || '{}')
            const expandedGroups = JSON.parse(localStorage.getItem('tcom-theme-editor-expanded') || '{}')
            return { pendingEdits, expandedGroups }
        },

        onApplyPreview: (callback) =>
            createGlobalListener<Record<string, string>>('theme:apply-preview', callback),

        onEditorClosed: (callback) =>
            createGlobalListener<boolean>('theme-editor:status-changed', (isOpen) => {
                if (!isOpen) callback()
            }),

        onReload: (callback) =>
            createGlobalListener<void>('theme:reload', () => callback()),
    }
}
