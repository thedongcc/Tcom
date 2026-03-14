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

// ── 构建 MQTT 连接 URL ──

function buildMqttUrl(config: any): string {
    const protocol = config.protocol || 'tcp';
    let host = config.host;
    if (host?.includes('://')) {
        try { host = new URL(host).hostname; }
        catch { host = host.split('://')[1]; }
    }
    let url = `${protocol}://${host}:${config.port}`;
    if (protocol === 'ws' || protocol === 'wss') {
        const rawPath = config.path || '/mqtt';
        url += rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    }
    return url;
}

// ── 自动订阅 Topics ──

function autoSubscribeTopics(client: any, topics: any[]) {
    if (!Array.isArray(topics)) return;
    for (const t of topics) {
        if (typeof t === 'string') { client.subscribe(t); }
        else if (t?.path && t.subscribed) { client.subscribe(t.path); }
    }
}

// ── 安全发送渲染进程消息 ──

function safeSend(win: BrowserWindow | null, channel: string, data: any) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ── MQTT 连接核心 ──

function handleMqttConnect(win: BrowserWindow, connectionId: string, config: any): Promise<{ success: boolean; error?: string }> {
    if (pendingMqttConnections.has(connectionId)) {
        return Promise.resolve({ success: false, error: 'Connection attempt already in progress' });
    }

    pendingMqttConnections.add(connectionId);

    return new Promise(resolve => {
        const finish = (result: any) => { pendingMqttConnections.delete(connectionId); resolve(result); };

        // 清理已有连接
        if (mqttClients.has(connectionId)) {
            const existing = mqttClients.get(connectionId);
            if (existing.connected) existing.end(true);
            mqttClients.delete(connectionId);
        }

        const url = buildMqttUrl(config);
        const options = {
            clientId: config.clientId,
            username: config.username,
            password: config.password,
            keepalive: config.keepAlive || 60,
            clean: config.cleanSession !== undefined ? config.cleanSession : true,
            connectTimeout: (config.connectTimeout || 30) * 1000,
            reconnectPeriod: config.autoReconnect ? 1000 : 0,
            wsOptions: { origin: 'http://localhost', headers: { 'User-Agent': `Tcom/${app.getVersion()}` } }
        };

        console.log(`[MQTT] Connecting to ${url}`, options);

        let handled = false;
        let client: any;
        try { client = getMqtt().connect(url, options); }
        catch (err: any) { return finish({ success: false, error: err.message }); }

        const onFirstSuccess = () => {
            if (handled) return;
            handled = true;
            mqttClients.set(connectionId, client);
            finish({ success: true });
            safeSend(win, 'mqtt:status', { connectionId, status: 'connected' });
            autoSubscribeTopics(client, config.topics);
        };

        const onFirstError = (err: string) => {
            if (handled) return;
            handled = true;
            client.end(true);
            finish({ success: false, error: err });
        };

        client.on('connect', () => {
            if (!handled) onFirstSuccess();
            else safeSend(win, 'mqtt:status', { connectionId, status: 'connected' });
        });

        client.on('message', (topic: string, message: Buffer) => {
            safeSend(win, 'mqtt:message', { connectionId, topic, payload: message });
        });

        client.on('error', (err: Error) => {
            console.error(`[MQTT] Error ${connectionId}:`, err);
            if (!handled) onFirstError(err.message);
            else safeSend(win, 'mqtt:error', { connectionId, error: err.message });
        });

        client.on('close', () => {
            console.log(`[MQTT] Closed: ${connectionId}`);
            if (!handled) onFirstError('Connection closed or timed out');
            else safeSend(win, 'mqtt:status', { connectionId, status: 'disconnected' });
        });
    });
}

// ── IPC 注册 ──

export function registerMqttIpc(win: BrowserWindow) {
    ipcMain.handle('mqtt:connect', async (_event, { connectionId, config }) => {
        return handleMqttConnect(win, connectionId, config);
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
        if (!client) return { success: false, error: 'Client not connected' };
        return new Promise(resolve => {
            client.publish(topic, Buffer.from(payload), options, (err: Error | undefined) => {
                resolve(err ? { success: false, error: err.message } : { success: true });
            });
        });
    });

    ipcMain.handle('mqtt:subscribe', async (_event, { connectionId, topic }) => {
        const client = mqttClients.get(connectionId);
        if (client) { client.subscribe(topic); return { success: true }; }
        return { success: false };
    });

    ipcMain.handle('mqtt:unsubscribe', async (_event, { connectionId, topic }) => {
        const client = mqttClients.get(connectionId);
        if (client) { client.unsubscribe(topic); return { success: true }; }
        return { success: false };
    });
}

