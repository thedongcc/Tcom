/**
 * SerialService
 * 串口连接生命周期管理中枢 — 组合 PortScanner 和 TimedSendManager。
 *
 * 子模块：
 * - PortScanner.ts     — 端口扫描与可用性检测
 * - TimedSendManager.ts — 高精度定时发送（Worker Thread）
 */
import { BrowserWindow } from 'electron';
import { getSerialPort } from '../utils/serialport-loader';
import { scanPorts } from './PortScanner';
import { TimedSendManager } from './TimedSendManager';
import type { SerialPortInstance } from '../types/serialport.types';

export class SerialService {
    private ports: Map<string, SerialPortInstance> = new Map();
    private mainWindow: BrowserWindow;
    private timedSendManager: TimedSendManager;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        // 通过闭包注入端口查询能力，避免 TimedSendManager 直接依赖 ports Map
        this.timedSendManager = new TimedSendManager(mainWindow, (id) => this.ports.get(id));
    }

    // ── 端口扫描 ──

    async listPorts(options?: { includeCom0ComNames?: boolean }) {
        const openedPaths = new Set(Array.from(this.ports.values()).map(p => p.path));
        return scanPorts(openedPaths, options);
    }

    // ── 连接管理 ──

    async open(connectionId: string, options: {
        path: string;
        baudRate: number;
        dataBits?: 5 | 6 | 7 | 8;
        stopBits?: 1 | 1.5 | 2;
        parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
    }) {
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

            port.open((err: Error | null) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    this.ports.set(connectionId, port as unknown as SerialPortInstance);

                    // 数据到来：主进程立即打时间戳，精度高于渲染进程接收时再打
                    port.on('data', (data: Buffer) => {
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

                    port.on('error', (err: Error) => {
                        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                            this.mainWindow.webContents.send('serial:error', { connectionId, error: err.message });
                        }
                    });

                    resolve({ success: true });
                }
            });
        });
    }

    async close(connectionId: string) {
        return new Promise((resolve) => {
            const port = this.ports.get(connectionId);
            if (port && port.isOpen) {
                port.close((err?: Error | null) => {
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

    async write(connectionId: string, data: string | number[]) {
        return new Promise((resolve) => {
            const port = this.ports.get(connectionId);
            if (port && port.isOpen) {
                const payload = typeof data === 'string' ? data : Buffer.from(data);
                port.write(payload, (err?: Error | null) => {
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

    // ── 定时发送（委托给 TimedSendManager） ──

    startTimedSend(connectionId: string, data: number[], intervalMs: number) {
        return this.timedSendManager.startStatic(connectionId, data, intervalMs);
    }

    stopTimedSend(connectionId: string) {
        return this.timedSendManager.stop(connectionId);
    }

    startTimedSendDynamic(
        connectionId: string,
        frames: number[][],
        intervalMs: number,
        timestampSlots: { byteOffset: number; byteSize: number; byteOrder: string; format: string }[]
    ) {
        return this.timedSendManager.startDynamic(connectionId, frames, intervalMs, timestampSlots);
    }

    stopAllTimedSends() {
        this.timedSendManager.stopAll();
    }
}
