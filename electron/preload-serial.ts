/**
 * preload-serial.ts
 * 串口 / MQTT / 监控模式 / TCP 通信桥接。
 * 从 preload.ts 拆分出来，按通信域分组。
 */
import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron';

/** 串口列表查询选项 */
interface ListPortsOptions {
    includeCom0ComNames?: boolean;
}

/** 串口连接参数 */
interface SerialOpenOptions {
    path: string;
    baudRate: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 1.5 | 2;
    parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
}

/** 动态定时发送的时间戳槽位信息 */
interface TimestampSlot {
    byteOffset: number;
    byteSize: number;
    byteOrder: string;
    format: string;
}

/** MQTT 连接配置 */
interface MqttConnectConfig {
    host: string;
    port: number;
    protocol?: string;
    path?: string;
    clientId?: string;
    username?: string;
    password?: string;
    keepAlive?: number;
    connectTimeout?: number;
    clean?: boolean;
    reconnect?: boolean;
}

/** MQTT 发布选项 */
interface MqttPublishOptions {
    qos?: 0 | 1 | 2;
    retain?: boolean;
}

/** 监控模式启动配置 */
interface MonitorStartConfig {
    virtualSerialPort?: string;
    pairedPort?: string;
    physicalPort?: string;
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    autoDestroyPair?: boolean;
}

export function registerSerialBridge() {
    contextBridge.exposeInMainWorld('serialAPI', {
        listPorts: (options?: ListPortsOptions) => ipcRenderer.invoke('serial:list-ports', options),
        open: (connectionId: string, options: SerialOpenOptions) => ipcRenderer.invoke('serial:open', { connectionId, options }),
        close: (connectionId: string) => ipcRenderer.invoke('serial:close', { connectionId }),
        write: (connectionId: string, data: string | number[] | Uint8Array) => ipcRenderer.invoke('serial:write', { connectionId, data }),
        onData: (connectionId: string, callback: (data: Uint8Array, timestamp?: number) => void) => {
            const listener = (_: IpcRendererEvent, args: { connectionId: string, data: Uint8Array, timestamp?: number }) => {
                if (args.connectionId === connectionId) {
                    callback(args.data, args.timestamp);
                }
            };
            ipcRenderer.on('serial:data', listener);
            return () => ipcRenderer.off('serial:data', listener);
        },
        onClosed: (connectionId: string, callback: () => void) => {
            const listener = (_: IpcRendererEvent, args: { connectionId: string }) => {
                if (args.connectionId === connectionId) {
                    callback();
                }
            };
            ipcRenderer.on('serial:closed', listener);
            return () => ipcRenderer.off('serial:closed', listener);
        },
        onError: (connectionId: string, callback: (err: string) => void) => {
            const listener = (_: IpcRendererEvent, args: { connectionId: string, error: string }) => {
                if (args.connectionId === connectionId) {
                    callback(args.error);
                }
            };
            ipcRenderer.on('serial:error', listener);
            return () => ipcRenderer.off('serial:error', listener);
        },
        // ⚡ 高精度主进程定时发送
        timedSendStart: (connectionId: string, data: number[], intervalMs: number) =>
            ipcRenderer.invoke('serial:timed-send-start', { connectionId, data, intervalMs }),
        timedSendStop: (connectionId: string) =>
            ipcRenderer.invoke('serial:timed-send-stop', { connectionId }),
        onTimedSendTick: (connectionId: string, callback: (data: number[], timestamp: number) => void) => {
            const listener = (_: IpcRendererEvent, args: { connectionId: string, data: number[], timestamp: number }) => {
                if (args.connectionId === connectionId) {
                    callback(args.data, args.timestamp);
                }
            };
            ipcRenderer.on('serial:timed-send-tick', listener);
            return () => ipcRenderer.off('serial:timed-send-tick', listener);
        },
        // ⚡ 高精度动态定时发送（Worker 用模运算循环帧，无需 feed/replace/refill）
        timedSendStartDynamic: (connectionId: string, frames: number[][], intervalMs: number, timestampSlots: TimestampSlot[]) =>
            ipcRenderer.invoke('serial:timed-send-start-dynamic', { connectionId, frames, intervalMs, timestampSlots }),
    });
}

