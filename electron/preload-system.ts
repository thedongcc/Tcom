/**
 * preload-system.ts
 * 应用/更新/Shell/窗口管理桥接。
 * 从 preload.ts 拆分出来，按系统域分组。
 */
import { ipcRenderer, contextBridge } from 'electron';

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
        onStatus: (callback: (data: any) => void) => {
            const listener = (_: any, data: any) => callback(data);
            ipcRenderer.on('update:status', listener);
            return () => ipcRenderer.off('update:status', listener);
        },
        onProgress: (callback: (progress: any) => void) => {
            const listener = (_: any, progress: any) => callback(progress);
            ipcRenderer.on('update:progress', listener);
            return () => ipcRenderer.off('update:progress', listener);
        }
    });
}

export function registerShellBridge() {
    contextBridge.exposeInMainWorld('shellAPI', {
        openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
        showOpenDialog: (options: any) => ipcRenderer.invoke('shell:showOpenDialog', options),
    });
}

export function registerWindowBridge() {
    contextBridge.exposeInMainWorld('windowAPI', {
        setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
        isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
    });
}
