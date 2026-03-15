/**
 * MonitorService.ts
 * 虚拟串口监控服务 — 在内部虚拟端口与外部物理端口之间双向转发数据。
 *
 * 架构原则：
 * - 启动后默认不转发（discard 模式）。
 * - 用 isPortBusy 持续轮询 COM3。
 *   · discard 模式下：COM4 无写入，probe 打开 COM3 不产生残包。→ 安全。
 *   · forwarding 模式下：COM3 被外部软件占用，probe 返回 "access denied" 不实际打开 COM3。→ 安全。
 *   · 外部软件断开瞬间：probe 成功打开 COM3（"not busy"），但此时立即停止转发恢复 discard。→ 安全。
 * - 状态机：PROBING（discard 等待连接）↔ FORWARDING（转发中监测断开）
 */
import { BrowserWindow } from 'electron';
import { getSerialPort } from '../utils/serialport-loader';
import { openPortWithRetry, formatPortPath, isPortBusy, forceClosePort } from './MonitorPortHelper';
import { MonitorWriteQueue } from './MonitorWriteQueue';
import type { SerialPortInstance } from '../types/serialport.types';

type MonitorState = 'probing' | 'forwarding' | 'transitioning';

/** 监控会话配置 */
interface MonitorConfig {
    pairedPort?: string;
    internalPort?: string;
    physicalSerialPort?: string;
    physicalPort?: string;
    virtualSerialPort?: string;
    baudRate?: number;
    connection?: { baudRate?: number };
}

export class MonitorService {
    private mainWindow: BrowserWindow;
    private sessions: Map<string, {
        internal: SerialPortInstance;
        physical: SerialPortInstance;
        pollTimer?: NodeJS.Timeout;
        isStopping?: boolean;
        state: MonitorState;
        portConfig: {
            internalPath: string;
            physicalPath: string;
            externalPath: string;
            baudRate: number;
        };
    }> = new Map();
    private writeQueue = new MonitorWriteQueue();

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    /** 安全发送 IPC 消息到渲染进程 */
    private send(channel: string, data: Record<string, unknown>): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    // ── 事件绑定（转发模式）──

    private setupEvents(sessionId: string, source: SerialPortInstance, target: SerialPortInstance, label: string, sourceType: 'TX' | 'RX', portPath: string) {
        source.removeAllListeners('data');
        source.removeAllListeners('error');
        source.removeAllListeners('close');

        source.on('data', (data: Buffer) => {
            this.writeQueue.enqueue(
                sessionId,
                sourceType === 'TX' ? 'physical' : 'virtual',
                () => new Promise<void>((resolve) => {
                    if (target && target.isOpen) {
                        target.write(data, (err?: Error | null) => {
                            if (err) console.error(`[Monitor] Forwarding error from ${label}:`, err.message);
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                }),
                () => {
                    const s = this.sessions.get(sessionId);
                    return !!s && !s.isStopping && s.state === 'forwarding';
                },
            );

            this.send('monitor:data', { sessionId, type: sourceType, data });
        });

        source.on('error', (err: Error) => {
            this.send('monitor:error', { sessionId, error: `${label} (${formatPortPath(portPath)}): ${err.message}` });
        });

        source.on('close', () => {
            this.send('monitor:closed', { sessionId, origin: label, path: formatPortPath(portPath) });
        });
    }

    // ── 停止转发（切换到 discard 模式）──

    private stopForwarding(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.state = 'transitioning';

        const { physical, internal } = session;
        physical.removeAllListeners('data');
        physical.removeAllListeners('error');
        physical.removeAllListeners('close');
        internal.removeAllListeners('data');
        internal.removeAllListeners('error');
        internal.removeAllListeners('close');

        // 丢弃监听器：持续消耗 physical stream
        physical.on('data', () => { /* 丢弃 */ });
    }

    // ── 统一轮询（既检测连接又检测断开）──

    private startPoll(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session || session.isStopping) return;

        if (session.pollTimer) clearInterval(session.pollTimer);

        session.pollTimer = setInterval(async () => {
            try {
                const s = this.sessions.get(sessionId);
                if (!s || s.isStopping || s.state === 'transitioning') return;
                if (!s.portConfig.externalPath) return;

                const SP = getSerialPort();
                const busy = await isPortBusy(SP, s.portConfig.externalPath);

                if (s.state === 'probing' && busy) {
                    // 外部软件刚连接 → 开始转发
                    s.state = 'transitioning';
                    console.log(`[Monitor] COM3 busy → start forwarding for ${sessionId}`);
                    this.send('monitor:partner-status', { sessionId, connected: true });
                    await this.reopenInternalPort(sessionId, true);

                } else if (s.state === 'forwarding' && !busy) {
                    // 外部软件刚断开 → 停止转发
                    console.log(`[Monitor] COM3 free → stop forwarding for ${sessionId}`);
                    this.send('monitor:partner-status', { sessionId, connected: false });
                    this.stopForwarding(sessionId);
                    await this.reopenInternalPort(sessionId, false);
                }
            } catch { /* 轮询异常静默处理 */ }
        }, 500);
    }

    // ── 重开内部桥接端口 ──

    private async reopenInternalPort(sessionId: string, startForwarding: boolean): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session || session.isStopping) return;

        const { portConfig, physical } = session;
        const { internalPath, physicalPath, baudRate } = portConfig;

        // 1. 关闭旧端口
        const old = session.internal;
        old.removeAllListeners();
        await new Promise<void>(resolve => {
            const t = setTimeout(() => resolve(), 2000);
            if (!old.isOpen) { clearTimeout(t); return resolve(); }
            old.close(() => { clearTimeout(t); resolve(); });
        });

        if (!this.sessions.has(sessionId) || this.sessions.get(sessionId)!.isStopping) return;

        // 2. 等待驱动释放
        await new Promise(r => setTimeout(r, 150));

        // 3. 重新打开
        const SP = getSerialPort();
        try {
            const newInternal = await openPortWithRetry(SP, internalPath, baudRate, 'Internal');
            session.internal = newInternal;

            if (startForwarding) {
                this.setupEvents(sessionId, newInternal, physical, 'Internal', 'TX', internalPath);
                this.setupEvents(sessionId, physical, newInternal, 'Physical', 'RX', physicalPath);
                session.state = 'forwarding';
                console.log(`[Monitor] Internal port reopened, forwarding started`);
            } else {
                session.state = 'probing';
                console.log(`[Monitor] Internal port reopened, resumed probing`);
            }
        } catch (err: unknown) {
            console.error('[Monitor] Reopen internal port failed:', (err as Error).message);
            session.state = 'probing';
        }
    }

