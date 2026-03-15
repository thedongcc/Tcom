/**
 * theme-editor-window.ts
 * 主题编辑器子窗口的创建、预热、状态保存/恢复逻辑。
 * 从 theme.ipc.ts 拆分出来，独立管理编辑器窗口生命周期。
 */
import { BrowserWindow } from 'electron';
import path from 'node:path';
import fsSync from 'node:fs';

// ─── 窗口引用（模块内部单例） ────────────────────────────────────────────────────
let themeEditorWindow: BrowserWindow | null = null;

export function getThemeEditorWindow(): BrowserWindow | null {
    return themeEditorWindow;
}

export function setThemeEditorWindow(win: BrowserWindow | null) {
    themeEditorWindow = win;
}

// ─── 窗口状态持久化 ─────────────────────────────────────────────────────────────
export function saveThemeEditorState(stateFilePath: string) {
    if (themeEditorWindow && !themeEditorWindow.isDestroyed()) {
        if (!themeEditorWindow.isMinimized()) {
            const bounds = themeEditorWindow.getBounds();
            if (bounds.x > -5000 && bounds.y > -5000) {
                fsSync.writeFileSync(stateFilePath, JSON.stringify(bounds));
            }
        }
    }
}

// ─── 创建或预热编辑器窗口 ────────────────────────────────────────────────────────
export interface ThemeEditorConfig {
    mainWindow: BrowserWindow | null;
    stateFilePath: string;
    RENDERER_DIST: string;
    VITE_DEV_SERVER_URL?: string;
}

export function createPrewarmedThemeEditor(config: ThemeEditorConfig) {
    if (themeEditorWindow && !themeEditorWindow.isDestroyed()) return;

    const { mainWindow, stateFilePath, RENDERER_DIST, VITE_DEV_SERVER_URL } = config;

    // 读取上次保存的窗口位置
    let bounds: Partial<Electron.Rectangle> | null = null;
    try {
        if (fsSync.existsSync(stateFilePath)) {
            bounds = JSON.parse(fsSync.readFileSync(stateFilePath, 'utf8'));
        }
    } catch { /* ignore */ }

    const width = 380;
    const height = 660;

    if (!bounds && mainWindow) {
        const winBounds = mainWindow.getBounds();
        bounds = {
            x: Math.round(winBounds.x + (winBounds.width - width) / 2),
            y: Math.round(winBounds.y + (winBounds.height - height) / 2),
            width,
            height
        };
    } else if (!bounds) {
        bounds = { width, height };
    }

    const newWin = new BrowserWindow({
        ...bounds,
        width: bounds.width || width,
        height: bounds.height || height,
        minWidth: 320,
        minHeight: 500,
        parent: mainWindow || undefined,
        modal: false,
        frame: false,
        transparent: false,
        backgroundColor: '#1e1e1e',
        fullscreenable: false,
        maximizable: false,
        resizable: true,
        hasShadow: true,
        show: false, // 后台静默加载，不立即显示
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
    });

    newWin.on('resize', () => saveThemeEditorState(stateFilePath));
    newWin.on('move', () => saveThemeEditorState(stateFilePath));
    newWin.on('closed', () => {
        saveThemeEditorState(stateFilePath);
        themeEditorWindow = null;
        mainWindow?.webContents.send('theme-editor:status-changed', false);
        // 关闭后 50ms 重新预热，确保下次快速点击也是秒弹
        setTimeout(() => {
            if (!themeEditorWindow) {
                createPrewarmedThemeEditor(config);
            }
        }, 50);
    });

    if (VITE_DEV_SERVER_URL) {
        newWin.loadURL(`${VITE_DEV_SERVER_URL}#/theme-editor`);
    } else {
        newWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'theme-editor' });
    }

    themeEditorWindow = newWin;
}
