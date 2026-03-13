/**
 * AppUpdater
 * 负责应用更新检测与自动下载安装。
 */
import { BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

export class AppUpdater {
    private win: BrowserWindow;

    constructor(win: BrowserWindow) {
        this.win = win;

        // 配置 autoUpdater
        autoUpdater.autoDownload = false; // 由 UI 手动控制下载
        autoUpdater.autoInstallOnAppQuit = true;
    }

    init() {
        autoUpdater.on('checking-for-update', () => {
            this.win.webContents.send('update:status', { type: 'checking' });
        });

        autoUpdater.on('update-available', (info) => {
            this.win.webContents.send('update:status', {
                type: 'available',
                version: info.version,
                releaseNotes: info.releaseNotes,
                releaseDate: info.releaseDate,
                releaseUrl: `https://github.com/thedongcc/Tcom/releases/tag/v${info.version}`
            });
        });

        autoUpdater.on('update-not-available', (info) => {
            this.win.webContents.send('update:status', { type: 'not-available', version: info.version });
        });

        autoUpdater.on('error', (err) => {
            this.win.webContents.send('update:status', {
                type: 'error',
                error: err.message,
                releaseUrl: 'https://github.com/thedongcc/Tcom/releases'
            });
        });

        autoUpdater.on('download-progress', (progressObj) => {
            this.win.webContents.send('update:progress', progressObj);
        });

        autoUpdater.on('update-downloaded', (info) => {
            this.win.webContents.send('update:status', { type: 'downloaded', version: info.version });
        });

        // 注册 IPC 更新指令
        ipcMain.handle('update:check', () => {
            return autoUpdater.checkForUpdates();
        });

        ipcMain.handle('update:download', () => {
            return autoUpdater.downloadUpdate();
        });

        ipcMain.handle('update:install', () => {
            autoUpdater.quitAndInstall();
        });
    }
}