export function registerMqttBridge() {
    contextBridge.exposeInMainWorld('mqttAPI', {
        connect: (connectionId: string, config: MqttConnectConfig) => ipcRenderer.invoke('mqtt:connect', { connectionId, config }),
        disconnect: (connectionId: string) => ipcRenderer.invoke('mqtt:disconnect', { connectionId }),
        publish: (connectionId: string, topic: string, payload: string | Uint8Array | Record<string, unknown>, options: MqttPublishOptions) => ipcRenderer.invoke('mqtt:publish', { connectionId, topic, payload, options }),
        subscribe: (connectionId: string, topic: string) => ipcRenderer.invoke('mqtt:subscribe', { connectionId, topic }),
        unsubscribe: (connectionId: string, topic: string) => ipcRenderer.invoke('mqtt:unsubscribe', { connectionId, topic }),

        onMessage: (connectionId: string, callback: (topic: string, payload: Uint8Array) => void) => {
            const listener = (_: IpcRendererEvent, args: { connectionId: string, topic: string, payload: Uint8Array }) => {
                if (args.connectionId === connectionId) {
                    callback(args.topic, args.payload);
                }
            };
            ipcRenderer.on('mqtt:message', listener);
            return () => ipcRenderer.off('mqtt:message', listener);
        },

        onStatus: (connectionId: string, callback: (status: string) => void) => {
            const listener = (_: IpcRendererEvent, args: { connectionId: string, status: string }) => {
                if (args.connectionId === connectionId) {
                    callback(args.status);
                }
            };
            ipcRenderer.on('mqtt:status', listener);
            return () => ipcRenderer.off('mqtt:status', listener);
        },

        onError: (connectionId: string, callback: (err: string) => void) => {
            const listener = (_: IpcRendererEvent, args: { connectionId: string, error: string }) => {
                if (args.connectionId === connectionId) {
                    callback(args.error);
                }
            };
            ipcRenderer.on('mqtt:error', listener);
            return () => ipcRenderer.off('mqtt:error', listener);
        }
    });
}

export function registerMonitorBridge() {
    contextBridge.exposeInMainWorld('monitorAPI', {
        start: (sessionId: string, config: MonitorStartConfig) => ipcRenderer.invoke('monitor:start', { sessionId, config }),
        stop: (sessionId: string) => ipcRenderer.invoke('monitor:stop', { sessionId }),
        write: (sessionId: string, target: 'virtual' | 'physical', data: string | number[]) => ipcRenderer.invoke('monitor:write', { sessionId, target, data }),
        onData: (sessionId: string, callback: (type: 'RX' | 'TX', data: Uint8Array) => void) => {
            const listener = (_: IpcRendererEvent, args: { sessionId: string, type: 'RX' | 'TX', data: Uint8Array }) => {
                if (args.sessionId === sessionId) {
                    callback(args.type, args.data);
                }
            };
            ipcRenderer.on('monitor:data', listener);
            return () => ipcRenderer.off('monitor:data', listener);
        },
        onError: (sessionId: string, callback: (err: string) => void) => {
            const listener = (_: IpcRendererEvent, args: { sessionId: string, error: string }) => {
                if (args.sessionId === sessionId) {
                    callback(args.error);
                }
            };
            ipcRenderer.on('monitor:error', listener);
            return () => ipcRenderer.off('monitor:error', listener);
        },
        onClosed: (sessionId: string, callback: (args: { origin: string, path: string }) => void) => {
            const listener = (_: IpcRendererEvent, args: { sessionId: string, origin: string, path: string }) => {
                if (args.sessionId === sessionId) {
                    callback({ origin: args.origin, path: args.path });
                }
            };
            ipcRenderer.on('monitor:closed', listener);
            return () => ipcRenderer.off('monitor:closed', listener);
        },
        onPartnerStatus: (sessionId: string, callback: (connected: boolean) => void) => {
            const listener = (_: IpcRendererEvent, args: { sessionId: string, connected: boolean }) => {
                if (args.sessionId === sessionId) {
                    callback(args.connected);
                }
            };
            ipcRenderer.on('monitor:partner-status', listener);
            return () => ipcRenderer.off('monitor:partner-status', listener);
        }
    });
}

export function registerTcpBridge() {
    contextBridge.exposeInMainWorld('tcpAPI', {
        start: (port: number) => ipcRenderer.invoke('tcp:start', port),
        stop: (port: number) => ipcRenderer.invoke('tcp:stop', port),
        write: (port: number, data: string | number[]) => ipcRenderer.invoke('tcp:write', { port, data }),
        onData: (callback: (port: number, data: Uint8Array) => void) => {
            const listener = (_: IpcRendererEvent, args: { port: number, data: Uint8Array }) => {
                callback(args.port, args.data);
            };
            ipcRenderer.on('tcp:data', listener);
            return () => ipcRenderer.off('tcp:data', listener);
        }
    });
}
