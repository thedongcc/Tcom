import { app, BrowserWindow, protocol, net } from 'electron'
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

// ⚡ Windows 高精度定时器延迟到 app ready 后加载，避免 koffi 同步加载阻塞启动

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
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
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
    // 主窗口显示后 5 秒在后台预创建主题编辑器，避免与首屏渲染竞争资源
    setTimeout(() => {
      prewarmThemeEditor();
    }, 5000);
  });

  win.on('resize', () => saveWindowState(win!));
  win.on('move', () => saveWindowState(win!));

  // 主窗口关闭时，销毁所有子窗口（含预热的主题编辑器），确保 window-all-closed 触发
  win.on('close', () => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (w !== win && !w.isDestroyed()) {
        w.destroy();
      }
    });
  });



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

// ─── 进程退出处理 ─────────────────────────────────────────────────────────────
// 场景1：关闭窗口 → 立即退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    serialService?.stopAllTimedSends();
    // 开发模式下用 taskkill 终止整个进程树（Vite + npm），避免残留
    // 必须用 detached + unref，确保 taskkill 在 Electron 退出后仍能运行
    if (VITE_DEV_SERVER_URL && process.ppid) {
      const kill = require('child_process').spawn(
        'taskkill', ['/F', '/T', '/PID', String(process.ppid)],
        { detached: true, stdio: 'ignore', windowsHide: true }
      );
      kill.unref();
    }
    app.exit(0);
  }
})

// 场景2：IDE 点击停止 / Ctrl+C → 捕获信号，跳过 cmd.exe 的批处理提示
process.on('SIGINT', () => {
  serialService?.stopAllTimedSends();
  app.exit(0);
});
process.on('SIGTERM', () => {
  serialService?.stopAllTimedSends();
  app.exit(0);
});

// 注册自定义协议权限（必须在 app.whenReady 之前）
protocol.registerSchemesAsPrivileged([
    { scheme: 'tcom-file', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } }
]);

app.whenReady().then(() => {
    // 注册 tcom-file:// 协议处理器（用于加载本地图片）
    protocol.handle('tcom-file', (request) => {
        // tcom-file:///P:/path/to/image.png → file:///P:/path/to/image.png
        const url = request.url.replace('tcom-file://', 'file://');
        return net.fetch(url);
    });
    createWindow();

    // ⚡ 延迟加载 koffi 设置高精度定时器，不阻塞启动关键路径
    setTimeout(() => enableHighResTimer(), 500);
});
