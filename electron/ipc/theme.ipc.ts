/**
 * theme.ipc.ts
 * 注册所有 theme:* 与 theme-editor:* IPC handler。
 * 颜色常量已提取到 theme-defaults.ts，编辑器窗口管理已提取到 theme-editor-window.ts。
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

import { ensureThemeFilesExists } from './theme-defaults';
import {
  getThemeEditorWindow,
  createPrewarmedThemeEditor,
  type ThemeEditorConfig,
} from './theme-editor-window';

export function registerThemeIpc(win: BrowserWindow, RENDERER_DIST: string, VITE_DEV_SERVER_URL?: string): { prewarmThemeEditor: () => void } {
  const themeDir = path.join(app.getPath('userData'), 'themes');
  const themeEditorStateFile = path.join(app.getPath('userData'), 'theme-editor-state.json');

  // 预热配置（供窗口管理模块使用）
  const editorConfig: ThemeEditorConfig = {
    mainWindow: win,
    stateFilePath: themeEditorStateFile,
    RENDERER_DIST,
    VITE_DEV_SERVER_URL,
  };

  // ─── 主题文件操作 IPC ────────────────────────────────────────────────────────

  ipcMain.handle('theme:updateTitleBar', async (_event, { bgColor, symbolColor }) => {
    if (win) {
      try {
        win.setTitleBarOverlay({
          color: bgColor,
          symbolColor: symbolColor
        });
        if (bgColor && bgColor !== 'transparent') {
          win.setBackgroundColor(bgColor);
        }
      } catch (e) {
        console.warn('Failed to update titleBarOverlay:', e);
      }
    }
  });

  ipcMain.handle('theme:loadAll', async () => {
    try {
      await ensureThemeFilesExists(themeDir);

      const files = await fs.readdir(themeDir);
      const themes: Array<{ id: string; name: string; type: string; colors: Record<string, string> }> = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(themeDir, file), 'utf-8');
            // 支持双斜杠和多行注释
            const jsonString = content.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
            const parsed = JSON.parse(jsonString);
            if (parsed && typeof parsed === 'object' && parsed.colors) {
              const baseName = path.parse(file).name;
              themes.push({
                id: baseName,
                name: baseName,
                type: parsed.type || 'dark',
                colors: parsed.colors
              });
            }
          } catch (e) {
            console.error(`Failed to parse theme file ${file}`, e);
          }
        }
      }
      return { success: true, themes };
    } catch (err: unknown) {
      console.error('Failed to load themes:', err);
      return { success: false, error: (err as Error).message, themes: [] };
    }
  });

  ipcMain.handle('theme:openFolder', async () => {
    await ensureThemeFilesExists(themeDir);
    shell.openPath(themeDir);
    return { success: true };
  });

  ipcMain.handle('theme:openFile', async (_event, { id }) => {
    try {
      await ensureThemeFilesExists(themeDir);
      const filePath = path.join(themeDir, `${id}.json`);
      // 不再覆盖写入文件，仅打开已存在的文件
      shell.openPath(filePath);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ─── 主题编辑器窗口 IPC ──────────────────────────────────────────────────────

  const prewarmThemeEditor = () => createPrewarmedThemeEditor(editorConfig);

  ipcMain.handle('theme-editor:open', async () => {
    const editorWin = getThemeEditorWindow();
    if (editorWin && !editorWin.isDestroyed()) {
      if (editorWin.isVisible()) {
        // 已打开：再次点击则切换关闭（与原行为一致）
        editorWin.close();
        return;
      }
      // 预热完毕的窗口：直接显示，接近瞬开
      editorWin.show();
      editorWin.focus();
      win?.webContents.send('theme-editor:status-changed', true);
      return;
    }

    // 保底路径：若预热失败则同步创建
    prewarmThemeEditor();
    const newEditorWin = getThemeEditorWindow();
    if (newEditorWin) {
      newEditorWin.once('ready-to-show', () => newEditorWin?.show());
      win?.webContents.send('theme-editor:status-changed', true);
    }
  });

  ipcMain.handle('theme-editor:close', async () => {
    const editorWin = getThemeEditorWindow();
    if (editorWin) {
      editorWin.close();
    }
  });

  ipcMain.handle('theme-editor:is-open', async () => {
    const editorWin = getThemeEditorWindow();
    return editorWin !== null && !editorWin.isDestroyed();
  });

  // ─── 编辑器状态与通信 IPC ────────────────────────────────────────────────────

  let pendingEditsMap: Record<string, Record<string, string>> = {};
  let expandedGroupsSettings: Record<string, boolean> = {};

  ipcMain.on('theme-editor:preview', (event, edits) => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (w.webContents.id !== event.sender.id) {
        w.webContents.send('theme:apply-preview', edits);
      }
    });
  });

  ipcMain.handle('theme-editor:get-pending', async (_, themeId) => pendingEditsMap[themeId] || null);
  ipcMain.handle('theme-editor:get-all-pending', async () => pendingEditsMap);
  ipcMain.handle('theme-editor:clear-all-pending', async () => { pendingEditsMap = {}; });
  ipcMain.on('theme-editor:set-pending', (_, { themeId, edits }) => {
    if (edits) pendingEditsMap[themeId] = edits;
    else delete pendingEditsMap[themeId];
  });

  ipcMain.handle('theme-editor:get-expanded-groups', async () => expandedGroupsSettings);
  ipcMain.on('theme-editor:set-expanded-groups', (_, groups) => {
    expandedGroupsSettings = groups;
  });

  // 合并初始化数据接口：一次往返获取编辑器所需的全部初始数据，减少串行 IPC 开销
  ipcMain.handle('theme-editor:init-data', async () => {
    return {
      pendingEdits: pendingEditsMap,
      expandedGroups: expandedGroupsSettings,
    };
  });

  ipcMain.handle('theme-editor:save', async (_, { id, themeDef }) => {
    try {
      const storePath = path.join(app.getPath('userData'), 'themes');
      await fs.mkdir(storePath, { recursive: true });
      const filePath = path.join(storePath, `${id}.json`);
      await fs.writeFile(filePath, JSON.stringify(themeDef, null, 2), 'utf-8');
      delete pendingEditsMap[id];
      win?.webContents.send('theme:reload'); // 通知主窗口刷新
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ─── Inspector 模式广播 ──────────────────────────────────────────────────────

  ipcMain.on('theme-editor:start-inspector', () => {
    // 确保所有窗口（包括编辑器窗口自身）都收到指令
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('theme-editor:start-inspector');
    });
  });

  ipcMain.on('theme-editor:stop-inspector', () => {
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('theme-editor:stop-inspector');
    });
    // 同时也通知编辑器本身停止状态
    const editorWin = getThemeEditorWindow();
    editorWin?.webContents.send('theme-editor:inspector-stopped');
    win?.webContents.send('theme-editor:inspector-stopped');
  });

  ipcMain.on('theme-editor:component-picked', (_, data) => {
    getThemeEditorWindow()?.webContents.send('theme-editor:component-picked', data);
  });

  // ─── 吸管（Eyedropper）转发 ─────────────────────────────────────────────────

  ipcMain.handle('eyedropper:pick', async () => {
    if (!win) return { success: false };
    return { success: false, message: 'Native picking not implemented in this build' };
  });

  ipcMain.handle('eyedropper:watch-start', async () => {
    win?.webContents.send('eyedropper:start');
    return { success: true };
  });

  ipcMain.handle('eyedropper:watch-stop', async () => {
    win?.webContents.send('eyedropper:stop');
    return { success: true };
  });

  // 透传吸管选中的颜色至编辑器
  ipcMain.on('eyedropper:color-update', (_, color) => {
    getThemeEditorWindow()?.webContents.send('eyedropper:color', color);
  });

  ipcMain.on('eyedropper:done', (_, color) => {
    getThemeEditorWindow()?.webContents.send('eyedropper:picked', color);
  });

  ipcMain.on('eyedropper:cancel', () => {
    getThemeEditorWindow()?.webContents.send('eyedropper:canceled');
  });

  // 返回预热函数，供 main.ts 在窗口启动后延迟调用
  return { prewarmThemeEditor };
}
