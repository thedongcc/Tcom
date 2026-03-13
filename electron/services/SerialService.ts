/**
 * SerialService
 * 负责所有串口连接的生命周期管理：列举、打开、关闭、读写、高精度定时发送。
 */
import { BrowserWindow } from 'electron';
import { getSerialPort } from '../utils/serialport-loader';

export class SerialService {
    private ports: Map<string, any> = new Map();
    private mainWindow: BrowserWindow;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    // 列举可用串口
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

            // Windows 注册表兜底（支持 com0com 等虚拟串口）
            if (process.platform === 'win32') {
                try {
                    const { exec } = require('node:child_process');

                    // 1. 从 Hardware DeviceMap 获取激活串口列表
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

                    // 2. 若请求，从注册表获取友好名称
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

                    // 3. 合并到串口列表
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

            // 4. 检测每个端口的占用状态
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

    // 打开串口
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

                    // 数据到来：主进程立即打时间戳，精度高于渲染进程接收时再打
                    port.on('data', (data: any) => {
                        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                            this.mainWindow.webContents.send('serial:data', { connectionId, data, timestamp: Date.now() });
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

    // 关闭串口
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
                this.ports.delete(connectionId);
                resolve({ success: true });
            }
        });
    }

    // 写入数据
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

    // ⚡ 高精度定时发送（Worker Thread 方案）
    //
    // 架构：独立 worker 线程完全隔离，主进程事件循环零负担
    //   粗粒度等待 → Atomics.wait()    ：OS 级阻塞，0% CPU，精度受 OS timer 限制
    //   最后 5ms   → performance.now() ：worker 线程自旋，精度 ~0.1ms，不影响主线程
    //   漂移补偿   → 绝对时间轴         ：nextFireTime += interval，确保长期平均准确
    private timedSendHandles: Map<string, { worker: any; control: Int32Array }> = new Map();

