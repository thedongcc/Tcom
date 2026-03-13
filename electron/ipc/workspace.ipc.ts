/**
 * workspace.ipc.ts
 * 注册所有 workspace:* IPC handler（工作区路径管理、会话文件读写）。
 */
import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { FileWriteQueue } from '../utils/FileWriteQueue';

export function registerWorkspaceIpc(win: BrowserWindow) {
    const workspaceStateFile = path.join(app.getPath('userData'), 'workspace.json');
    const defaultWorkspacePath = path.join(app.getPath('userData'), 'DefaultWorkspace');
    const oldSessionsFile = path.join(app.getPath('userData'), 'sessions.json');

    // 获取上次打开的工作区路径
    ipcMain.handle('workspace:getLastWorkspace', async () => {
        try {
            const data = await fs.readFile(workspaceStateFile, 'utf-8');
            const state = JSON.parse(data);
            return { success: true, path: state.lastWorkspace || null };
        } catch {
            return { success: true, path: null };
        }
    });

    // 获取最近工作区列表
    ipcMain.handle('workspace:getRecentWorkspaces', async () => {
        try {
            const data = await fs.readFile(workspaceStateFile, 'utf-8');
            const state = JSON.parse(data);
            return { success: true, workspaces: state.recentWorkspaces || [] };
        } catch {
            return { success: true, workspaces: [] };
        }
    });

    // 保存当前工作区路径并更新最近列表
    ipcMain.handle('workspace:setLastWorkspace', async (_event: any, wsPath: string | null) => {
        try {
            let state: any = { lastWorkspace: null, recentWorkspaces: [] };
            try {
                const data = await fs.readFile(workspaceStateFile, 'utf-8');
                state = JSON.parse(data);
            } catch { /* ignore */ }

            if (wsPath) {
                state.lastWorkspace = wsPath;
                const currentRecent = state.recentWorkspaces || [];
                const filtered = currentRecent.filter((p: string) => p !== wsPath);
                state.recentWorkspaces = [wsPath, ...filtered].slice(0, 10);
            } else {
                state.lastWorkspace = null;
            }

            await fs.writeFile(workspaceStateFile, JSON.stringify(state, null, 2));
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 打开文件夹选择对话框
    ipcMain.handle('workspace:openFolder', async () => {
        const result = await dialog.showOpenDialog(win!, {
            properties: ['openDirectory'],
            title: 'Select Workspace Folder',
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }
        return { success: true, path: result.filePaths[0] };
    });

    // 列举工作区内所有 .json 会话文件
    ipcMain.handle('workspace:listSessions', async (_event: any, wsPath: string) => {
        try {
            await fs.mkdir(wsPath, { recursive: true });
            const files: string[] = await fs.readdir(wsPath);
            const sessions: any[] = [];
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const content = await fs.readFile(path.join(wsPath, file), 'utf-8');
                    const config = JSON.parse(content);
                    if (config && config.id && config.type) {
                        sessions.push(config);
                    }
                } catch { /* 跳过不合法的文件 */ }
            }
            return { success: true, data: sessions };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 保存单个会话配置到工作区
    ipcMain.handle('workspace:saveSession', async (_event: any, wsPath: string, config: any) => {
        try {
            await fs.mkdir(wsPath, { recursive: true });
            const safeName = config.name.replace(/[<>:"/\\|?*]/g, '_');
            const filePath = path.join(wsPath, `${safeName}.json`);

            // 使用写入队列序列化同一文件的并发写入
            await FileWriteQueue.enqueue(filePath, async () => {
                await fs.writeFile(filePath, JSON.stringify(config, null, 2));
            });

            return { success: true, filePath };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 删除工作区中的会话文件
    ipcMain.handle('workspace:deleteSession', async (_event: any, wsPath: string, config: any) => {
        try {
            const safeName = config.name.replace(/[<>:"/\\|?*]/g, '_');
            const filePath = path.join(wsPath, `${safeName}.json`);
            await fs.unlink(filePath);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 重命名工作区中的会话文件
    ipcMain.handle('workspace:renameSession', async (_event: any, wsPath: string, oldName: string, newName: string) => {
        try {
            const safeOld = oldName.replace(/[<>:"/\\|?*]/g, '_');
            const safeNew = newName.replace(/[<>:"/\\|?*]/g, '_');
            const oldPath = path.join(wsPath, `${safeOld}.json`);
            const newPath = path.join(wsPath, `${safeNew}.json`);
            await fs.rename(oldPath, newPath);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 一次性迁移旧版 sessions.json 到默认工作区
    ipcMain.handle('workspace:migrateOldSessions', async () => {
        try {
            const data = await fs.readFile(oldSessionsFile, 'utf-8');
            const sessions = JSON.parse(data);
            if (Array.isArray(sessions) && sessions.length > 0) {
                await fs.mkdir(defaultWorkspacePath, { recursive: true });
                for (const config of sessions) {
                    if (!config || !config.name) continue;
                    const safeName = config.name.replace(/[<>:"/\\|?*]/g, '_');
                    await fs.writeFile(
                        path.join(defaultWorkspacePath, `${safeName}.json`),
                        JSON.stringify(config, null, 2)
                    );
                }
                await fs.rename(oldSessionsFile, oldSessionsFile + '.bak');
                return { success: true, migrated: sessions.length, path: defaultWorkspacePath };
            }
            return { success: false, migrated: 0 };
        } catch {
            return { success: false, migrated: 0 };
        }
    });

    // 兼容旧版 session API（保持向前兼容，现为 no-op）
    ipcMain.handle('session:save', async () => ({ success: true }));
    ipcMain.handle('session:load', async () => ({ success: true, data: [] }));
}
