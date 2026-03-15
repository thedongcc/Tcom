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
import path from 'node:path';
import { Worker } from 'worker_threads';
import type { SerialPortInstance } from '../types/serialport.types';

/** Worker 句柄，用于管理定时发送任务的停止信号 */
interface TimedSendHandle {
    worker: Worker;
    control: Int32Array;
}

/** timestamp 槽位描述 */
interface TimestampSlot {
    byteOffset: number;
    byteSize: number;
    byteOrder: string;
    format: string;
}

/**
 * 获取 timer-worker.js 的绝对路径。
 * Vite 构建时 timer-worker.ts 会被单独打包到 dist-electron/timer-worker.js。
 */
function getWorkerPath(): string {
    return path.join(__dirname, 'timer-worker.js');
}

export class TimedSendManager {
    private handles: Map<string, TimedSendHandle> = new Map();
    private mainWindow: BrowserWindow;
    private getPort: (connectionId: string) => SerialPortInstance | undefined;

    constructor(mainWindow: BrowserWindow, getPort: (connectionId: string) => SerialPortInstance | undefined) {
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
        require('worker_threads'); // 确保 worker_threads 模块可用

        // SharedArrayBuffer 作停止信号：control[0] = 0 运行中，1 = 停止
        const controlBuf = new SharedArrayBuffer(4);
        const control = new Int32Array(controlBuf);

        // 使用独立 Worker 文件，通过 workerData.mode 区分静态/动态模式
        const worker = new Worker(getWorkerPath(), {
            workerData: { mode: 'static', intervalMs, controlBuf }
        });

        // 主线程收到 tick：写串口 + 通知渲染进程记录日志
        worker.on('message', () => {
            const p = this.getPort(connectionId);
            if (!p || !p.isOpen) {
                this.stop(connectionId);
                return;
            }
            const ts = Date.now();
            p.write(payload, (err?: Error | null) => {
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

        require('worker_threads'); // 确保 worker_threads 模块可用

        // SharedArrayBuffer：control[0]=0 运行中 / 1=停止
        const controlBuf = new SharedArrayBuffer(8);
        const control = new Int32Array(controlBuf);

        // 使用独立 Worker 文件，通过 workerData.mode 区分静态/动态模式
        const worker = new Worker(getWorkerPath(), {
            workerData: { mode: 'dynamic', intervalMs, controlBuf, frames, timestampSlots }
        });

        worker.on('message', (msg: { type: string; data: Buffer; index: number }) => {
            if (msg.type === 'send') {
                const p = this.getPort(connectionId);
                if (!p || !p.isOpen) {
                    this.stop(connectionId);
                    return;
                }
                const ts = Date.now();
                const buf = Buffer.from(msg.data);
                p.write(buf, (err?: Error | null) => {
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