    startTimedSend(connectionId: string, data: number[], intervalMs: number) {
        this.stopTimedSend(connectionId);

        const port = this.ports.get(connectionId);
        if (!port || !port.isOpen) {
            return { success: false, error: 'Port not open' };
        }

        const payload = Buffer.from(data);
        const { Worker } = require('worker_threads');

        // SharedArrayBuffer 作停止信号：control[0] = 0 运行中，1 = 停止
        const controlBuf = new SharedArrayBuffer(4);
        const control = new Int32Array(controlBuf);

        // Worker 代码内联，避免打包/路径问题
        const WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
const { performance } = require('perf_hooks');
const control = new Int32Array(workerData.controlBuf);

// 提前 N ms 从 Atomics.wait 醒来进入精确自旋
const LEAD_MS = 5;

// 绝对时间轴，消除累积漂移（不以实际触发时刻为基准）
let nextFireTime = performance.now() + workerData.intervalMs;

while (true) {
  const remaining = nextFireTime - performance.now();

  if (remaining > LEAD_MS) {
    // 粗粒度阻塞等待（OS 级，0% CPU），精确到 OS timer 精度
    const coarse = Math.floor(remaining - LEAD_MS);
    if (Atomics.wait(control, 0, 0, coarse) !== 'timed-out') break;
  }

  // 精确自旋（在 worker 线程）：高 CPU 局限在独立线程，不影响主线程事件循环
  while (performance.now() < nextFireTime) {
    if (Atomics.load(control, 0) !== 0) process.exit(0);
  }

  // 触发：推进绝对时间轴后通知主线程
  nextFireTime += workerData.intervalMs;
  parentPort.postMessage(null);
}
`;

        const worker = new Worker(WORKER_CODE, {
            eval: true,
            workerData: { intervalMs, controlBuf }
        });

        // 主线程收到 tick：写串口 + 通知渲染进程记录日志
        worker.on('message', () => {
            const p = this.ports.get(connectionId);
            if (!p || !p.isOpen) {
                this.stopTimedSend(connectionId);
                return;
            }
            const ts = Date.now();
            p.write(payload, (err: any) => {
                if (!err && this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('serial:timed-send-tick', {
                        connectionId, data: Array.from(data), timestamp: ts
                    });
                }
            });
        });

        worker.on('error', (err: Error) => {
            console.error(`[TimedSend] Worker error for ${connectionId}:`, err.message);
            this.timedSendHandles.delete(connectionId);
        });

        this.timedSendHandles.set(connectionId, { worker, control });
        return { success: true };
    }

    stopTimedSend(connectionId: string) {
        const handle = this.timedSendHandles.get(connectionId);
        if (handle) {
            Atomics.store(handle.control, 0, 1); // 通知 worker 退出
            Atomics.notify(handle.control, 0);   // 唤醒 Atomics.wait
            handle.worker.terminate();           // 强制终止（防止自旋阶段无法响应）
            this.timedSendHandles.delete(connectionId);
        }
        return { success: true };
    }

    // ⚡ 高精度动态定时发送（预计算帧 + Worker Thread 方案）
    //
    // 渲染进程预计算 N 帧数据，主进程 Worker 用 Atomics.wait + 自旋精确发送。
    // timestamp 槽位由 Worker 在发送瞬间实时填充。
    // 帧消费到低水位时通知渲染进程补充下一批。
    startTimedSendDynamic(
        connectionId: string,
        frames: number[][],
        intervalMs: number,
        timestampSlots: { byteOffset: number; byteSize: number; byteOrder: string; format: string }[]
    ) {
        this.stopTimedSend(connectionId);

        const port = this.ports.get(connectionId);
        if (!port || !port.isOpen) {
            return { success: false, error: 'Port not open' };
        }

        const { Worker } = require('worker_threads');

        // SharedArrayBuffer：control[0]=0 运行中 / 1=停止；control[1]=帧队列写指针
        const controlBuf = new SharedArrayBuffer(8);
        const control = new Int32Array(controlBuf);

        // Worker 代码：while(true) + Atomics.wait 完全阻塞事件循环，
        // parentPort.on('message') 永远不会触发。
        // 因此 Worker 用模运算循环使用预计算帧，永不耗尽。
        const WORKER_CODE = [
            "const { workerData, parentPort } = require('worker_threads');",
            "const { performance } = require('perf_hooks');",
            "const control = new Int32Array(workerData.controlBuf);",
            "const LEAD_MS = 5;",
            "var frames = workerData.frames.map(function(f) { return Buffer.from(f); });",
            "var frameIndex = 0;",
            "var timestampSlots = workerData.timestampSlots;",
            "var nextFireTime = performance.now() + workerData.intervalMs;",
            "function fillTimestamp(buf) {",
            "    for (var si = 0; si < timestampSlots.length; si++) {",
            "        var slot = timestampSlots[si];",
            "        var byteSize = slot.byteSize;",
            "        var ts = slot.format === 'milliseconds' ? BigInt(Date.now()) : BigInt(Math.floor(Date.now() / 1000));",
            "        if (slot.byteOrder === 'big') {",
            "            for (var i = byteSize - 1; i >= 0; i--) {",
            "                buf[slot.byteOffset + (byteSize - 1 - i)] = Number((ts >> BigInt(i * 8)) & BigInt(0xFF));",
            "            }",
            "        } else {",
            "            for (var i = 0; i < byteSize; i++) {",
            "                buf[slot.byteOffset + i] = Number((ts >> BigInt(i * 8)) & BigInt(0xFF));",
            "            }",
            "        }",
            "    }",
            "}",
            "while (true) {",
            "    var remaining = nextFireTime - performance.now();",
            "    if (remaining > LEAD_MS) {",
            "        var coarse = Math.floor(remaining - LEAD_MS);",
            "        if (Atomics.wait(control, 0, 0, coarse) !== 'timed-out') break;",
            "    }",
            "    while (performance.now() < nextFireTime) {",
            "        if (Atomics.load(control, 0) !== 0) process.exit(0);",
            "    }",
            "    nextFireTime += workerData.intervalMs;",
            // 模运算循环使用帧，永不耗尽
            "    var idx = frameIndex % frames.length;",
            "    var buf = Buffer.from(frames[idx]);",
            "    fillTimestamp(buf);",
            "    parentPort.postMessage({ type: 'send', data: buf, index: frameIndex });",
            "    frameIndex++;",
            "}",
        ].join('\n');

        const worker = new Worker(WORKER_CODE, {
            eval: true,
            workerData: { intervalMs, controlBuf, frames, timestampSlots }
        });

        worker.on('message', (msg: any) => {
            if (msg.type === 'send') {
                const p = this.ports.get(connectionId);
                if (!p || !p.isOpen) {
                    this.stopTimedSend(connectionId);
                    return;
                }
                const ts = Date.now();
                const buf = Buffer.from(msg.data);
                p.write(buf, (err: any) => {
                    if (!err && this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.webContents.send('serial:timed-send-tick', {
                            connectionId, data: Array.from(buf), timestamp: ts
                        });
                    }
                });
            }
        });

        worker.on('error', (err: Error) => {
            console.error(`[TimedSendDynamic] Worker error for ${connectionId}:`, err.message);
            this.timedSendHandles.delete(connectionId);
        });

        this.timedSendHandles.set(connectionId, { worker, control });
        return { success: true };
    }

    stopAllTimedSends() {
        this.timedSendHandles.forEach((handle) => {
            Atomics.store(handle.control, 0, 1);
            Atomics.notify(handle.control, 0);
            handle.worker.terminate();
        });
        this.timedSendHandles.clear();
    }
}

