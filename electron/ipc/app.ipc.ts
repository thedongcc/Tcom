/**
 * app.ipc.ts
 * 注册所有 app:*, system:*, window:*, shell:* 等边缘系统杂项 IPC handler。
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fsSync from 'node:fs';
import { getAppStats } from '../utils/system-stats';

// Check if current user has administrator privileges (Cached)
let _isAdminPromise: Promise<boolean> | null = null;
const checkIsAdmin = (): Promise<boolean> => {
    if (process.platform !== 'win32') return Promise.resolve(true);
    if (!_isAdminPromise) {
        _isAdminPromise = new Promise((resolve) => {
            const { exec } = require('node:child_process');
            exec('net session', { windowsHide: true }, (err: Error | null) => resolve(!err));
        });
    }
    return _isAdminPromise;
};

export function registerAppIpc(win: BrowserWindow) {
    // --- App & System ---
    ipcMain.handle('app:version', () => app.getVersion());

    ipcMain.handle('system:stats', async () => getAppStats());

    ipcMain.handle('app:is-admin', async () => checkIsAdmin());

    ipcMain.handle('app:factory-reset', async () => {
        try {
            if (win) {
                await win.webContents.session.clearStorageData();
            }
            const userDataPath = app.getPath('userData');
            const flagPath = path.join(path.dirname(userDataPath), '.reset-pending');
            fsSync.writeFileSync(flagPath, '1', 'utf-8');

            app.relaunch();
            app.exit(0);
            return { success: true };
        } catch (err: unknown) {
            console.error('Factory reset failed:', err);
            return { success: false, error: (err as Error).message };
        }
    });

    // 枚举系统安装的字体（Windows）
    ipcMain.handle('app:list-fonts', async () => {
        if (process.platform !== 'win32') {
            return { success: true, fonts: [] };
        }
        return new Promise((resolve) => {
            const { spawn } = require('node:child_process');
            const psScript = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8
        $fonts = @()
        $regPaths = @(
          'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
          'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
        )
        foreach ($regPath in $regPaths) {
          if (Test-Path $regPath) {
            $keys = Get-ItemProperty -Path $regPath
            $keys.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
              $name = $_.Name -replace '\\s*\\(.*\\)\\s*$', '' -replace '\\s+$', ''
              if ($name -and $name.Length -gt 1) {
                $fonts += $name
              }
            }
          }
        }
        $fonts | Sort-Object -Unique | ForEach-Object { [Console]::WriteLine($_) }
      `.trim();

            const buffer = Buffer.from(psScript, 'utf16le');
            const encodedCommand = buffer.toString('base64');

            const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand], {
                windowsHide: true
            });

            const chunks: Buffer[] = [];
            let err = '';

            child.stdout.on('data', (d: Buffer) => chunks.push(d));
            child.stderr.on('data', (d: Buffer) => err += d.toString());

            child.on('close', (code: number) => {
                const out = Buffer.concat(chunks).toString('utf8');
                if (code === 0 && out.trim()) {
                    const fonts = out.split(/\r?\n/).map((f: string) => f.trim()).filter(Boolean);
                    resolve({ success: true, fonts });
                } else {
                    resolve({ success: false, fonts: [], error: err || 'Failed to list fonts' });
                }
            });
            child.on('error', (e: Error) => {
                resolve({ success: false, fonts: [], error: e.message });
            });
        });
    });

    // --- Window ---
    ipcMain.handle('window:setAlwaysOnTop', (_event, flag: boolean) => {
        win?.setAlwaysOnTop(flag);
        return { success: true, alwaysOnTop: flag };
    });

    ipcMain.handle('window:isAlwaysOnTop', () => {
        return { success: true, alwaysOnTop: win?.isAlwaysOnTop() ?? false };
    });

    // --- Shell ---
    ipcMain.handle('shell:openExternal', async (_event, url: string) => {
        await shell.openExternal(url);
    });

    ipcMain.handle('shell:showOpenDialog', async (_event, options: Record<string, unknown>) => {
        const { dialog } = require('electron');
        return await dialog.showOpenDialog(win, options);
    });
}
