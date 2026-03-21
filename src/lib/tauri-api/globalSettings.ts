/**
 * globalSettings.ts
 * globalSettingsAPI 适配层 — 全局设置 + 运行时状态 + 备份 IPC。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerGlobalSettingsAPI(): void {
    window.globalSettingsAPI = {
        // 全局设置
        load: () =>
            invoke('global_settings_load'),

        save: (data) =>
            invoke('global_settings_save', { data }),

        // 运行时状态
        loadState: () =>
            invoke('app_state_load'),

        saveState: (data) =>
            invoke('app_state_save', { data }),

        // 备份
        exportProfile: (profileName) =>
            invoke('backup_export_profile', { profileName }),

        importProfile: () =>
            invoke('backup_import_profile'),

        exportAll: () =>
            invoke('backup_export_all'),

        importAll: () =>
            invoke('backup_import_all'),
    }
}
