/**
 * mqtt.ipc.ts
 * 注册所有 mqtt:* IPC handler（MQTT 连接、断开、发布、订阅）。
 */
import { ipcMain, BrowserWindow, app } from 'electron';

// ⚡ 延迟加载：只在首次连接时才 require，避免阻塞主进程启动
let _mqttModule: any = null;
const getMqtt = () => { if (!_mqttModule) _mqttModule = require('mqtt'); return _mqttModule; };

const mqttClients = new Map();
const pendingMqttConnections = new Set();

export function registerMqttIpc(win: BrowserWindow) {
    ipcMain.handle('mqtt:connect', async (_event, { connectionId, config }) => {
        // 防止同一 sessionId 重复发起连接
        if (pendingMqttConnections.has(connectionId)) {
            console.warn(`[MQTT] Connection already in progress for ${connectionId}, skipping.`);
            return { success: false, error: 'Connection attempt already in progress' };
        }

        pendingMqttConnections.add(connectionId);

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
            if (host && host.includes('://')) {
                try {
                    const urlObj = new URL(host);
                    host = urlObj.hostname;
                } catch (e) {
                    host = host.split('://')[1];
                }
            }

            let url = `${protocol}://${host}:${config.port}`;
            if (protocol === 'ws' || protocol === 'wss') {
                const rawPath = config.path || '/mqtt';
                const mqttPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
                url += mqttPath;
            }

            const options = {
                clientId: config.clientId,
                username: config.username,
                password: config.password,
                keepalive: config.keepAlive || 60,
                clean: config.cleanSession !== undefined ? config.cleanSession : true,
                connectTimeout: (config.connectTimeout || 30) * 1000,
                reconnectPeriod: config.autoReconnect ? 1000 : 0,
                wsOptions: {
                    origin: 'http://localhost',
                    headers: {
                        'User-Agent': `Tcom/${app.getVersion()}`
                    }
                }
            };

            console.log(`[MQTT] Connecting to ${url}`, options);

            let initialConnectHandled = false;
            let client: any = null;

            try {
                client = getMqtt().connect(url, options);
            } catch (err: any) {
                console.error(`[MQTT] Sync Error ${connectionId}:`, err);
                return finish({ success: false, error: err.message });
            }

            const handleInitialSuccess = () => {
                if (!initialConnectHandled) {
                    initialConnectHandled = true;
                    mqttClients.set(connectionId, client);
                    finish({ success: true });
                    if (!win?.isDestroyed()) win?.webContents.send('mqtt:status', { connectionId, status: 'connected' });

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
                    client.end(true);
                    finish({ success: false, error: err });
                }
            };

            const handleConnect = () => {
                if (!initialConnectHandled) {
                    handleInitialSuccess();
                } else {
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
                    if (!win?.isDestroyed()) win?.webContents.send('mqtt:error', { connectionId, error: err.message });
                }
            });

            client.on('close', () => {
                console.log(`[MQTT] Closed: ${connectionId}`);
                if (!initialConnectHandled) {
                    handleInitialError('Connection closed or timed out');
                } else {
                    if (!win?.isDestroyed()) win?.webContents.send('mqtt:status', { connectionId, status: 'disconnected' });
                }
            });
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
            client.subscribe(topic);
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
}
