/**
 * com0com.ipc.ts
 * 注册所有 com0com:* 相关 IPC handler（驱动安装与底层配置）。
 */
import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

// ── 命令解析 ──

function parseCommand(command: string): { exePath: string; args: string[] } {
    let exePath = '';
    let argsString = '';

    if (command.startsWith('"')) {
        const closeQuote = command.indexOf('"', 1);
        if (closeQuote > 1) {
            exePath = command.substring(1, closeQuote);
            argsString = command.substring(closeQuote + 1).trim();
        }
    } else {
        const space = command.indexOf(' ');
        if (space > 0) {
            exePath = command.substring(0, space);
            argsString = command.substring(space + 1).trim();
        } else {
            exePath = command;
        }
    }
    return { exePath, args: argsString ? argsString.split(/\s+/) : [] };
}

// ── 子进程执行（含输出收集）  ──

function spawnAndCollect(exePath: string, args: string[], cwd?: string): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string; code?: number }> {
    return new Promise(resolve => {
        const { spawn } = require('node:child_process');
        const child = spawn(exePath, args, { cwd, shell: true, windowsHide: true, env: process.env });
        let stdout = '', stderr = '';
        child.stdout.on('data', (d: any) => stdout += d.toString());
        child.stderr.on('data', (d: any) => stderr += d.toString());
        child.on('error', (err: any) => resolve({ success: false, error: err.message }));
        child.on('close', (code: number) => {
            if (code === 0) resolve({ success: true, stdout });
            else resolve({ success: false, error: `Process exited with code ${code}`, stderr, stdout, code });
        });
    });
}

// ── 执行 com0com 命令（含本地回退） ──

async function spawnCommand(command: string): Promise<any> {
    const { exePath, args } = parseCommand(command);
    const cwd = exePath.includes('\\') || exePath.includes('/') ? path.dirname(exePath) : undefined;

    const result = await spawnAndCollect(exePath, args, cwd);
    if (result.success) return result;

    // 本地安装路径回退
    if (exePath === 'setupc' || exePath === 'setupc.exe') {
        const localSetupc = path.join(app.getPath('userData'), 'drivers', 'com0com', 'setupc.exe');
        return spawnAndCollect(localSetupc, args, path.dirname(localSetupc));
    }
    return result;
}

export function registerCom0comIpc(VITE_DEV_SERVER_URL?: string) {
    ipcMain.handle('com0com:launch-installer', async () => {
        const isDev = !!VITE_DEV_SERVER_URL;
        let installerPath: string;
        if (isDev) {
            installerPath = path.join(__dirname, '../resources/drivers/com0com_setup.exe');
        } else {
            installerPath = path.join(process.resourcesPath, 'resources/drivers/com0com_setup.exe');
        }

        try {
            installerPath = installerPath.replace(/^["']|["']$/g, '');
            const stats = await fs.stat(installerPath);
            if (!stats.isFile()) return { success: false, error: '内置安装包未找到，请确认打包时包含 resources/drivers/com0com_setup.exe' };
        } catch {
            return { success: false, error: '内置安装包未找到，请确认打包时包含 resources/drivers/com0com_setup.exe' };
        }

        const { shell: eShell } = require('electron');
        const result = await eShell.openPath(installerPath);
        if (result) {
            return { success: false, error: result };
        }
        return { success: true };
    });

    ipcMain.handle('com0com:install', async () => {
        if (process.platform === 'win32') {
            const { exec } = require('node:child_process');
            const isAdmin = await new Promise((resolve) => {
                exec('net session', { windowsHide: true }, (err: any) => resolve(!err));
            });
            if (!isAdmin) {
                return { success: false, error: 'Administrator privileges required for installation' };
            }
        }

        const isDev = !!VITE_DEV_SERVER_URL;
        let installerPath = '';
        if (isDev) {
            installerPath = path.join(__dirname, '../resources/drivers/com0com_setup.exe');
        } else {
            installerPath = path.join(process.resourcesPath, 'resources/drivers/com0com_setup.exe');
        }

        const targetDir = path.join(app.getPath('userData'), 'drivers', 'com0com');

        try {
            const stats = await fs.stat(installerPath);
            if (!stats.isFile()) {
                return { success: false, error: `Installer path is not a file: ${installerPath}` };
            }
        } catch {
            return { success: false, error: `Installer not found at: ${installerPath}` };
        }

        return new Promise((resolve) => {
            const { spawn } = require('node:child_process');
            const child = spawn(installerPath, ['/S', `/D=${targetDir}`], {
                windowsHide: true,
                shell: true,
                cwd: path.dirname(installerPath)
            });

            child.on('error', (err: any) => resolve({ success: false, error: err.message }));
            child.on('close', (code: number) => {
                if (code === 0) resolve({ success: true, path: targetDir });
                else resolve({ success: false, error: `Installer exited with code ${code}` });
            });
        });
    });

    ipcMain.handle('com0com:check', async (_event, targetPath: string) => {
        try {
            targetPath = (targetPath || '').replace(/^["']|["']$/g, '');
            const filename = path.basename(targetPath).toLowerCase();
            if (filename !== 'setupc.exe') {
                return { success: false };
            }
            const stats = await fs.stat(targetPath);
            if (!stats.isFile()) return { success: false };

            return { success: true, version: null };
        } catch (e) {
            return { success: false };
        }
    });

    ipcMain.handle('com0com:exec', async (_event, command: string) => {
        if (process.platform === 'win32' && !command.toLowerCase().includes('list')) {
            const { exec } = require('node:child_process');
            const isAdmin = await new Promise((resolve) => {
                exec('net session', { windowsHide: true }, (err: any) => resolve(!err));
            });
            if (!isAdmin) {
                return { success: false, error: 'Administrator privileges required for this operation' };
            }
        }

        if (!command.toLowerCase().includes('setupc.exe')) {
            return { success: false, error: 'Unauthorized command' };
        }

        return spawnCommand(command);
    });

    ipcMain.handle('com0com:name', async (_event, { port, name }) => {
        if (!/^COM\d+$/.test(port)) return { success: false, error: 'Invalid port format' };
        const safeName = name.replace(/["\r\n]/g, '');

        const psScript = `
      $port = "${port}"
      $friendlyName = "${safeName}"
      try {
        $root = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\com0com\\port"
        if (-not (Test-Path $root)) { Write-Output "Com0com registry not found"; exit 1 }
        $foundInstance = $null
        Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
           $instanceKey = $_.PSPath
           $paramsKey = Join-Path $instanceKey "Device Parameters"
           if (Test-Path $paramsKey) {
               $p = Get-ItemProperty -Path $paramsKey -Name "PortName" -ErrorAction SilentlyContinue
               if ($p -and $p.PortName -eq $port) { $foundInstance = $instanceKey }
           }
        }
        if ($foundInstance) {
           New-ItemProperty -Path $foundInstance -Name "FriendlyName" -Value $friendlyName -PropertyType String -Force | Out-Null
           Write-Output "Success: Set $friendlyName for $foundInstance"
        } else {
           Write-Output "Port $port not found in registry"
        }
      } catch { Write-Output "Error: $_" }
    `;

        return new Promise((resolve) => {
            const { spawn } = require('node:child_process');
            const child = spawn('powershell.exe', ['-Command', psScript], { windowsHide: true });
            let out = '';
            child.stdout.on('data', (d: any) => out += d.toString());
            child.on('close', (code: number) => {
                const output = out.trim();
                if (output.includes('Success')) resolve({ success: true });
                else resolve({ success: false, error: output || `Exited with ${code}` });
            });
        });
    });
}
