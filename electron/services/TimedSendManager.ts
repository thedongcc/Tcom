/**
 * TimedSendManager.ts
 * 高精度定时发送管理器 — 基于 Worker Thread 的精确定时串口数据发送。
 * 从 SerialService.ts 中拆分出来。
 *
 * 架构说明：
 *   粗粒度等待 → Atomics.wait()    ：OS 级阻塞，0% CPU
 *   最后 5ms   → performance.now() ：worker 线程自旋，精度 ~0.1ms
 *   漂移补偿   → 绝对时间轴         ：nextFireTime += interval
 */
import { BrowserWindow } from 'electron';

interface TimedSendHandle {
    worker: any;
    control: Int32Array;
}

/** timestamp 槽位描述 */
interface TimestampSlot {
    byteOffset: number;
    byteSize: number;
    byteOrder: string;
    format: string;
}

// 静态定时发送 Worker 代码
const STATIC_WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
const { performance } = require('perf_hooks');
const control = new Int32Array(workerData.controlBuf);

const LEAD_MS = 5;
let nextFireTime = performance.now() + workerData.intervalMs;

while (true) {
  const remaining = nextFireTime - performance.now();

  if (remaining > LEAD_MS) {
    const coarse = Math.floor(remaining - LEAD_MS);
    if (Atomics.wait(control, 0, 0, coarse) !== 'timed-out') break;
  }

  while (performance.now() < nextFireTime) {
    if (Atomics.load(control, 0) !== 0) process.exit(0);
  }

  nextFireTime += workerData.intervalMs;
  parentPort.postMessage(null);
}
`;

// 动态定时发送 Worker 代码（帧循环 + timestamp 填充）
const DYNAMIC_WORKER_CODE = [
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

export class TimedSendManager {
    private handles: Map<string, TimedSendHandle> = new Map();
    private mainWindow: BrowserWindow;
    private getPort: (connectionId: string) => any;

    constructor(mainWindow: BrowserWindow, getPort: (connectionId: string) => any) {
        this.mainWindow = mainWindow;
        this.getPort = getPort;
    }

    /**
     * 静态定时发送 — 固定帧数据按间隔不断发送
     */
    startStatic(connectionId: string, data: number[], intervalMs: number) {
        this.stop(connectionId);

        const port = this.getPort(connectionId);
        if (!port || !port.isOpen) {
            return { success: false, error: 'Port not open' };
        }

        const payload = Buffer.from(data);
        const { Worker } = require('worker_threads');

        // SharedArrayBuffer 作停止信号：control[0] = 0 运行中，1 = 停止
        const controlBuf = new SharedArrayBuffer(4);
        const control = new Int32Array(controlBuf);

        const worker = new Worker(STATIC_WORKER_CODE, {
            eval: true,
            workerData: { intervalMs, controlBuf }
        });

        // 主线程收到 tick：写串口 + 通知渲染进程记录日志
        worker.on('message', () => {
            const p = this.getPort(connectionId);
            if (!p || !p.isOpen) {
                this.stop(connectionId);
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
            this.handles.delete(connectionId);
        });

        this.handles.set(connectionId, { worker, control });
        return { success: true };
    }

    /**
     * 动态定时发送 — 预计算帧 + Worker 循环发送 + timestamp 实时填充
     */
    startDynamic(
        connectionId: string,
        frames: number[][],
        intervalMs: number,
        timestampSlots: TimestampSlot[]
    ) {
        this.stop(connectionId);

        const port = this.getPort(connectionId);
        if (!port || !port.isOpen) {
            return { success: false, error: 'Port not open' };
        }

        const { Worker } = require('worker_threads');

        // SharedArrayBuffer：control[0]=0 运行中 / 1=停止
        const controlBuf = new SharedArrayBuffer(8);
        const control = new Int32Array(controlBuf);

        const worker = new Worker(DYNAMIC_WORKER_CODE, {
            eval: true,
            workerData: { intervalMs, controlBuf, frames, timestampSlots }
        });

        worker.on('message', (msg: any) => {
            if (msg.type === 'send') {
                const p = this.getPort(connectionId);
                if (!p || !p.isOpen) {
                    this.stop(connectionId);
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
            this.handles.delete(connectionId);
        });

        this.handles.set(connectionId, { worker, control });
        return { success: true };
    }

    /**
     * 停止指定连接的定时发送
     */
    stop(connectionId: string) {
        const handle = this.handles.get(connectionId);
        if (handle) {
            Atomics.store(handle.control, 0, 1); // 通知 worker 退出
            Atomics.notify(handle.control, 0);   // 唤醒 Atomics.wait
            handle.worker.terminate();           // 强制终止
            this.handles.delete(connectionId);
        }
        return { success: true };
    }

    /**
     * 停止所有定时发送
     */
    stopAll() {
        this.handles.forEach((handle) => {
            Atomics.store(handle.control, 0, 1);
            Atomics.notify(handle.control, 0);
            handle.worker.terminate();
        });
        this.handles.clear();
    }
}
