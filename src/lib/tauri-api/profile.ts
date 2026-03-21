/**
 * profile.ts
 * profileAPI 适配层 — Profile 管理 + 命令菜单/自动回复/Session IPC。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerProfileAPI(): void {
    window.profileAPI = {
        // Profile CRUD
        list: () =>
            invoke('profile_list'),

        create: (name) =>
            invoke('profile_create', { name }),

        delete: (name) =>
            invoke('profile_delete', { name }),

        rename: (oldName, newName) =>
            invoke('profile_rename', { oldName, newName }),

        duplicate: (oldName, newName) =>
            invoke('profile_duplicate', { oldName, newName }),

        // Session 管理
        listSessions: (profileName) =>
            invoke('profile_list_sessions', { profileName }),

        saveSession: (profileName, config) =>
            invoke('profile_save_session', { profileName, config }),

        deleteSession: (profileName, config) =>
            invoke('profile_delete_session', { profileName, config }),

        renameSession: (profileName, oldName, newName) =>
            invoke('profile_rename_session', { profileName, oldName, newName }),

        // 命令菜单数据
        getCommands: (profileName) =>
            invoke('profile_get_commands', { profileName }),

        saveCommands: (profileName, data) =>
            invoke('profile_save_commands', { profileName, data }),

        // 自动回复规则
        getAutoReply: (profileName) =>
            invoke('profile_get_auto_reply', { profileName }),

        saveAutoReply: (profileName, data) =>
            invoke('profile_save_auto_reply', { profileName, data }),
    }
}
