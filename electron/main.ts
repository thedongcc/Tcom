import { app, BrowserWindow } from 'electron'
import path from 'node:path'

import { saveWindowState, loadWindowState } from './utils/window-state';
import { enableHighResTimer } from './utils/high-res-timer';
import { handlePendingReset } from './utils/reset-handler';

import { SerialService } from './services/SerialService';
import { MonitorService } from './services/MonitorService';
import { TcpService } from './services/TcpService';
import { AppUpdater } from './services/AppUpdater';

import { registerAllIPC } from './ipc/index';

// ─── 将所有数据重定向到安装目录旁的 data/ 文件夹 ─────────────────────────────────────
const customDataPath = app.isPackaged
  ? path.join(path.dirname(app.getPath('exe')), 'data')
  : path.join(app.getAppPath(), 'dev-data');

app.setPath('userData', customDataPath);

// ─── 启动时检查「重置待执行」标记 ────────────────────────────────────────────────────
handlePendingReset(app.getPath('userData'), customDataPath);

// --- Global Exception Handler (Anti-Crash) ---
process.on('uncaughtException', (error) => {
  const msg = error?.message || String(error);
  if (msg.includes('Operation aborted') || msg.includes('GetOverlappedResult')) {
    console.error('[Main] Intercepted non-controlled SerialPort error to prevent crash:', msg);
    return;
  }
  console.error('[Main] Uncaught Exception:', error);
});

// ⚡ Windows 高精度定时器 (设置 1ms 精度)
enableHighResTimer();

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let serialService: SerialService | null = null
let monitorService: MonitorService | null = null
let tcpService: TcpService | null = null

function createWindow() {
  const state = loadWindowState();

  win = new BrowserWindow({
    ...state,
    icon: VITE_DEV_SERVER_URL
      ? path.join(__dirname, '../resources/icons/icon.png')
      : path.join(process.resourcesPath, 'resources/icons/icon.png'),
    backgroundColor: '#1e1e1e',
    show: false, // 等 ready-to-show 再显示，彻底消除空白帧
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#3c3c3c',
      symbolColor: '#cccccc',
      height: 29
    },
  })

  // 1. 初始化独立服务
  serialService = new SerialService(win)
  monitorService = new MonitorService(win)
  tcpService = new TcpService(win.webContents)

  const updater = new AppUpdater(win);
  updater.init(); // Updater 自己注册了 update:* 事件

  // 2. 注册所有路由级 IPC 中间件
  const { prewarmThemeEditor } = registerAllIPC(
    win,
    { serialService, monitorService, tcpService },
    RENDERER_DIST,
    VITE_DEV_SERVER_URL
  );

  win.once('ready-to-show', () => {
    win?.show();
    // 主窗口显示后 1 秒在后台预创建主题编辑器，消除首次打开的冷启动延迟
    setTimeout(() => {
      prewarmThemeEditor();
    }, 1000);
  });

  win.on('resize', () => saveWindowState(win!));
  win.on('move', () => saveWindowState(win!));

  // 测试推送消息
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// macOS dock 处理
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.whenReady().then(createWindow)
