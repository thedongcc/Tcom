/**
 * workspace.ts
 * workspaceAPI 适配层 — 工作区管理 IPC。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerWorkspaceAPI(): void {
    window.workspaceAPI = {
        getLastWorkspace: () =>
            invoke('workspace_get_last'),

        setLastWorkspace: (wsPath) =>
            invoke('workspace_set_last', { wsPath }),

        openFolder: () =>
            invoke('workspace_open_folder'),

        listSessions: (wsPath) =>
            invoke('workspace_list_sessions', { wsPath }),

        saveSession: (wsPath, config) =>
            invoke('workspace_save_session', { wsPath, config }),

        deleteSession: (wsPath, config) =>
            invoke('workspace_delete_session', { wsPath, config }),

        renameSession: (wsPath, oldName, newName) =>
            invoke('workspace_rename_session', { wsPath, oldName, newName }),

        getRecentWorkspaces: () =>
            invoke('workspace_get_recent'),

        migrateOldSessions: () =>
            invoke('workspace_migrate_old'),

        saveSessionOrder: (wsPath, order) =>
            invoke('workspace_save_session_order', { wsPath, order }),
    }
}
