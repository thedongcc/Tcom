/**
 * com0com.ts
 * com0comAPI 适配层 — 虚拟串口驱动管理。
 * listPairs 使用注册表直读（免管理员权限），其他操作通过 setupc.exe。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerCom0comAPI(): void {
    window.com0comAPI = {
        exec: (command, silent) =>
            invoke('com0com_exec', { command, silent: silent ?? false }),

        installDriver: () =>
            invoke('com0com_install'),

        setFriendlyName: (port, name) =>
            invoke('com0com_set_friendly_name', { port, name }),

        isAdmin: () =>
            invoke('app_is_admin'),

        checkPath: (path) =>
            invoke('com0com_check_path', { path }),

        launchInstaller: () =>
            invoke('com0com_launch_installer'),

        // 注册表直读端口对（免管理员权限）
        listPairs: () =>
            invoke('com0com_list_pairs'),
    }
}
