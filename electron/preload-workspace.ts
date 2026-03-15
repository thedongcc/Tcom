/**
 * preload-workspace.ts
 * 会话/工作区/com0com 桥接。
 * 从 preload.ts 拆分出来，按工作区域分组。
 */
import { ipcRenderer, contextBridge } from 'electron';

export function registerSessionBridge() {
    contextBridge.exposeInMainWorld('sessionAPI', {
        save: (sessions: Record<string, unknown>[]) => ipcRenderer.invoke('session:save', sessions),
        load: () => ipcRenderer.invoke('session:load')
    });
}

export function registerWorkspaceBridge() {
    contextBridge.exposeInMainWorld('workspaceAPI', {
        getLastWorkspace: () => ipcRenderer.invoke('workspace:getLastWorkspace'),
        setLastWorkspace: (wsPath: string | null) => ipcRenderer.invoke('workspace:setLastWorkspace', wsPath),
        openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
        listSessions: (wsPath: string) => ipcRenderer.invoke('workspace:listSessions', wsPath),
        saveSession: (wsPath: string, config: Record<string, unknown>) => ipcRenderer.invoke('workspace:saveSession', wsPath, config),
        deleteSession: (wsPath: string, config: Record<string, unknown>) => ipcRenderer.invoke('workspace:deleteSession', wsPath, config),
        renameSession: (wsPath: string, oldName: string, newName: string) => ipcRenderer.invoke('workspace:renameSession', wsPath, oldName, newName),
        getRecentWorkspaces: () => ipcRenderer.invoke('workspace:getRecentWorkspaces'),
        migrateOldSessions: () => ipcRenderer.invoke('workspace:migrateOldSessions'),
    });
}

export function registerCom0comBridge() {
    contextBridge.exposeInMainWorld('com0comAPI', {
        exec: (command: string, silent?: boolean) => ipcRenderer.invoke('com0com:exec', command, silent),
        installDriver: () => ipcRenderer.invoke('com0com:install'),
        setFriendlyName: (port: string, name: string) => ipcRenderer.invoke('com0com:name', { port, name }),
        isAdmin: () => ipcRenderer.invoke('app:is-admin'),
        checkPath: (path: string) => ipcRenderer.invoke('com0com:check', path),
        launchInstaller: () => ipcRenderer.invoke('com0com:launch-installer')
    });
}
