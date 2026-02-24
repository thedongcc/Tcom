import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

// --- Global Exception Handler (Anti-Crash) ---
// Windows SerialPort (GetOverlappedResult) sometimes throws uncatchable errors
// when a port (especially com0com) is closed while I/O is pending.
process.on('uncaughtException', (error) => {
  const msg = error?.message || String(error);
  if (msg.includes('Operation aborted') || msg.includes('GetOverlappedResult')) {
    console.error('[Main] Intercepted non-controlled SerialPort error to prevent crash:', msg);
    return; // Prevent app exit
  }
  console.error('[Main] Uncaught Exception:', error);
  // Optional: check if we should app.quit() for other errors
});

// --- File Write Queue to prevent corruption during concurrent saves ---
class FileWriteQueue {
  private static queues: Map<string, Promise<void>> = new Map();

  static async enqueue(filePath: string, writeFn: () => Promise<void>) {
    const existing = this.queues.get(filePath) || Promise.resolve();
    const next = existing.then(async () => {
      try {
        await writeFn();
      } catch (err) {
        console.error(`[WriteQueue] Failed to write to ${filePath}:`, err);
        throw err;
      }
    });

    this.queues.set(filePath, next);

    // Clean up queue after completion
    next.finally(() => {
      if (this.queues.get(filePath) === next) {
        this.queues.delete(filePath);
      }
    });

    return next;
  }
}

// --- SerialPort Management ---
let SerialPortClass: any = null;
function getSerialPort() {
  if (!SerialPortClass) {
    SerialPortClass = require('serialport').SerialPort || require('serialport');
  }
  return SerialPortClass;
}