    // ── 启动监控 ──

    async start(sessionId: string, config: MonitorConfig) {
        let internal: SerialPortInstance | null = null;
        let physical: SerialPortInstance | null = null;

        try {
            const SP = getSerialPort();
            if (this.sessions.has(sessionId)) await this.stop(sessionId);

            const internalPortPath = config.pairedPort || config.internalPort;
            const physicalPortPath = config.physicalSerialPort || config.physicalPort;
            const externalPortPath = config.virtualSerialPort || '';
            const baudRate = config.connection?.baudRate || config.baudRate || 9600;

            if (!internalPortPath || !physicalPortPath) return { success: false, error: 'Missing port configuration' };
            console.log(`[Monitor] Starting session ${sessionId}`);

            physical = await openPortWithRetry(SP, physicalPortPath, baudRate, 'Physical');
            internal = await openPortWithRetry(SP, internalPortPath, baudRate, 'Internal');

            // 初始化为 discard + probing 模式
            physical!.on('data', () => { /* 丢弃 */ });

            this.sessions.set(sessionId, {
                internal: internal!, physical: physical!, pollTimer: undefined,
                state: 'probing',
                portConfig: { internalPath: internalPortPath, physicalPath: physicalPortPath, externalPath: externalPortPath, baudRate },
            });

            this.startPoll(sessionId);

            return { success: true };
        } catch (error: unknown) {
            const errMsg = (error as Error).message;
            console.error(`[Monitor] Start failed for session ${sessionId}:`, errMsg);
            await forceClosePort(internal);
            await forceClosePort(physical);
            return { success: false, error: errMsg };
        }
    }

    // ── 停止监控 ──

    async stop(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session?.pollTimer) clearInterval(session.pollTimer);
        if (!session) return { success: true };

        session.isStopping = true;
        await Promise.all([forceClosePort(session.internal), forceClosePort(session.physical)]);
        this.sessions.delete(sessionId);
        this.writeQueue.deleteSession(sessionId);
        return { success: true };
    }

    // ── 注入写入 ──

    private performInjectionWrite(port: SerialPortInstance, payload: Buffer | string, _target: string): Promise<{ success: boolean; error?: string }> {
        return new Promise(resolve => {
            let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
                timeoutId = null;
                resolve({ success: false, error: 'Write timed out' });
            }, 1000);

            try {
                port.write(payload, async (err?: Error | null) => {
                    if (!timeoutId) return;
                    clearTimeout(timeoutId);
                    timeoutId = null;
                    if (!err) return resolve({ success: true });
                    resolve({ success: false, error: err.message });
                });
            } catch (syncErr: unknown) {
                if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                resolve({ success: false, error: (syncErr as Error).message });
            }
        });
    }

    async write(sessionId: string, target: 'virtual' | 'physical', data: string | number[]) {
        const session = this.sessions.get(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        const port = target === 'virtual' ? session.internal : session.physical;
        if (!port?.isOpen) return { success: false, error: 'Target port not open' };

        const payload = typeof data === 'string' ? data : Buffer.from(data);

        return new Promise<{ success: boolean; error?: string }>(resolve => {
            this.writeQueue.enqueue(
                sessionId,
                target,
                async () => {
                    const result = await this.performInjectionWrite(port, payload, target);
                    resolve(result);
                },
                () => !!this.sessions.get(sessionId),
            );
        });
    }
}
