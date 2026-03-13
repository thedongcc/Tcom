/**
 * Window State Manager
 * 用于在重新启动应用时记住上次窗口大小和位置
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fsSync from 'node:fs';

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

export const saveWindowState = (win: BrowserWindow | null) => {
    if (win && !win.isDestroyed()) {
        // 在最小化或最大化状态时不保存坐标，避免存入类似 x: -32000 这样的极值从而导致下次“隐身”
        if (win.isMinimized() || win.isMaximized()) return;
        const bounds = win.getBounds();
        // 再次过滤异常坐标
        if (bounds.x < -10000 || bounds.y < -10000) return;
        try {
            fsSync.writeFileSync(stateFile, JSON.stringify(bounds));
        } catch (e) {
            console.error('[WindowState] Failed to save state:', e);
        }
    }
};

export const loadWindowState = () => {
    try {
        const data = fsSync.readFileSync(stateFile, 'utf8');
        return JSON.parse(data);
    } catch {
        return { width: 1000, height: 800 }; // Default
    }
};