class SerialService {
  private ports: Map<string, any> = new Map();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  // List available ports
  async listPorts(options?: { includeCom0ComNames?: boolean }) {
    try {
      const SP = getSerialPort();
      // @ts-ignore
      let ports = [];
      try {
        if (SP) {
          ports = await SP.list();
        }
      } catch (e) {
        console.warn('SerialPort.list failed, falling back to registry', e);
      }

      // Windows Registry Fallback (for com0com and others)
      if (process.platform === 'win32') {
        try {
          const { exec } = require('node:child_process');

          // 1. Get active COM ports map from Hardware DeviceMap
          const activePorts = new Map<string, string>();

          await new Promise<void>((resolve) => {
            exec('reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM', { windowsHide: true }, (err: any, stdout: string) => {
              if (!err && stdout) {
                const lines = stdout.split('\r\n');
                lines.forEach(line => {
                  const parts = line.trim().split(/\s{4,}/);
                  if (parts.length >= 3) {
                    const portName = parts[parts.length - 1];
                    if (portName && portName.startsWith('COM')) {
                      activePorts.set(portName, parts[0]);
                    }
                  }
                });
              }
              resolve();
            });
          });

          // 2. Get Friendly Names from Enum (Recursive) - Only if requested
          const friendlyNames = new Map<string, string>();
          if (options?.includeCom0ComNames) {
            await new Promise<void>((resolve) => {
              exec('reg query HKLM\\SYSTEM\\CurrentControlSet\\Enum\\com0com /s', { windowsHide: true }, (err: any, stdout: string) => {
                if (!err && stdout) {
                  const enumLines = stdout.split('\r\n');
                  enumLines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('FriendlyName') && trimmed.includes('REG_SZ')) {
                      const parts = trimmed.split(/\s{4,}/);
                      if (parts.length >= 3) {
                        const name = parts[parts.length - 1];
                        const match = name.match(/\((COM\d+)\)$/);
                        if (match) friendlyNames.set(match[1], name);
                      }
                    }
                  });
                }
                resolve();
              });
            });
          }

          // 3. Merge into ports list
          activePorts.forEach((device, portName) => {
            const exists = ports.find((p: any) => p.path === portName);
            const friendly = friendlyNames.get(portName);

            let manufacturer = undefined;
            if (device.toLowerCase().includes('com0com')) {
              manufacturer = 'com0com';
            } else if (device.toLowerCase().includes('bthmodem')) {
              manufacturer = 'Microsoft (Bluetooth)';
            }

            if (exists) {
              if (friendly && (!exists.friendlyName || exists.friendlyName === portName || exists.friendlyName.includes('Serial Port'))) {
                exists.friendlyName = friendly;
              }
            } else {
              ports.push({
                path: portName,
                manufacturer: manufacturer,
                friendlyName: friendly || (manufacturer ? `${manufacturer} Port (${portName})` : `Serial Port (${portName})`),
                pnpId: device
              });
            }
          });
        } catch (e) {
          console.warn('Registry lookup failed', e);
        }
      }

      // 4. Check busy status for each port
      const openedPaths = new Set(Array.from(this.ports.values()).map(p => p.path));

      const portsWithStatus = await Promise.all(ports.map(async (port: any) => {
        if (openedPaths.has(port.path)) {
          return { ...port, busy: false, status: 'available' };
        }

        return new Promise((resolve) => {
          const p = new SP({
            path: port.path,
            baudRate: 9600,
            autoOpen: false
          });

          p.open((err: any) => {
            if (err) {
              const errorMsg = err.message || '';
              const isBusy = errorMsg.includes('Access denied') || errorMsg.includes('File not found') || errorMsg.includes('busy');
              resolve({
                ...port,
                busy: isBusy,
                status: isBusy ? 'busy' : 'error',
                error: errorMsg
              });
            } else {
              p.close(() => {
                resolve({ ...port, busy: false, status: 'available' });
              });
            }
          });
        });
      }));

      return { success: true, ports: portsWithStatus };
    } catch (error: any) {
      console.error('Error listing ports:', error);
      return { success: false, error: error.message };
    }
  }

  // Open a port
  async open(connectionId: string, options: { path: string; baudRate: number; dataBits?: 5 | 6 | 7 | 8; stopBits?: 1 | 1.5 | 2; parity?: 'none' | 'even' | 'mark' | 'odd' | 'space' }) {
    if (this.ports.has(connectionId)) {
      await this.close(connectionId);
    }

    const SP = getSerialPort();
    return new Promise((resolve) => {
      const port = new SP({
        path: options.path,
        baudRate: options.baudRate,
        dataBits: options.dataBits || 8,
        stopBits: options.stopBits || 1,
        parity: options.parity || 'none',
        autoOpen: false,
      });

      port.open((err: any) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          this.ports.set(connectionId, port);

          // Setup listeners with connectionId
          port.on('data', (data: any) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('serial:data', { connectionId, data });
            }
          });

          port.on('close', () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('serial:closed', { connectionId });
            }
            this.ports.delete(connectionId);
          });

          port.on('error', (err: any) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('serial:error', { connectionId, error: err.message });
            }
          });

          resolve({ success: true });
        }
      });
    });
  }

  // Close the port
  async close(connectionId: string) {
    return new Promise((resolve) => {
      const port = this.ports.get(connectionId);
      if (port && port.isOpen) {
        port.close((err: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            this.ports.delete(connectionId);
            resolve({ success: true });
          }
        });
      } else {
        this.ports.delete(connectionId); // Ensure cleanup if it was somehow in map but closed or null
        resolve({ success: true });
      }
    });
  }

  // Write data
  async write(connectionId: string, data: string | number[]) {
    return new Promise((resolve) => {
      const port = this.ports.get(connectionId);
      if (port && port.isOpen) {
        const payload = typeof data === 'string' ? data : Buffer.from(data);
        port.write(payload, (err: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      } else {
        resolve({ success: false, error: 'Port not open' });
      }
    });
  }
}

class MonitorService {
  private mainWindow: BrowserWindow;
  // Map<sessionId, { internal: SerialPort, physical: SerialPort }>
  // Map<sessionId, { internal: SerialPort, physical: SerialPort, pollTimer?: NodeJS.Timeout }>
  private sessions: Map<string, { internal: any; physical: any; pollTimer?: NodeJS.Timeout, isStopping?: boolean }> = new Map();
  private writeQueues: Map<string, Map<'virtual' | 'physical', Promise<void>>> = new Map();

  private async enqueueWrite(sessionId: string, target: 'virtual' | 'physical', writeFn: () => Promise<any>) {
    const session = this.sessions.get(sessionId);
    if (!session || session.isStopping) return Promise.resolve();

    if (!this.writeQueues.has(sessionId)) {
      this.writeQueues.set(sessionId, new Map());
    }
    const sessionQueues = this.writeQueues.get(sessionId)!;
    const existing = sessionQueues.get(target) || Promise.resolve();

    const next = existing
      .then(async () => {
        const currentSession = this.sessions.get(sessionId);
        if (!currentSession || currentSession.isStopping) return;

        // Force a timeout for the write operation itself to prevent queue deadlocks
        let isDone = false;
        await Promise.race([
          writeFn().finally(() => { isDone = true; }),
          new Promise(resolve => setTimeout(() => {
            if (!isDone) console.warn(`[Monitor] Write task for ${target} timed out in queue, forcing release.`);
            resolve(true);
          }, 1500))
        ]);
      })
      .catch(err => {
        console.error(`[Monitor] Queue write error for ${target}:`, err.message);
      });

    sessionQueues.set(target, next);
    return next;
  }

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  private formatPath(path: string) {
    if (!path) return path;
    return path.replace(/^\\\\.\\/, '');
  }

  async start(sessionId: string, config: any) {
    // 使用局部变量保持对实例的引用，并在 openWithTracking 中实时同步
    let internal: any = null;
    let physical: any = null;
    let pollTimer: NodeJS.Timeout | null = null;

    try {
      const SP = getSerialPort();
      if (this.sessions.has(sessionId)) {
        await this.stop(sessionId);
      }

      const internalPortPath = config.pairedPort || config.internalPort;
      const physicalPortPath = config.physicalSerialPort || config.physicalPort;
      const baudRate = config.connection?.baudRate || config.baudRate || 9600;

      console.log(`[Monitor] Starting session ${sessionId}`);

      if (!internalPortPath || !physicalPortPath) {
        throw new Error('Missing port configuration');
      }

      const setupEvents = (source: any, target: any, label: string, sourceType: 'TX' | 'RX', path: string) => {
        // 重置监听，防止多重绑定
        source.removeAllListeners('data');
        source.removeAllListeners('error');
        source.removeAllListeners('close');

        source.on('data', (data: any) => {
          // Use queue to avoid overlapping I/O
          this.enqueueWrite(sessionId, sourceType === 'TX' ? 'physical' : 'virtual', () => {
            return new Promise((resolve) => {
              if (target && target.isOpen) {
                target.write(data, (err: any) => {
                  if (err) console.error(`[Monitor] Forwarding error from ${label}:`, err.message);
                  resolve(true); // Always resolve to let next item in queue run
                });
              } else {
                resolve(true);
              }
            });
          });

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('monitor:data', { sessionId, type: sourceType, data });
          }
        });

        source.on('error', (err: any) => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('monitor:error', { sessionId, error: `${label} (${this.formatPath(path)}): ${err.message}` });
          }
        });

        source.on('close', () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('monitor:closed', { sessionId, origin: label, path: this.formatPath(path) });
          }
        });
      };

      // 封装开启逻辑，并实时同步实例引用到作用域变量，确保 catch 块可以全局清理
      const openWithTracking = async (path: string, label: string, isInternal: boolean) => {
        let currentPath = path;
        let port = new SP({ path: currentPath, baudRate, autoOpen: false });

        // 关键：立即同步引用
        if (isInternal) internal = port; else physical = port;

        const attemptOpen = (p: any) => new Promise((resolve, reject) => {
          p.open((err: any) => err ? reject(err) : resolve(p));
        });

        try {
          return await attemptOpen(port);
        } catch (err: any) {
          if (process.platform === 'win32' && (err.message.includes('File not found') || err.message.includes('Access denied'))) {
            const retryPath = currentPath.startsWith('\\\\.\\') ? currentPath : `\\\\.\\${currentPath}`;
            if (retryPath !== currentPath) {
              console.log(`[Monitor] Retrying ${label} with ${retryPath}`);

              // 释放旧对象句柄
              port.close(() => { });

              const retryPort = new SP({ path: retryPath, baudRate, autoOpen: false });
              // 关键：更新引用
              if (isInternal) internal = retryPort; else physical = retryPort;

              try {
                return await attemptOpen(retryPort);
              } catch (retryErr: any) {
                let msg = retryErr.message;
                const simpleRetryPath = this.formatPath(retryPath);
                if (msg.includes('Access denied')) {
                  msg = `Selected Port: ${simpleRetryPath} is occupied (Access Denied)`;
                } else if (msg.includes('File not found')) {
                  msg = `Selected Port: ${simpleRetryPath} not found`;
                }
                throw new Error(msg);
              }
            }
          }

          let msg = err.message;
          const simpleCurrentPath = this.formatPath(currentPath);
          if (msg.includes('Access denied')) {
            msg = `Selected Port: ${simpleCurrentPath} is occupied (Access Denied)`;
          } else if (msg.includes('File not found')) {
            msg = `Selected Port: ${simpleCurrentPath} not found`;
          }
          throw new Error(msg);
        }
      };

      // 并行开启
      const [iP, pP] = await Promise.all([
        openWithTracking(internalPortPath, 'Internal', true),
        openWithTracking(physicalPortPath, 'Physical', false)
      ]);

      // 绑定转发逻辑（必须在两个都打开后执行）
      setupEvents(iP, pP, 'Internal', 'TX', internalPortPath);
      setupEvents(pP, iP, 'Physical', 'RX', physicalPortPath);

      let lastPartnerStatus = false;
      pollTimer = setInterval(async () => {
        try {
          if (internal && internal.isOpen) {
            const signals = await internal.getControlSignals();
            const isPartnerOpen = !!(signals.carrierDetect || signals.dsr || signals.cts);
            if (isPartnerOpen !== lastPartnerStatus) {
              lastPartnerStatus = isPartnerOpen;
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('monitor:partner-status', { sessionId, connected: isPartnerOpen });
              }
            }
          }
        } catch { }
      }, 1000);

      this.sessions.set(sessionId, { internal, physical, pollTimer });
      return { success: true };
    } catch (error: any) {
      console.error(`[Monitor] Start failed for session ${sessionId}, executing cleanup.`, error.message);

      if (pollTimer) clearInterval(pollTimer);

      // 在清理时强制移除所有监听器，避免触发逻辑死循环或多重报错
      internal?.removeAllListeners();
      physical?.removeAllListeners();

      const forceClose = (p: any) => new Promise(resolve => {
        if (!p) return resolve(true);
        p.close(() => resolve(true));
      });

      // 同时清理物理和虚拟端口句柄
      await Promise.all([forceClose(internal), forceClose(physical)]);

      return { success: false, error: error.message };
    }
  }

  async stop(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session?.pollTimer) {
      clearInterval(session.pollTimer);
    }
    if (!session) return { success: true };

    const closePort = (port: any) => new Promise(resolve => {
      if (port) {
        // 关键：立即移除所有监听器，并直接关闭，不再执行可能 hang 的 flush/drain
        port.removeAllListeners();
        if (port.isOpen) {
          port.close((err: any) => {
            if (err) console.error('[Monitor] Port close error (ignored):', err.message);
            resolve(true);
          });
        } else {
          resolve(true);
        }
      } else {
        resolve(true);
      }
    });

    if (session) session.isStopping = true;

    await Promise.all([closePort(session.internal), closePort(session.physical)]);
    this.sessions.delete(sessionId);
    this.writeQueues.delete(sessionId);
    return { success: true };
  }

  // Write directly (Injection)
  async write(sessionId: string, target: 'virtual' | 'physical', data: string | number[]) {
    console.log(`[Monitor] Write request: Session=${sessionId}, Target=${target}, DataLen=${data.length}`);
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[Monitor] Write failed: Session ${sessionId} not found`);
      return { success: false, error: 'Session not found' };
    }


    const port = target === 'virtual' ? session.internal : session.physical;
    // Note: Writing to 'virtual' (Internal) means sending TO the App (via the pair).
    // Writing to 'physical' means sending TO the device.

    if (!port || !port.isOpen) {
      return { success: false, error: 'Target port not open' };
    }

    return new Promise(async (resolve) => {
      const payload = typeof data === 'string' ? data : Buffer.from(data);

      this.enqueueWrite(sessionId, target, () => {
        return new Promise((innerResolve) => {
          let timeoutId = setTimeout(() => {
            console.error(`[Monitor] Injection write timeout for ${target}`);
            innerResolve(true);
            resolve({ success: false, error: 'Write timed out' });
          }, 1000);

          try {
            port.write(payload, async (err: any) => {
              if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null as any;
              }
              if (err) {
                let errorMsg = err.message;
                if (target === 'virtual' && port.isOpen) {
                  try {
                    const signals = await port.getControlSignals();
                    if (!signals.carrierDetect && !signals.dsr && !signals.cts) {
                      errorMsg = "Write failed: Partner software (external port) is not open.";
                    }
                  } catch (e) { /* ignore */ }
                }
                console.error(`[Monitor] Injection write error:`, errorMsg);
                innerResolve(true);
                resolve({ success: false, error: errorMsg });
              } else {
                innerResolve(true);
                resolve({ success: true });
              }
            });
          } catch (syncErr: any) {
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null as any;
            }
            console.error(`[Monitor] Injection write sync error:`, syncErr.message);
            innerResolve(true);
            resolve({ success: false, error: syncErr.message });
          }
        });
      });
    });
  }
}

// The built directory structure
//
// ├─┬─ dist
// │ ├─- index.html
// │ ├── icon.svg
// │ ├── icon.ico
// ├─┬─ dist-electron
// │ ├── main.js
// │ └── preload.js
//
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let serialService: SerialService | null = null
let monitorService: MonitorService | null = null

const stateFile = path.join(app.getPath('userData'), 'window-state.json');
const saveState = () => {
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    require('fs').writeFileSync(stateFile, JSON.stringify(bounds));
  }
};

const loadState = () => {
  try {
    const data = require('fs').readFileSync(stateFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { width: 1000, height: 800 }; // Default
  }
};

function createWindow() {
  const state = loadState();

  win = new BrowserWindow({
    ...state,
    icon: VITE_DEV_SERVER_URL
      ? path.join(__dirname, '../resources/icons/icon.png')
      : path.join(process.resourcesPath, 'resources/icons/icon.png'),
    backgroundColor: '#1e1e1e', // Fix white flash
    show: true, // Show immediately
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    // frame: false, // Commented out to enable native window behavior (Aero Snap)
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#3c3c3c', // Matches --titlebar-background
      symbolColor: '#cccccc',
      height: 29
    },
  })

  win.once('ready-to-show', () => {
    win?.show();
  });

  win.on('resize', () => saveState());
  win.on('move', () => saveState());

  // Initialize SerialService
  serialService = new SerialService(win)
  // Initialize MonitorService
  monitorService = new MonitorService(win)

  // Register IPC Handlers
  ipcMain.handle('serial:list-ports', async (_event, options) => {
    if (!serialService) return { success: false, error: 'Serial service not initialized' };
    return serialService.listPorts(options);
  })

  ipcMain.handle('serial:open', async (_event, { connectionId, options }) => {
    return serialService?.open(connectionId, options)
  })

  ipcMain.handle('serial:close', async (_event, { connectionId }) => {
    return serialService?.close(connectionId)
  })

  ipcMain.handle('serial:write', async (_event, { connectionId, data }) => {
    return serialService?.write(connectionId, data)
  })

  // Monitor IPC
  ipcMain.handle('monitor:start', async (_event, { sessionId, config }) => {
    return monitorService?.start(sessionId, config);
  });

  ipcMain.handle('monitor:stop', async (_event, { sessionId }) => {
    return monitorService?.stop(sessionId);
  });

  ipcMain.handle('monitor:write', async (_event, { sessionId, target, data }) => {
    return monitorService?.write(sessionId, target, data);
  });

  // Theme IPC
  const DEFAULT_DARK_COLORS = {
    '--app-background': '#1e1e1e',
    '--app-foreground': '#cccccc',
    '--sidebar-background': '#252526',
    '--activitybar-background': '#333333',
    '--statusbar-background': '#252526',
    '--statusbar-debugging-background': '#cc6633',
    '--titlebar-background': '#3c3c3c',
    '--panel-background': '#1e1e1e',
    '--border-color': '#2b2b2b',
    '--widget-border-color': '#454545',
    '--input-background': '#3c3c3c',
    '--input-foreground': '#cccccc',
    '--input-border-color': '#3c3c3c',
    '--input-placeholder-color': '#a6a6a6',
    '--hover-background': '#2a2d2e',
    '--selection-background': '#094771',
    '--accent-color': '#007acc',
    '--focus-border-color': '#007acc',
    '--list-hover-background': '#2a2d2e',
    '--list-active-background': '#37373d',
    '--editor-background': '#1e1e1e',
    '--widget-background': '#252526',
    '--dropdown-background': '#1f1f1f',
    '--dropdown-border-color': '#454545',
    '--dropdown-item-hover-background': '#094771',
    '--dropdown-item-selected-foreground': '#ffffff',
    '--checkbox-background': '#007acc',
    '--checkbox-border-color': '#007acc',
    '--checkbox-foreground': '#ffffff',
    '--settings-header-background': '#252526',
    '--settings-row-hover-background': '#2a2d2e',
    '--scrollbar-shadow-color': '#000000',
    '--scrollbar-slider-color': '#79797966',
    '--scrollbar-slider-hover-color': '#646464bb',
    '--scrollbar-slider-active-color': '#bfbfbf66',
    '--button-background': '#0e639c',
    '--button-foreground': '#ffffff',
    '--button-hover-background': '#1177bb',
    '--button-secondary-background': '#3c3c3c',
    '--button-secondary-hover-background': '#4a4a4a',
    '--link-foreground': '#3794ff',
    '--activitybar-inactive-foreground': '#858585',
    '--menu-background': '#252526',
    '--menu-foreground': '#cccccc',
    '--menu-border-color': '#454545',
    '--st-rx-text': '#cccccc',
    '--st-tx-text': '#ce9178',
    '--st-rx-label': '#6a9955',
    '--st-tx-label': '#d16969',
    '--st-info-text': '#9cdcfe',
    '--st-error-text': '#f48771',
    '--st-timestamp': '#569cd6',
    '--st-rx-bg': '#1e1e1e',
    '--st-input-bg': '#1e1e1e',
    '--st-input-text': '#d4d4d4',
    '--st-token-crc': '#4ec9b0',
    '--st-token-flag': '#c586c0',
    '--st-accent': '#007acc'
  };

  const DEFAULT_LIGHT_COLORS = {
    '--app-background': '#ffffff',
    '--app-foreground': '#333333',
    '--sidebar-background': '#f3f3f3',
    '--activitybar-background': '#2c2c2c',
    '--statusbar-background': '#e8e8e8',
    '--statusbar-debugging-background': '#cc6633',
    '--titlebar-background': '#dddddd',
    '--panel-background': '#ffffff',
    '--border-color': '#e4e4e4',
    '--widget-border-color': '#e4e4e4',
    '--input-background': '#ffffff',
    '--input-foreground': '#333333',
    '--input-border-color': '#cecece',
    '--input-placeholder-color': '#a6a6a6',
    '--hover-background': '#e8e8e8',
    '--selection-background': '#add6ff',
    '--accent-color': '#007acc',
    '--focus-border-color': '#0090f1',
    '--list-hover-background': '#e8e8e8',
    '--list-active-background': '#e4e6f1',
    '--editor-background': '#ffffff',
    '--widget-background': '#f3f3f3',
    '--dropdown-background': '#f3f3f3',
    '--dropdown-border-color': '#d4d4d4',
    '--dropdown-item-hover-background': '#add6ff',
    '--dropdown-item-selected-foreground': '#000000',
    '--checkbox-background': '#007acc',
    '--checkbox-border-color': '#007acc',
    '--checkbox-foreground': '#ffffff',
    '--settings-header-background': '#f3f3f3',
    '--settings-row-hover-background': '#e8e8e8',
    '--scrollbar-shadow-color': '#dddddd',
    '--scrollbar-slider-color': '#64646466',
    '--scrollbar-slider-hover-color': '#646464bb',
    '--scrollbar-slider-active-color': '#00000099',
    '--button-background': '#007acc',
    '--button-foreground': '#ffffff',
    '--button-hover-background': '#0062a3',
    '--button-secondary-background': '#e4e4e4',
    '--button-secondary-hover-background': '#d4d4d4',
    '--link-foreground': '#006ab1',
    '--activitybar-inactive-foreground': '#858585',
    '--menu-background': '#ffffff',
    '--menu-foreground': '#333333',
    '--menu-border-color': '#cecece',
    '--st-rx-text': '#333333',
    '--st-tx-text': '#a31515',
    '--st-rx-label': '#008000',
    '--st-tx-label': '#cd3131',
    '--st-info-text': '#0000ff',
    '--st-error-text': '#cd3131',
    '--st-timestamp': '#0000ff',
    '--st-rx-bg': '#ffffff',
    '--st-input-bg': '#ffffff',
    '--st-input-text': '#333333',
    '--st-token-crc': '#008000',
    '--st-token-flag': '#800080',
    '--st-accent': '#007acc'
  };

  const createThemeTemplate = (title: string, colors: Record<string, string>) => `{
  // === ${title} ===
  // 提示：你可以在这里随意修改颜色并保存。保存后在软件下拉框内重新点击一下即可自动刷新。
  // 注意：文件名即展示的主题名称（比如命名为 "我的暗红配色.json"）。
  // 你可以随时删除此文件或加入新的 .json 。
  "colors": ${JSON.stringify(colors, null, 2).split('\\n').join('\\n  ')}
}`;

  async function ensureThemeFilesExists(themeDir: string) {
    await fs.mkdir(themeDir, { recursive: true });
    const darkPath = path.join(themeDir, 'dark.json');
    const lightPath = path.join(themeDir, 'light.json');

    try {
      await fs.access(darkPath);
    } catch {
      await fs.writeFile(darkPath, createThemeTemplate('Tcom 默认暗色配置', DEFAULT_DARK_COLORS), 'utf-8');
    }

    try {
      await fs.access(lightPath);
    } catch {
      await fs.writeFile(lightPath, createThemeTemplate('Tcom 默认亮色配置', DEFAULT_LIGHT_COLORS), 'utf-8');
    }
  }

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
      const themeDir = path.join(app.getPath('userData'), 'themes');
      await ensureThemeFilesExists(themeDir);

      const files = await fs.readdir(themeDir);
      const themes: any[] = [];

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
                id: baseName, // 这里提取文件名来替代手动填写
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
    } catch (err: any) {
      console.error('Failed to load themes:', err);
      return { success: false, error: err.message, themes: [] };
    }
  });

  ipcMain.handle('theme:openFolder', async () => {
    const themeDir = path.join(app.getPath('userData'), 'themes');
    await ensureThemeFilesExists(themeDir);
    shell.openPath(themeDir);
    return { success: true };
  });

  ipcMain.handle('theme:openFile', async (_event, { id }) => {
    try {
      const themeDir = path.join(app.getPath('userData'), 'themes');
      await ensureThemeFilesExists(themeDir);
      const filePath = path.join(themeDir, `${id}.json`);
      // 不再覆盖写入文件，仅打开已存在的文件
      shell.openPath(filePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // MQTT Service Logic
  const mqtt = require('mqtt');
  const mqttClients = new Map();
  const pendingMqttConnections = new Set();

  ipcMain.handle('mqtt:connect', async (_event, { connectionId, config }) => {
    // Prevent overlapping connection attempts for the same sessionId
    if (pendingMqttConnections.has(connectionId)) {
      console.warn(`[MQTT] Connection already in progress for ${connectionId}, skipping.`);
      return { success: false, error: 'Connection attempt already in progress' };
    }

    pendingMqttConnections.add(connectionId);

    // config: { protocol, host, port, clientId, username, password, keepAlive, clean, ... }
    return new Promise((resolve) => {
      const finish = (result: any) => {
        pendingMqttConnections.delete(connectionId);
        resolve(result);
      };

      if (mqttClients.has(connectionId)) {
        const existing = mqttClients.get(connectionId);
        if (existing.connected) {
          existing.end(true);
        }
        mqttClients.delete(connectionId);
      }

      const protocol = config.protocol || 'tcp';
      let host = config.host;
      // Handle case where user inputs "protocol://host" in the host field
      if (host && host.includes('://')) {
        try {
          // If strictly valid URL
          const urlObj = new URL(host);
          host = urlObj.hostname;
        } catch (e) {
          // Fallback split
          host = host.split('://')[1];
        }
      }

      let url = `${protocol}://${host}:${config.port}`;
      if (protocol === 'ws' || protocol === 'wss') {
        const rawPath = config.path || '/mqtt';
        const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        url += path;
      }

      const options = {
        clientId: config.clientId,
        username: config.username,
        password: config.password,
        keepalive: config.keepAlive || 60,
        clean: config.cleanSession !== undefined ? config.cleanSession : true,
        connectTimeout: (config.connectTimeout || 30) * 1000,
        reconnectPeriod: config.autoReconnect ? 1000 : 0,
        // WS Options for Node.js compatibility
        wsOptions: {
          origin: 'http://localhost', // Many brokers reject WS without Origin
          headers: {
            'User-Agent': `Tcom/${app.getVersion()}`
          }
        }
      };

      console.log(`[MQTT] Connecting to ${url}`, options);

      let initialConnectHandled = false;
      let client: any = null;

      try {
        client = mqtt.connect(url, options);
      } catch (err: any) {
        // Synchronous error (e.g. invalid URL)
        console.error(`[MQTT] Sync Error ${connectionId}:`, err);
        return finish({ success: false, error: err.message });
      }

      const handleInitialSuccess = () => {
        if (!initialConnectHandled) {
          initialConnectHandled = true;
          mqttClients.set(connectionId, client);
          finish({ success: true });
          if (!win?.isDestroyed()) win?.webContents.send('mqtt:status', { connectionId, status: 'connected' });

          // Restore subscriptions if any
          if (config.topics && Array.isArray(config.topics)) {
            config.topics.forEach((t: any) => {
              if (typeof t === 'string') {
                client.subscribe(t);
              } else if (t && t.path && t.subscribed) {
                client.subscribe(t.path);
              }
            });
          }
        }
      };

      const handleInitialError = (err: string) => {
        if (!initialConnectHandled) {
          initialConnectHandled = true;
          // If we fail initially, ensure we clean up if we aren't auto-reconnecting (or even if we are, we want to tell UI it failed NOW)
          // For UI "Connect" button, we generally expect a success/fail result.
          // If autoReconnect is true, we could arguably leave it. But users usually expect "Connected" or "Failed" on click.
          // So we force fail the promise.
          client.end(true);
          finish({ success: false, error: err });
        }
      };

      const handleConnect = () => {
        if (!initialConnectHandled) {
          handleInitialSuccess();
        } else {
          // Reconnection
          if (!win?.isDestroyed()) win?.webContents.send('mqtt:status', { connectionId, status: 'connected' });
        }
      };

      client.on('connect', handleConnect);

      client.on('message', (topic: string, message: Buffer) => {
        if (!win?.isDestroyed()) {
          win?.webContents.send('mqtt:message', { connectionId, topic, payload: message });
        }
      });

      client.on('error', (err: Error) => {
        console.error(`[MQTT] Error ${connectionId}:`, err);
        if (!initialConnectHandled) {
          handleInitialError(err.message);
        } else {
          // Runtime error after connection
          if (!win?.isDestroyed()) win?.webContents.send('mqtt:error', { connectionId, error: err.message });
        }
      });

      client.on('close', () => {
        console.log(`[MQTT] Closed: ${connectionId}`);
        if (!initialConnectHandled) {
          // If closed before connect, it's a failure (e.g. timeout)
          handleInitialError('Connection closed or timed out');
        } else {
          if (!win?.isDestroyed()) win?.webContents.send('mqtt:status', { connectionId, status: 'disconnected' });
        }
      });

      // Safety timeout in case mqtt.js doesn't emit anything?
      // mqtt.js connectTimeout should trigger 'error' or 'close'.
    });
  });

  ipcMain.handle('mqtt:disconnect', async (_event, { connectionId }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.end();
      mqttClients.delete(connectionId);
      return { success: true };
    }
    return { success: false, error: 'Client not found' };
  });

  ipcMain.handle('mqtt:publish', async (_event, { connectionId, topic, payload, options }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      return new Promise((resolve) => {
        client.publish(topic, Buffer.from(payload), options, (err: Error | undefined) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true });
        });
      });
    }
    return { success: false, error: 'Client not connected' };
  });

  ipcMain.handle('mqtt:subscribe', async (_event, { connectionId, topic }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.subscribe(topic); // TODO: handle callback
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('mqtt:unsubscribe', async (_event, { connectionId, topic }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.unsubscribe(topic);
      return { success: true };
    }
    return { success: false };
  });

  // =============================================
  // Workspace-based Session Management
  // =============================================
  const fs = require('fs').promises;

  const workspaceStateFile = path.join(app.getPath('userData'), 'window-state.json');
  const defaultWorkspacePath = path.join(app.getPath('userData'), 'DefaultWorkspace');

  // Get last opened workspace path
  ipcMain.handle('workspace:getLastWorkspace', async () => {
    try {
      const data = await fs.readFile(workspaceStateFile, 'utf-8');
      const state = JSON.parse(data);
      return { success: true, path: state.lastWorkspace || null };
    } catch {
      return { success: true, path: null };
    }
  });

  // Get recent workspaces list
  ipcMain.handle('workspace:getRecentWorkspaces', async () => {
    try {
      const data = await fs.readFile(workspaceStateFile, 'utf-8');
      const state = JSON.parse(data);
      return { success: true, workspaces: state.recentWorkspaces || [] };
    } catch {
      return { success: true, workspaces: [] };
    }
  });

  // Save current workspace path and update recent list
  ipcMain.handle('workspace:setLastWorkspace', async (_event: any, wsPath: string | null) => {
    try {
      let state: any = { lastWorkspace: null, recentWorkspaces: [] };
      try {
        const data = await fs.readFile(workspaceStateFile, 'utf-8');
        state = JSON.parse(data);
      } catch { /* ignore */ }

      if (wsPath) {
        state.lastWorkspace = wsPath;
        // Update recent list: remove if exists, add to front, limit to 10
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

  // Open folder picker dialog
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

  // List all .json session files in workspace
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
        } catch { /* skip invalid files */ }
      }
      return { success: true, data: sessions };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Save a single session config to workspace
  ipcMain.handle('workspace:saveSession', async (_event: any, wsPath: string, config: any) => {
    try {
      await fs.mkdir(wsPath, { recursive: true });
      const safeName = config.name.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = path.join(wsPath, `${safeName}.json`);

      // Use WriteQueue to serialize writes to the same file
      await FileWriteQueue.enqueue(filePath, async () => {
        await fs.writeFile(filePath, JSON.stringify(config, null, 2));
      });

      return { success: true, filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Delete a session file from workspace
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

  // Rename a session file in workspace
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

  // Migrate old sessions.json to default workspace (one-time)
  const oldSessionsFile = path.join(app.getPath('userData'), 'sessions.json');
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
        // Rename old file so we don't migrate again
        await fs.rename(oldSessionsFile, oldSessionsFile + '.bak');
        return { success: true, migrated: sessions.length, path: defaultWorkspacePath };
      }
      return { success: false, migrated: 0 };
    } catch {
      return { success: false, migrated: 0 };
    }
  });

  // Legacy session API (kept for backward compat, no-ops)
  ipcMain.handle('session:save', async () => ({ success: true }));
  ipcMain.handle('session:load', async () => ({ success: true, data: [] }));

  // Open URL in system browser
  ipcMain.handle('shell:openExternal', async (_event: any, url: string) => {
    await shell.openExternal(url);
  });

  // Show open dialog for files
  ipcMain.handle('shell:showOpenDialog', async (_event: any, options: any) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(win, options);
    return result;
  });

  ipcMain.handle('com0com:launch-installer', async () => {
    const isDev = !!VITE_DEV_SERVER_URL;
    let installerPath = '';
    if (isDev) {
      installerPath = path.join(__dirname, '../resources/drivers/com0com_setup.exe');
    } else {
      installerPath = path.join(process.resourcesPath, 'resources/drivers/com0com_setup.exe');
    }

    try {
      installerPath = installerPath.replace(/^["']|["']$/g, '');
      const fs = require('fs/promises');
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

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // Check if current user has administrator privileges
  ipcMain.handle('app:is-admin', async () => {
    if (process.platform !== 'win32') return true;
    return new Promise((resolve) => {
      const { exec } = require('node:child_process');
      // 'net session' command only succeeds if run as administrator
      exec('net session', (err: any) => {
        resolve(!err);
      });
    });
  });

  // Com0Com Integration
  ipcMain.handle('com0com:check', async (_event, targetPath: string) => {
    try {
      targetPath = (targetPath || '').replace(/^["']|["']$/g, '');
      const filename = require('path').basename(targetPath).toLowerCase();
      if (filename !== 'setupc.exe') {
        return { success: false };
      }
      const fs = require('fs/promises');
      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) return { success: false };

      return { success: true, version: null };
    } catch (e) {
      return { success: false };
    }
  });

  const { exec } = require('node:child_process');

  ipcMain.handle('com0com:exec', async (_event, command: string) => {
    // Check admin privileges first for non-list commands
    if (process.platform === 'win32' && !command.toLowerCase().includes('list')) {
      const isAdmin = await new Promise((resolve) => {
        const { exec: adminExec } = require('node:child_process');
        adminExec('net session', (err: any) => resolve(!err));
      });
      if (!isAdmin) {
        return { success: false, error: 'Administrator privileges required for this operation' };
      }
    }

    if (!command.toLowerCase().includes('setupc.exe')) {
      return { success: false, error: 'Unauthorized command' };
    }

    const runWithSpawn = (fullCmd: string) => {
      return new Promise((resolve) => {
        const { spawn } = require('node:child_process');

        // Robust argument parsing
        // Example: "C:\Path With Spaces\setupc.exe" list -> exe: ..., args: ["list"]
        let exePath = '';
        let argsString = '';

        if (fullCmd.startsWith('"')) {
          const closeQuoteIndex = fullCmd.indexOf('"', 1);
          if (closeQuoteIndex > 1) {
            exePath = fullCmd.substring(1, closeQuoteIndex);
            argsString = fullCmd.substring(closeQuoteIndex + 1).trim();
          }
        } else {
          const spaceIndex = fullCmd.indexOf(' ');
          if (spaceIndex > 0) {
            exePath = fullCmd.substring(0, spaceIndex);
            argsString = fullCmd.substring(spaceIndex + 1).trim();
          } else {
            exePath = fullCmd;
          }
        }

        const args = argsString ? argsString.split(/\s+/) : [];
        const cwd = exePath.includes('\\') || exePath.includes('/') ? path.dirname(exePath) : undefined;

        console.log(`[com0com] Spawning: ${exePath} in ${cwd || 'default'} with args:`, args);

        const child = spawn(exePath, args, {
          cwd,
          shell: true, // Use shell to help resolver and UAC
          windowsHide: true
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: any) => stdout += d.toString());
        child.stderr.on('data', (d: any) => stderr += d.toString());

        child.on('error', (err: any) => {
          console.error(`[com0com] Spawn error:`, err);
          resolve({ success: false, error: err.message });
        });

        child.on('close', (code: number) => {
          if (code === 0) {
            resolve({ success: true, stdout });
          } else {
            // Check if we need to fallback
            if (exePath === 'setupc' || exePath === 'setupc.exe') {
              const localSetupc = path.join(app.getPath('userData'), 'drivers', 'com0com', 'setupc.exe');
              console.log(`[com0com] Global failed, trying local path: ${localSetupc}`);

              // Second attempt with local path
              const localChild = spawn(localSetupc, args, {
                cwd: path.dirname(localSetupc),
                shell: true,
                windowsHide: true
              });

              let lStdout = '';
              let lStderr = '';
              localChild.stdout.on('data', (d: any) => lStdout += d.toString());
              localChild.stderr.on('data', (d: any) => lStderr += d.toString());

              localChild.on('close', (lCode: number) => {
                if (lCode === 0) resolve({ success: true, stdout: lStdout });
                else resolve({ success: false, error: `Process exited with code ${lCode}`, stderr: lStderr, stdout: lStdout });
              });

              localChild.on('error', (lErr: any) => resolve({ success: false, error: lErr.message }));
            } else {
              resolve({ success: false, error: `Process exited with code ${code}`, stderr, stdout });
            }
          }
        });
      });
    };

    return runWithSpawn(command);
  });

  // com0com:name - Set Friendly Name for a COM port
  ipcMain.handle('com0com:name', async (_event, { port, name }) => {
    if (!/^COM\d+$/.test(port)) return { success: false, error: 'Invalid port format' };
    const safeName = name.replace(/["\r\n]/g, '');

    const psScript = `
      $port = "${port}"
      $friendlyName = "${safeName}"
      
      try {
        # The PortName is stored in "Device Parameters" subkey of the device instance.
        # We need to find the instance key where "Device Parameters\\PortName" equals $port.
        
        $root = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\com0com\\port"
        if (-not (Test-Path $root)) {
             Write-Output "Com0com registry not found"
             exit 1
        }
        
        $foundInstance = $null
        
        # Iterate over all instances (CNCA0, CNCB0, etc.)
        Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
           $instanceKey = $_.PSPath
           $paramsKey = Join-Path $instanceKey "Device Parameters"
           
           if (Test-Path $paramsKey) {
               $p = Get-ItemProperty -Path $paramsKey -Name "PortName" -ErrorAction SilentlyContinue
               if ($p -and $p.PortName -eq $port) {
                   $foundInstance = $instanceKey
               }
           }
        }
        
        if ($foundInstance) {
           # Set FriendlyName on the INSTANCE key (not Device Parameters)
           New-ItemProperty -Path $foundInstance -Name "FriendlyName" -Value $friendlyName -PropertyType String -Force | Out-Null
           Write-Output "Success: Set $friendlyName for $foundInstance"
        } else {
           Write-Output "Port $port not found in registry"
        }
      } catch {
        Write-Output "Error: $_"
      }
    `;

    return new Promise((resolve) => {
      const { spawn } = require('node:child_process');
      const child = spawn('powershell.exe', ['-Command', psScript], { windowsHide: true });

      let out = '';
      child.stdout.on('data', (d: any) => out += d.toString());

      child.on('close', (code: number) => {
        const output = out.trim();
        if (output.includes('Success')) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: output || `Exited with ${code}` });
        }
      });
    });
  });

  ipcMain.handle('com0com:install', async () => {
    // Check admin privileges first
    if (process.platform === 'win32') {
      const isAdmin = await new Promise((resolve) => {
        const { exec } = require('node:child_process');
        exec('net session', (err: any) => resolve(!err));
      });
      if (!isAdmin) {
        return { success: false, error: 'Administrator privileges required for installation' };
      }
    }

    const isDev = !!VITE_DEV_SERVER_URL;
    // In Dev: project_root/dist-electron/main.js -> project_root/resources/drivers/com0com_setup.exe
    // In Prod: resources/resources/drivers/... (nested resources due to extraResources)

    let installerPath = '';
    if (isDev) {
      installerPath = path.join(__dirname, '../resources/drivers/com0com_setup.exe');
    } else {
      installerPath = path.join(process.resourcesPath, 'resources/drivers/com0com_setup.exe');
    }

    const targetDir = path.join(app.getPath('userData'), 'drivers', 'com0com');

    // Ensure installer exists and is a file
    try {
      const stats = await fs.stat(installerPath);
      if (!stats.isFile()) {
        return { success: false, error: `Installer path is not a file: ${installerPath}` };
      }
    } catch {
      // Fallback for dev/testing if file not present
      return { success: false, error: `Installer not found at: ${installerPath}` };
    }

    // Command args for NSIS installer (Com0Com uses NSIS usually)
    // /S = Silent
    // /D=Path = Dest dir (must be last argument and contain no quotes, even if path has spaces)
    // Warning: Installing drivers usually requires UAC. Silent install might fail if not run as Admin.
    // If we can't do silent, we just launch it.

    // User requested "Show prompt if user allows".
    // We will try running it. If it triggers UAC, that's fine.

    return new Promise((resolve) => {
      const { spawn } = require('node:child_process');
      // Use shell: true to help with UAC elevation and execution
      const child = spawn(installerPath, ['/S', `/D=${targetDir}`], {
        windowsHide: true,
        shell: true,
        cwd: path.dirname(installerPath)
      });

      child.on('error', (err: any) => {
        resolve({ success: false, error: err.message });
      });

      child.on('close', (code: number) => {
        if (code === 0) {
          resolve({ success: true, path: targetDir });
        } else {
          resolve({ success: false, error: `Installer exited with code ${code}` });
        }
      });
    });
  });


  // ... existing child spawn code ...

  // --- TCP Service Integration ---
  // We'll initialize it inside createWindow to ensure fresh webContents
  // But we need to avoid re-adding IPC handlers.

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // Initialize TCP Service with this window
  tcpService = new TcpService(win.webContents);

  // Initialize AutoUpdater
  const updater = new AppUpdater(win);
  updater.init();
}

import { autoUpdater } from 'electron-updater';

class AppUpdater {
  private win: BrowserWindow;

  constructor(win: BrowserWindow) {
    this.win = win;

    // Configure autoUpdater
    autoUpdater.autoDownload = false; // We want manual control via UI
    autoUpdater.autoInstallOnAppQuit = true;

    // Logging (optional, useful for debugging)
    // autoUpdater.logger = require('electron-log');
    // @ts-ignore
    // autoUpdater.logger.transports.file.level = 'info';
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

    // IPC Handlers for update
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

// --- TCP Service Integration ---

// 内联 TcpService 类定义以避免打包时的模块解析问题
class TcpService {
  private servers: Map<number, any> = new Map();
  private webContents: any;

  constructor(webContents: any) {
    this.webContents = webContents;
  }

  startServer(port: number) {
    const net = require('net');
    if (this.servers.has(port)) {
      return { success: false, error: 'Server already running' };
    }

    const server = net.createServer((socket: any) => {
      socket.on('data', (data: Buffer) => {
        this.webContents.send('tcp:data', { port, data });
      });
      socket.on('error', (err: Error) => {
        this.webContents.send('tcp:error', { port, error: err.message });
      });
      socket.on('close', () => {
        this.webContents.send('tcp:client-disconnected', { port });
      });
    });

    server.listen(port, () => {
      this.servers.set(port, server);
      this.webContents.send('tcp:server-started', { port });
    });

    server.on('error', (err: any) => {
      this.webContents.send('tcp:error', { port, error: err.message });
    });

    return { success: true };
  }

  stopServer(port: number) {
    const server = this.servers.get(port);
    if (server) {
      server.close();
      this.servers.delete(port);
      this.webContents.send('tcp:server-stopped', { port });
      return true;
    }
    return false;
  }

  write(port: number, data: any) {
    // Implementation for writing to TCP clients
    // This would need to track connected clients per server
  }
}

// Let's create a global reference
let tcpService: any = null;


// Start checking app version
ipcMain.handle('tcp:start', async (_event, port: number) => {
  if (!tcpService) return { success: false, error: 'Service not initialized' };
  return tcpService.startServer(port);
});

ipcMain.handle('tcp:stop', async (_event, port: number) => {
  if (!tcpService) return false;
  return tcpService.stopServer(port);
});

ipcMain.handle('tcp:write', async (_event, { port, data }) => {
  if (tcpService) tcpService.write(port, data);
  return true;
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

// App-specific resource stats (process-level, not system-wide)
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

ipcMain.handle('system:stats', async () => {
  // Memory: app process memory
  const mem = process.memoryUsage();
  const memUsedMB = Math.round(mem.rss / 1024 / 1024); // Resident Set Size

  // CPU: app process CPU usage
  const currentCpuUsage = process.cpuUsage(lastCpuUsage);
  const currentTime = Date.now();
  const elapsedMs = currentTime - lastCpuTime;

  // cpuUsage returns microseconds, convert to percentage
  const totalCpuUs = currentCpuUsage.user + currentCpuUsage.system;
  // Percentage of a single core. For multi-core, this can exceed 100%.
  // We normalize to single-core percentage for simplicity.
  const cpuPercent = elapsedMs > 0 ? Math.min(100, Math.round((totalCpuUs / 1000) / elapsedMs * 100)) : 0;

  lastCpuUsage = process.cpuUsage();
  lastCpuTime = currentTime;

  return {
    cpu: cpuPercent,
    memUsed: memUsedMB,
  };
});

// 枚举系统安装的字体（Windows）
ipcMain.handle('app:list-fonts', async () => {
  if (process.platform !== 'win32') {
    // macOS/Linux: 返回空数组，前端使用预设列表
    return { success: true, fonts: [] };
  }
  return new Promise((resolve) => {
    const { spawn } = require('node:child_process');
    // 通过 PowerShell 读取注册表中安装的字体名称
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
            # 字体名称格式通常是 "FontName (TrueType)" 或 "FontName Bold (TrueType)"
            $name = $_.Name -replace '\\s*\\(.*\\)\\s*$', '' -replace '\\s+$', ''
            if ($name -and $name.Length -gt 1) {
              $fonts += $name
            }
          }
        }
      }
      # 去重并排序
      $fonts | Sort-Object -Unique | ForEach-Object { [Console]::WriteLine($_) }
    `.trim();

    // 转换为 PowerShell 识别的 Unicode (UTF-16LE) Base64
    const buffer = Buffer.from(psScript, 'utf16le');
    const encodedCommand = buffer.toString('base64');

    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand], {
      windowsHide: true
    });

    const chunks: Buffer[] = [];
    let err = '';

    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stderr.on('data', (d: any) => err += d.toString());

    child.on('close', (code: number) => {
      const out = Buffer.concat(chunks).toString('utf8');
      if (code === 0 && out.trim()) {
        const fonts = out.split(/\r?\n/)
          .map((f: string) => f.trim())
          .filter(Boolean);
        resolve({ success: true, fonts });
      } else {
        resolve({ success: false, fonts: [], error: err || 'Failed to list fonts' });
      }
    });
    child.on('error', (e: any) => {
      resolve({ success: false, fonts: [], error: e.message });
    });
  });
});

// 窗口置顶
ipcMain.handle('window:setAlwaysOnTop', (_event, flag: boolean) => {
  win?.setAlwaysOnTop(flag);
  return { success: true, alwaysOnTop: flag };
});

ipcMain.handle('window:isAlwaysOnTop', () => {
  return { success: true, alwaysOnTop: win?.isAlwaysOnTop() ?? false };
});


// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
