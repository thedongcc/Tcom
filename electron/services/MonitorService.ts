/**
 * MonitorService
 * 负责虚拟串口监控功能：将内部虚拟端口与外部物理端口之间的数据互转发。
 */
import { BrowserWindow } from 'electron';
import { getSerialPort } from '../utils/serialport-loader';

export class MonitorService {
    private mainWindow: BrowserWindow;
    // Map<sessionId, { internal: SerialPort, physical: SerialPort, pollTimer?, isStopping? }>
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

                // 写操作超时保护，防止队列死锁
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
                    // 使用队列避免并发 I/O
                    this.enqueueWrite(sessionId, sourceType === 'TX' ? 'physical' : 'virtual', () => {
                        return new Promise((resolve) => {
                            if (target && target.isOpen) {
                                target.write(data, (err: any) => {
                                    if (err) console.error(`[Monitor] Forwarding error from ${label}:`, err.message);
                                    resolve(true);
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

                            port.close(() => { });

                            const retryPort = new SP({ path: retryPath, baudRate, autoOpen: false });
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

            // 并行开启两个端口
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

            // 强制移除所有监听器，避免触发逻辑死循环或多重报错
            internal?.removeAllListeners();
            physical?.removeAllListeners();

            const forceClose = (p: any) => new Promise(resolve => {
                if (!p) return resolve(true);
                p.close(() => resolve(true));
            });

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
                // 关键：立即移除所有监听器后直接关闭，不再执行可能 hang 的 flush/drain
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

    // 注入写入（Injection）
    async write(sessionId: string, target: 'virtual' | 'physical', data: string | number[]) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`[Monitor] Write failed: Session ${sessionId} not found`);
            return { success: false, error: 'Session not found' };
        }

        const port = target === 'virtual' ? session.internal : session.physical;

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
