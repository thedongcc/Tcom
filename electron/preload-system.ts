/**
 * preload-system.ts
 * 应用/更新/Shell/窗口管理桥接。
 * 从 preload.ts 拆分出来，按系统域分组。
 */
import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron';

/** 更新状态数据 */
interface UpdateStatusData {
    status: string;
    version?: string;
    error?: string;
}

/** 更新下载进度 */
interface UpdateProgressData {
    percent: number;
    bytesPerSecond?: number;
    total?: number;
    transferred?: number;
}

/** 文件对话框选项 */
interface OpenDialogOptions {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
}

export function registerAppBridge() {
    contextBridge.exposeInMainWorld('appAPI', {
        factoryReset: () => ipcRenderer.invoke('app:factory-reset')
    });
}

export function registerUpdateBridge() {
    contextBridge.exposeInMainWorld('updateAPI', {
        check: () => ipcRenderer.invoke('update:check'),
        download: () => ipcRenderer.invoke('update:download'),
        install: () => ipcRenderer.invoke('update:install'),
        getVersion: () => ipcRenderer.invoke('app:version'),
        getStats: () => ipcRenderer.invoke('system:stats'),
        listFonts: () => ipcRenderer.invoke('app:list-fonts'),
        onStatus: (callback: (data: UpdateStatusData) => void) => {
            const listener = (_: IpcRendererEvent, data: UpdateStatusData) => callback(data);
            ipcRenderer.on('update:status', listener);
            return () => ipcRenderer.off('update:status', listener);
        },
        onProgress: (callback: (progress: UpdateProgressData) => void) => {
            const listener = (_: IpcRendererEvent, progress: UpdateProgressData) => callback(progress);
            ipcRenderer.on('update:progress', listener);
            return () => ipcRenderer.off('update:progress', listener);
        }
    });
}

export function registerShellBridge() {
    contextBridge.exposeInMainWorld('shellAPI', {
        openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
        showOpenDialog: (options: OpenDialogOptions) => ipcRenderer.invoke('shell:showOpenDialog', options),
    });
}

export function registerWindowBridge() {
    contextBridge.exposeInMainWorld('windowAPI', {
        setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
        isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
    });
}
