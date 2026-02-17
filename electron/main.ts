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
  async listPorts() {
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
      // Windows Registry Fallback (for com0com and others)
      if (process.platform === 'win32') {
        try {
          const { exec } = require('node:child_process');

          // 1. Get active COM ports map from Hardware DeviceMap
          // \Device\com0com10 -> COM1
          const activePorts = new Map<string, string>(); // PortName -> DevicePath

          await new Promise<void>((resolve) => {
            exec('reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM', (err: any, stdout: string) => {
              if (!err && stdout) {
                const lines = stdout.split('\r\n');
                lines.forEach(line => {
                  const parts = line.trim().split(/\s{4,}/);
                  if (parts.length >= 3) {
                    const portName = parts[parts.length - 1]; // COM11
                    if (portName && portName.startsWith('COM')) {
                      activePorts.set(portName, parts[0]);
                    }
                  }
                });
              }
              resolve();
            });
          });

          // 2. Get Friendly Names from Enum (Recursive)
          // This is specifically to find names like "Tcom Virtual Port (COM11)"
          const friendlyNames = new Map<string, string>();
          await new Promise<void>((resolve) => {
            exec('reg query HKLM\\SYSTEM\\CurrentControlSet\\Enum\\com0com /s', (err: any, stdout: string) => {
              if (!err && stdout) {
                // Parse logical blocks (naive but effective for reg query output)
                const enumLines = stdout.split('\r\n');
                enumLines.forEach(line => {
                  const trimmed = line.trim();
                  // Check if line contains FriendlyName
                  if (trimmed.startsWith('FriendlyName') && trimmed.includes('REG_SZ')) {
                    // FriendlyName    REG_SZ    Tcom Virtual Port (COM11)
                    const parts = trimmed.split(/\s{4,}/); // Split by multiple spaces
                    if (parts.length >= 3) {
                      const name = parts[parts.length - 1]; // "Tcom Virtual Port (COM11)"
                      // Extract COM port from end of string: "... (COM11)"
                      const match = name.match(/\((COM\d+)\)$/);
                      if (match) {
                        friendlyNames.set(match[1], name);
                      }
                    }
                  }
                });
              }
              resolve();
            });
          });

          // 3. Merge into ports list
          activePorts.forEach((device, portName) => {
            const exists = ports.find((p: any) => p.path === portName);
            const friendly = friendlyNames.get(portName);

            // Determine manufacturer from device path
            let manufacturer = undefined;
            if (device.toLowerCase().includes('com0com')) {
              manufacturer = 'com0com';
            } else if (device.toLowerCase().includes('bthmodem')) {
              manufacturer = 'Microsoft (Bluetooth)';
            }

            if (exists) {
              // Determine if we should update friendlyName?
              // If we found a better friendly name (and it's not just the port name)
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
      // We skip ports already opened by our own application (they are in this.ports)
      const openedPaths = new Set(Array.from(this.ports.values()).map(p => p.path));

      const portsWithStatus = await Promise.all(ports.map(async (port: any) => {
        if (openedPaths.has(port.path)) {
          return { ...port, busy: false, status: 'available' }; // It's "available" to us because we own it
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
      color: '#3c3c3c', // Matches --vscode-titlebar
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
  ipcMain.handle('serial:list-ports', async () => {
    return serialService?.listPorts()
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

  const workspaceStateFile = path.join(app.getPath('userData'), 'workspace-state.json');
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

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // Com0Com Integration
  const { exec } = require('node:child_process');

  ipcMain.handle('com0com:exec', async (_event, command) => {
    return new Promise((resolve) => {
      // Only allow setupc commands for security (basic check)
      // Allow full paths (e.g. "C:\...\setupc.exe") or just "setupc"
      if (!command.toLowerCase().includes('setupc')) {
        return resolve({ success: false, error: 'Unauthorized command' });
      }

      const execCommand = (cmd: string) => {
        let cwd = undefined;
        try {
          // Try to extract directory from command to set as CWD
          // Command might be quoted: "C:\path\to\setupc.exe" list
          // Or simple: setupc list
          let exePath = '';
          if (cmd.startsWith('"')) {
            const closeQuoteIndex = cmd.indexOf('"', 1);
            if (closeQuoteIndex > 1) {
              exePath = cmd.substring(1, closeQuoteIndex);
            }
          } else {
            const spaceIndex = cmd.indexOf(' ');
            if (spaceIndex > 0) {
              exePath = cmd.substring(0, spaceIndex);
            } else {
              exePath = cmd;
            }
          }

          if (exePath && (exePath.includes('\\') || exePath.includes('/'))) {
            cwd = path.dirname(exePath);
          }
        } catch (e) {
          console.warn('[com0com] Failed to parse CWD:', e);
        }

        console.log(`[com0com] Executing: ${cmd}`);
        console.log(`[com0com] CWD: ${cwd || 'default'}`);

        exec(cmd, { cwd }, (error: any, stdout: string, stderr: string) => {
          if (error) {
            console.log(`[com0com] Command failed: ${cmd}`, error.message);
            console.log(`[com0com] Stdout:`, stdout); // Log stdout too!
            console.log(`[com0com] Stderr:`, stderr);

            // If it was the first try (just 'setupc'), and it failed, try the local path
            if (cmd.startsWith('setupc') && !cmd.includes('\\') && !cmd.includes('/')) {
              const localSetupc = path.join(app.getPath('userData'), 'drivers', 'com0com', 'setupc.exe');
              console.log(`[com0com] Trying local path: ${localSetupc}`);
              // Check if local exists before trying?
              // Or just try executing it.
              // We replace 'setupc' with "localPath"

              // Use spawn properly with CWD
              const { spawn } = require('node:child_process');
              const dir = path.dirname(localSetupc);

              // Parse args from original command
              // command is like "setupc install PortName=COM11 PortName=COM12"
              // We need args: ["install", "PortName=COM11", "PortName=COM12"]
              // Remove "setupc" prefix
              const argsString = cmd.substring(6).trim();
              const args = argsString.split(/\s+/);

              console.log(`[com0com] Spawning: ${localSetupc} in ${dir} with args:`, args);

              const child = spawn(localSetupc, args, {
                cwd: dir,
                shell: true, // Needed? setupc is .exe. usually ok without if full path. but for UAC maybe?
                // If shell: true, verify if we need to quote args. spawn handles array args well usually.
              });

              let out = '';
              let errOut = '';

              child.stdout.on('data', (d: any) => out += d.toString());
              child.stderr.on('data', (d: any) => errOut += d.toString());

              child.on('close', (code: number) => {
                if (code === 0) {
                  console.log(`[com0com] Spawn success`);
                  resolve({ success: true, stdout: out });
                } else {
                  console.log(`[com0com] Spawn exited with ${code}`);
                  resolve({ success: false, error: `Process exited with code ${code}`, stderr: errOut, stdout: out });
                }
              });
            } else {
              resolve({ success: false, error: error.message, stderr, stdout });
            }
          } else {
            console.log(`[com0com] Success. Stdout len: ${stdout.length}`);
            resolve({ success: true, stdout });
          }
        });
      };

      execCommand(command);
    });
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
        windowsHide: false,
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
