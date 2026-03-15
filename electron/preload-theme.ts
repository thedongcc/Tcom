/**
 * preload-theme.ts
 * 主题 + 吸管桥接。
 * 从 preload.ts 拆分出来，按主题域分组。
 */
import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron';

/** 组件检查器拾取的数据 */
interface ComponentPickedData {
    compKey: string | null;
    className: string;
    outerHTML: string;
}

/** 主题定义（保存时使用） */
interface ThemeDef {
    id: string;
    name: string;
    colors: Record<string, string>;
    [key: string]: unknown;
}

export function registerThemeBridge() {
    contextBridge.exposeInMainWorld('themeAPI', {
        loadAll: () => ipcRenderer.invoke('theme:loadAll'),
        openFolder: () => ipcRenderer.invoke('theme:openFolder'),
        openFile: (id: string) => ipcRenderer.invoke('theme:openFile', { id }),
        updateTitleBar: (colors: { bgColor: string, symbolColor: string }) => ipcRenderer.invoke('theme:updateTitleBar', colors),
        onStatusChanged: (callback: (isOpen: boolean) => void) => {
            const listener = (_: IpcRendererEvent, isOpen: boolean) => callback(isOpen);
            ipcRenderer.on('theme-editor:status-changed', listener);
            return () => ipcRenderer.off('theme-editor:status-changed', listener);
        },
        openThemeEditor: () => ipcRenderer.invoke('theme-editor:open'),
        closeThemeEditor: () => ipcRenderer.invoke('theme-editor:close'),
        isWindowOpen: () => ipcRenderer.invoke('theme-editor:is-open'),
        save: (id: string, themeDef: ThemeDef) => ipcRenderer.invoke('theme-editor:save', { id, themeDef }),
        applyPreview: (edits: Record<string, string>) => ipcRenderer.send('theme-editor:preview', edits),
        getPendingEdits: (themeId: string) => ipcRenderer.invoke('theme-editor:get-pending', themeId),
        getAllPendingEdits: () => ipcRenderer.invoke('theme-editor:get-all-pending'),
        clearAllPendingEdits: () => ipcRenderer.invoke('theme-editor:clear-all-pending'),
        setPendingEdits: (themeId: string, edits: Record<string, string> | null) => ipcRenderer.send('theme-editor:set-pending', { themeId, edits }),
        startInspectorMode: () => ipcRenderer.send('theme-editor:start-inspector'),
        stopInspectorMode: () => ipcRenderer.send('theme-editor:stop-inspector'),
        stopInspector: () => ipcRenderer.send('theme-editor:stop-inspector'),
        componentPicked: (data: ComponentPickedData) => ipcRenderer.send('theme-editor:component-picked', data),
        onComponentPicked: (callback: (data: ComponentPickedData) => void) => {
            const listener = (_: IpcRendererEvent, data: ComponentPickedData) => callback(data);
            ipcRenderer.on('theme-editor:component-picked', listener);
            return () => ipcRenderer.off('theme-editor:component-picked', listener);
        },
        onInspectorStarted: (callback: () => void) => {
            const listener = () => callback();
            ipcRenderer.on('theme-editor:start-inspector', listener);
            return () => ipcRenderer.off('theme-editor:start-inspector', listener);
        },
        onInspectorStopped: (callback: () => void) => {
            const listener = () => callback();
            ipcRenderer.on('theme-editor:inspector-stopped', listener);
            return () => ipcRenderer.off('theme-editor:inspector-stopped', listener);
        },
        getExpandedGroups: () => ipcRenderer.invoke('theme-editor:get-expanded-groups'),
        setExpandedGroups: (groups: Record<string, boolean>) => ipcRenderer.send('theme-editor:set-expanded-groups', groups),
        // 合并初始化接口：一次往返获取 pendingEdits + expandedGroups
        initData: () => ipcRenderer.invoke('theme-editor:init-data'),
        onApplyPreview: (callback: (edits: Record<string, string>) => void) => {
            const listener = (_: IpcRendererEvent, edits: Record<string, string>) => callback(edits);
            ipcRenderer.on('theme:apply-preview', listener);
            return () => ipcRenderer.off('theme:apply-preview', listener);
        },
        onEditorClosed: (callback: () => void) => {
            // 绑定 status-changed + isOpen == false
            const listener = (_: IpcRendererEvent, isOpen: boolean) => { if (!isOpen) callback(); };
            ipcRenderer.on('theme-editor:status-changed', listener);
            return () => ipcRenderer.off('theme-editor:status-changed', listener);
        },
        onReload: (callback: () => void) => {
            const listener = () => callback();
            ipcRenderer.on('theme:reload', listener);
            return () => ipcRenderer.off('theme:reload', listener);
        }
    });
}

export function registerEyedropperBridge() {
    contextBridge.exposeInMainWorld('eyedropperAPI', {
        pick: () => ipcRenderer.invoke('eyedropper:pick'),
        watchStart: () => ipcRenderer.invoke('eyedropper:watch-start'),
        watchStop: () => ipcRenderer.invoke('eyedropper:watch-stop'),
        onColor: (cb: (color: string) => void) => {
            const listener = (_: IpcRendererEvent, color: string) => cb(color);
            ipcRenderer.on('eyedropper:color', listener);
            return () => ipcRenderer.off('eyedropper:color', listener);
        },
        onPicked: (cb: (color: string) => void) => {
            const listener = (_: IpcRendererEvent, color: string) => cb(color);
            ipcRenderer.on('eyedropper:picked', listener);
            return () => ipcRenderer.off('eyedropper:picked', listener);
        },
        onCanceled: (cb: () => void) => {
            const listener = () => cb();
            ipcRenderer.on('eyedropper:canceled', listener);
            return () => ipcRenderer.off('eyedropper:canceled', listener);
        }
    });
}
