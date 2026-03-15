/**
 * MonitorService.ts
 * 虚拟串口监控服务 — 在内部虚拟端口与外部物理端口之间双向转发数据。
 *
 * 子模块：
 * - MonitorPortHelper.ts — 端口打开和重试逻辑
 */
import { BrowserWindow } from 'electron';
import { getSerialPort } from '../utils/serialport-loader';
import { openPortWithRetry, formatPortPath } from './MonitorPortHelper';
import type { SerialPortInstance } from '../types/serialport.types';

export class MonitorService {
    private mainWindow: BrowserWindow;
    private sessions: Map<string, { internal: SerialPortInstance; physical: SerialPortInstance; pollTimer?: NodeJS.Timeout; isStopping?: boolean }> = new Map();
    private writeQueues: Map<string, Map<'virtual' | 'physical', Promise<void>>> = new Map();

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    // ── 写入队列 ──

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

                // 写操作超时保护
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

    // ── 事件绑定 ──

    private setupEvents(sessionId: string, source: SerialPortInstance, target: SerialPortInstance, label: string, sourceType: 'TX' | 'RX', portPath: string) {
        source.removeAllListeners('data');
        source.removeAllListeners('error');
        source.removeAllListeners('close');

        source.on('data', (data: Buffer) => {
            this.enqueueWrite(sessionId, sourceType === 'TX' ? 'physical' : 'virtual', () => {
                return new Promise<void>((resolve) => {
                    if (target && target.isOpen) {
                        target.write(data, (err?: Error | null) => {
                            if (err) console.error(`[Monitor] Forwarding error from ${label}:`, err.message);
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                });
            });

            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('monitor:data', { sessionId, type: sourceType, data });
            }
        });

        source.on('error', (err: Error) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('monitor:error', { sessionId, error: `${label} (${formatPortPath(portPath)}): ${err.message}` });
            }
        });

        source.on('close', () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('monitor:closed', { sessionId, origin: label, path: formatPortPath(portPath) });
            }
        });
    }

    // ── 对端轮询 ──

    private startPartnerPoll(sessionId: string, port: SerialPortInstance): NodeJS.Timeout {
        let lastStatus = false;
        return setInterval(async () => {
            try {
                if (!port?.isOpen) return;
                const signals = await port.getControlSignals();
                const isOpen = !!(signals.carrierDetect || signals.dsr || signals.cts);
                if (isOpen === lastStatus) return;
                lastStatus = isOpen;
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('monitor:partner-status', { sessionId, connected: isOpen });
                }
            } catch { /* 轮询异常静默处理 */ }
        }, 1000);
    }

    // ── 强制关闭端口 ──

    private static forceClosePort(port: SerialPortInstance | null): Promise<void> {
        return new Promise(resolve => {
            if (!port) return resolve();
            port.close(() => resolve());
        });
    }

    // ── 安全关闭端口（含事件清理） ──

    private static safeClosePort(port: SerialPortInstance | null): Promise<void> {
        return new Promise(resolve => {
            if (!port) return resolve();
            port.removeAllListeners();
            if (port.isOpen) {
                port.close((err?: Error | null) => {
                    if (err) console.error('[Monitor] Port close error (ignored):', err.message);
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    // ── 启动监控 ──

    async start(sessionId: string, config: any) {
        let internal: SerialPortInstance | null = null;
        let physical: SerialPortInstance | null = null;
        let pollTimer: NodeJS.Timeout | null = null;

        try {
            const SP = getSerialPort();
            if (this.sessions.has(sessionId)) await this.stop(sessionId);

            const internalPortPath = config.pairedPort || config.internalPort;
            const physicalPortPath = config.physicalSerialPort || config.physicalPort;
            const baudRate = config.connection?.baudRate || config.baudRate || 9600;

            if (!internalPortPath || !physicalPortPath) return { success: false, error: 'Missing port configuration' };
            console.log(`[Monitor] Starting session ${sessionId}`);

            // 并行开启两个端口
            [internal, physical] = await Promise.all([
                openPortWithRetry(SP, internalPortPath, baudRate, 'Internal'),
                openPortWithRetry(SP, physicalPortPath, baudRate, 'Physical'),
            ]);

            // 绑定转发事件
            this.setupEvents(sessionId, internal, physical, 'Internal', 'TX', internalPortPath);
            this.setupEvents(sessionId, physical, internal, 'Physical', 'RX', physicalPortPath);

            // 轮询对端状态
            pollTimer = this.startPartnerPoll(sessionId, internal);

            this.sessions.set(sessionId, { internal, physical, pollTimer });
            return { success: true };
        } catch (error: any) {
            console.error(`[Monitor] Start failed for session ${sessionId}:`, error.message);
            clearInterval(pollTimer);
            internal?.removeAllListeners();
            physical?.removeAllListeners();
            await Promise.all([MonitorService.forceClosePort(internal), MonitorService.forceClosePort(physical)]);
            return { success: false, error: error.message };
        }
    }

    // ── 停止监控 ──

    async stop(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session?.pollTimer) clearInterval(session.pollTimer);
        if (!session) return { success: true };

        session.isStopping = true;
        await Promise.all([MonitorService.safeClosePort(session.internal), MonitorService.safeClosePort(session.physical)]);
        this.sessions.delete(sessionId);
        this.writeQueues.delete(sessionId);
        return { success: true };
    }

    // ── 注入写入：核心写操作 ──

    private performInjectionWrite(port: SerialPortInstance, payload: Buffer | string, target: string): Promise<{ success: boolean; error?: string }> {
        return new Promise(resolve => {
            let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
                timeoutId = null;
                console.error(`[Monitor] Injection write timeout for ${target}`);
                resolve({ success: false, error: 'Write timed out' });
            }, 1000);

            try {
                port.write(payload, async (err?: Error | null) => {
                    if (!timeoutId) return; // 已超时，忽略回调
                    clearTimeout(timeoutId);
                    timeoutId = null;

                    if (!err) return resolve({ success: true });

                    // 写入失败：检测对端是否未打开
                    const errorMsg = await this.diagnoseWriteError(err, port, target);
                    console.error(`[Monitor] Injection write error:`, errorMsg);
                    resolve({ success: false, error: errorMsg });
                });
            } catch (syncErr: any) {
                if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                console.error(`[Monitor] Injection write sync error:`, syncErr.message);
                resolve({ success: false, error: syncErr.message });
            }
        });
    }

    // ── 写入错误诊断 ──

    private async diagnoseWriteError(err: Error, port: SerialPortInstance, target: string): Promise<string> {
        if (target !== 'virtual' || !port.isOpen) return err.message;
        try {
            const signals = await port.getControlSignals();
            if (!signals.carrierDetect && !signals.dsr && !signals.cts) {
                return 'Write failed: Partner software (external port) is not open.';
            }
        } catch { /* 信号检查异常，使用原始错误 */ }
        return err.message;
    }

    // ── 注入写入：对外接口 ──

    async write(sessionId: string, target: 'virtual' | 'physical', data: string | number[]) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`[Monitor] Write failed: Session ${sessionId} not found`);
            return { success: false, error: 'Session not found' };
        }

        const port = target === 'virtual' ? session.internal : session.physical;
        if (!port?.isOpen) return { success: false, error: 'Target port not open' };

        const payload = typeof data === 'string' ? data : Buffer.from(data);

        return new Promise<{ success: boolean; error?: string }>(resolve => {
            this.enqueueWrite(sessionId, target, async () => {
                const result = await this.performInjectionWrite(port, payload, target);
                resolve(result);
            });
        });
    }
}
