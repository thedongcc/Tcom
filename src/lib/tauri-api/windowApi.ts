/**
 * windowApi.ts
 * windowAPI 适配层 — 窗口置顶控制 + 最小化/最大化/关闭。
 * 使用 @tauri-apps/api/window 前端 API 直接控制窗口，无需 Rust Command。
 */
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function registerWindowAPI(): void {
    const win = getCurrentWindow();

    window.windowAPI = {
        setAlwaysOnTop: (flag) =>
            invoke('window_set_always_on_top', { flag }),

        isAlwaysOnTop: () =>
            invoke('window_is_always_on_top'),

        minimize: () => win.minimize(),

        maximize: () => win.maximize(),

        unmaximize: () => win.unmaximize(),

        isMaximized: () => win.isMaximized(),

        close: () => win.close(),

        toggleMaximize: async () => {
            const maximized = await win.isMaximized();
            if (maximized) {
                await win.unmaximize();
            } else {
                await win.maximize();
            }
            return !maximized;
        },
    }
}
