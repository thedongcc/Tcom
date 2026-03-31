/**
 * useWindowState.ts
 * 窗口位置/尺寸的持久化 Hook — 从 FullApp.tsx 中提取。
 *
 * 职责：
 * - restoreWindowState：从 localStorage 恢复上次窗口位置与尺寸
 * - 定期（每 2 秒）将当前窗口状态写回 localStorage
 * - 窗口关闭前触发一次最终保存
 */
import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';

const WINDOW_STATE_KEY = 'tcom-window-state';

interface WindowState {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
}

/** 从 localStorage 恢复窗口位置和尺寸 */
export async function restoreWindowState(): Promise<void> {
    try {
        const saved = localStorage.getItem(WINDOW_STATE_KEY);
        if (!saved) return;
        const state: WindowState = JSON.parse(saved);
        const win = getCurrentWindow();

        if (state.maximized) {
            // 先恢复非最大化状态的位置/尺寸（这样取消最大化时位置正确）
            if (state.x >= -100 && state.y >= -100 && state.width > 200 && state.height > 200) {
                await win.setPosition(new PhysicalPosition(state.x, state.y));
                await win.setSize(new PhysicalSize(state.width, state.height));
            }
            await win.maximize();
        } else {
            // 校验位置在屏幕范围内（防止窗口跑到不可见区域）
            if (state.x >= -100 && state.y >= -100 && state.width > 200 && state.height > 200) {
                await win.setPosition(new PhysicalPosition(state.x, state.y));
                await win.setSize(new PhysicalSize(state.width, state.height));
            }
        }
    } catch { /* 恢复失败时使用默认位置 */ }
}

/** 保存当前窗口位置和尺寸到 localStorage（物理像素坐标） */
async function saveWindowState(): Promise<void> {
    try {
        const win = getCurrentWindow();
        const maximized = await win.isMaximized();
        // 最大化状态下不保存位置/尺寸（保存上次非最大化的值）
        if (maximized) {
            const saved = localStorage.getItem(WINDOW_STATE_KEY);
            if (saved) {
                const prev: WindowState = JSON.parse(saved);
                prev.maximized = true;
                localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(prev));
            } else {
                localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({ x: 100, y: 100, width: 1200, height: 800, maximized: true }));
            }
            return;
        }
        // outerPosition/outerSize 返回物理像素，直接保存
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        const state: WindowState = {
            x: pos.x, y: pos.y,
            width: size.width, height: size.height,
            maximized: false,
        };
        localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
    } catch { /* 保存失败时静默忽略 */ }
}

/**
 * useWindowState
 * 挂载时定期持久化窗口状态，卸载时清理定时器。
 * restoreWindowState 由 FullApp 在 Splash 序列中手动调用（需在显示窗口前完成）。
 */
export function useWindowState(): void {
    useEffect(() => {
        // 定期保存窗口位置（窗口移动/缩放后）
        const interval = setInterval(saveWindowState, 2000);
        // 窗口关闭前保存
        const handleBeforeUnload = () => { void saveWindowState(); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);
}
