/**
 * workspace.ipc.ts
 * 注册所有 workspace:* IPC handler（工作区路径管理、会话文件读写）。
 */
import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { FileWriteQueue } from '../utils/FileWriteQueue';

// ── 路径安全校验 ──

/** 校验结果统一类型 */
interface ValidationResult {
    valid: boolean;
    /** 校验通过时填充 */
    resolved?: string;
    /** 校验通过（requireString）时填充 */
    value?: string;
    /** 校验失败时填充 */
    error?: string;
}

/**
 * 校验工作区路径是否合法。
 * 防止路径遍历攻击：拦截空字符串和包含 ".." 的相对路径。
 * 允许用户通过对话框选择的任意绝对路径（这是正常使用场景）。
 */
function validatePath(inputPath: unknown): ValidationResult {
    if (typeof inputPath !== 'string' || inputPath.trim() === '') {
        return { valid: false, error: 'Invalid workspace path: must be a non-empty string' };
    }

    const trimmed = inputPath.trim();

    // 拦截包含路径遍历序列的输入（攻击特征：含 .. 片段）
    const normalized = trimmed.replace(/\\/g, '/');
    if (normalized.split('/').some(part => part === '..')) {
        return { valid: false, error: 'Access denied: path traversal sequences are not allowed' };
    }

    // 必须是绝对路径（由对话框选择保证），拒绝相对路径
    const isAbsolute = /^([A-Za-z]:[\\/]|\/|\\\\)/.test(trimmed);
    if (!isAbsolute) {
        return { valid: false, error: 'Invalid workspace path: must be an absolute path' };
    }

    const resolved = path.resolve(trimmed);
    return { valid: true, resolved };
}

/** 校验字符串类型参数是否合法 */
function requireString(value: unknown, fieldName: string): ValidationResult {
    if (typeof value !== 'string' || value.trim() === '') {
        return { valid: false, error: `Invalid parameter: '${fieldName}' must be a non-empty string` };
    }
    return { valid: true, value: value.trim() };
}


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
    ipcMain.handle('workspace:listSessions', async (_event: unknown, wsPath: unknown) => {
        // 路径安全校验
        const pathCheck = validatePath(wsPath);
        if (!pathCheck.valid) return { success: false, error: pathCheck.error };
        const safePath = pathCheck.resolved;

        try {
            await fs.mkdir(safePath, { recursive: true });
            const files: string[] = await fs.readdir(safePath);
            const sessions: unknown[] = [];
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const content = await fs.readFile(path.join(safePath, file), 'utf-8');
                    const config: unknown = JSON.parse(content);
                    if (config && typeof config === 'object' && 'id' in config && 'type' in config) {
                        sessions.push(config);
                    }
                } catch { /* 跳过不合法的文件 */ }
            }
            return { success: true, data: sessions };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });

    // 保存单个会话配置到工作区
    ipcMain.handle('workspace:saveSession', async (_event: unknown, wsPath: unknown, config: unknown) => {
        // 路径安全校验
        const pathCheck = validatePath(wsPath);
        if (!pathCheck.valid) return { success: false, error: pathCheck.error };
        const safeDirPath = pathCheck.resolved;

        // 配置合法性校验
        if (!config || typeof config !== 'object' || !('name' in config) || typeof (config as Record<string, unknown>).name !== 'string') {
            return { success: false, error: 'Invalid session config: missing or invalid name field' };
        }
        const sessionConfig = config as Record<string, unknown>;

        try {
            await fs.mkdir(safeDirPath, { recursive: true });
            const safeName = (sessionConfig.name as string).replace(/[<>:"/\\|?*]/g, '_');
            const filePath = path.join(safeDirPath, `${safeName}.json`);

            // 使用写入队列序列化同一文件的并发写入
            await FileWriteQueue.enqueue(filePath, async () => {
                await fs.writeFile(filePath, JSON.stringify(sessionConfig, null, 2));
            });

            return { success: true, filePath };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });

    // 删除工作区中的会话文件
    ipcMain.handle('workspace:deleteSession', async (_event: unknown, wsPath: unknown, config: unknown) => {
        // 路径安全校验
        const pathCheck = validatePath(wsPath);
        if (!pathCheck.valid) return { success: false, error: pathCheck.error };
        const safeDirPath = pathCheck.resolved;

        // 配置合法性校验
        if (!config || typeof config !== 'object' || !('name' in config) || typeof (config as Record<string, unknown>).name !== 'string') {
            return { success: false, error: 'Invalid session config: missing or invalid name field' };
        }
        const sessionConfig = config as Record<string, unknown>;

        try {
            const safeName = (sessionConfig.name as string).replace(/[<>:"/\\|?*]/g, '_');
            const filePath = path.join(safeDirPath, `${safeName}.json`);
            await fs.unlink(filePath);
            return { success: true };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });

    // 重命名工作区中的会话文件
    ipcMain.handle('workspace:renameSession', async (_event: unknown, wsPath: unknown, oldName: unknown, newName: unknown) => {
        // 路径安全校验
        const pathCheck = validatePath(wsPath);
        if (!pathCheck.valid) return { success: false, error: pathCheck.error };
        const safeDirPath = pathCheck.resolved;

        // 名称参数校验
        const oldCheck = requireString(oldName, 'oldName');
        if (!oldCheck.valid) return { success: false, error: oldCheck.error };
        const newCheck = requireString(newName, 'newName');
        if (!newCheck.valid) return { success: false, error: newCheck.error };

        try {
            const safeOld = oldCheck.value.replace(/[<>:"/\\|?*]/g, '_');
            const safeNew = newCheck.value.replace(/[<>:"/\\|?*]/g, '_');
            const oldPath = path.join(safeDirPath, `${safeOld}.json`);
            const newPath = path.join(safeDirPath, `${safeNew}.json`);
            await fs.rename(oldPath, newPath);
            return { success: true };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
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
