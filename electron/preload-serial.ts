/**
 * preload-serial.ts
 * 串口 / MQTT / 监控模式 / TCP 通信桥接。
 * 从 preload.ts 拆分出来，按通信域分组。
 */
import { ipcRenderer, contextBridge } from 'electron';

export function registerSerialBridge() {
    contextBridge.exposeInMainWorld('serialAPI', {
        listPorts: (options?: any) => ipcRenderer.invoke('serial:list-ports', options),
        open: (connectionId: string, options: any) => ipcRenderer.invoke('serial:open', { connectionId, options }),
        close: (connectionId: string) => ipcRenderer.invoke('serial:close', { connectionId }),
        write: (connectionId: string, data: string | number[] | Uint8Array) => ipcRenderer.invoke('serial:write', { connectionId, data }),
        onData: (connectionId: string, callback: (data: Uint8Array, timestamp?: number) => void) => {
            const listener = (_: any, args: { connectionId: string, data: Uint8Array, timestamp?: number }) => {
                if (args.connectionId === connectionId) {
                    callback(args.data, args.timestamp);
                }
            };
            ipcRenderer.on('serial:data', listener);
            return () => ipcRenderer.off('serial:data', listener);
        },
        onClosed: (connectionId: string, callback: () => void) => {
            const listener = (_: any, args: { connectionId: string }) => {
                if (args.connectionId === connectionId) {
                    callback();
                }
            };
            ipcRenderer.on('serial:closed', listener);
            return () => ipcRenderer.off('serial:closed', listener);
        },
        onError: (connectionId: string, callback: (err: string) => void) => {
            const listener = (_: any, args: { connectionId: string, error: string }) => {
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
            const listener = (_: any, args: { connectionId: string, data: number[], timestamp: number }) => {
                if (args.connectionId === connectionId) {
                    callback(args.data, args.timestamp);
                }
            };
            ipcRenderer.on('serial:timed-send-tick', listener);
            return () => ipcRenderer.off('serial:timed-send-tick', listener);
        },
        // ⚡ 高精度动态定时发送（Worker 用模运算循环帧，无需 feed/replace/refill）
        timedSendStartDynamic: (connectionId: string, frames: number[][], intervalMs: number, timestampSlots: any[]) =>
            ipcRenderer.invoke('serial:timed-send-start-dynamic', { connectionId, frames, intervalMs, timestampSlots }),
    });
}

export function registerMqttBridge() {
    contextBridge.exposeInMainWorld('mqttAPI', {
        connect: (connectionId: string, config: any) => ipcRenderer.invoke('mqtt:connect', { connectionId, config }),
        disconnect: (connectionId: string) => ipcRenderer.invoke('mqtt:disconnect', { connectionId }),
        publish: (connectionId: string, topic: string, payload: any, options: any) => ipcRenderer.invoke('mqtt:publish', { connectionId, topic, payload, options }),
        subscribe: (connectionId: string, topic: string) => ipcRenderer.invoke('mqtt:subscribe', { connectionId, topic }),
        unsubscribe: (connectionId: string, topic: string) => ipcRenderer.invoke('mqtt:unsubscribe', { connectionId, topic }),

        onMessage: (connectionId: string, callback: (topic: string, payload: Uint8Array) => void) => {
            const listener = (_: any, args: { connectionId: string, topic: string, payload: Uint8Array }) => {
                if (args.connectionId === connectionId) {
                    callback(args.topic, args.payload);
                }
            };
            ipcRenderer.on('mqtt:message', listener);
            return () => ipcRenderer.off('mqtt:message', listener);
        },

        onStatus: (connectionId: string, callback: (status: string) => void) => {
            const listener = (_: any, args: { connectionId: string, status: string }) => {
                if (args.connectionId === connectionId) {
                    callback(args.status);
                }
            };
            ipcRenderer.on('mqtt:status', listener);
            return () => ipcRenderer.off('mqtt:status', listener);
        },

        onError: (connectionId: string, callback: (err: string) => void) => {
            const listener = (_: any, args: { connectionId: string, error: string }) => {
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
        start: (sessionId: string, config: any) => ipcRenderer.invoke('monitor:start', { sessionId, config }),
        stop: (sessionId: string) => ipcRenderer.invoke('monitor:stop', { sessionId }),
        write: (sessionId: string, target: 'virtual' | 'physical', data: any) => ipcRenderer.invoke('monitor:write', { sessionId, target, data }),
        onData: (sessionId: string, callback: (type: 'RX' | 'TX', data: Uint8Array) => void) => {
            const listener = (_: any, args: { sessionId: string, type: 'RX' | 'TX', data: Uint8Array }) => {
                if (args.sessionId === sessionId) {
                    callback(args.type, args.data);
                }
            };
            ipcRenderer.on('monitor:data', listener);
            return () => ipcRenderer.off('monitor:data', listener);
        },
        onError: (sessionId: string, callback: (err: string) => void) => {
            const listener = (_: any, args: { sessionId: string, error: string }) => {
                if (args.sessionId === sessionId) {
                    callback(args.error);
                }
            };
            ipcRenderer.on('monitor:error', listener);
            return () => ipcRenderer.off('monitor:error', listener);
        },
        onClosed: (sessionId: string, callback: (args: { origin: string, path: string }) => void) => {
            const listener = (_: any, args: { sessionId: string, origin: string, path: string }) => {
                if (args.sessionId === sessionId) {
                    callback({ origin: args.origin, path: args.path });
                }
            };
            ipcRenderer.on('monitor:closed', listener);
            return () => ipcRenderer.off('monitor:closed', listener);
        },
        onPartnerStatus: (sessionId: string, callback: (connected: boolean) => void) => {
            const listener = (_: any, args: { sessionId: string, connected: boolean }) => {
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
        write: (port: number, data: any) => ipcRenderer.invoke('tcp:write', { port, data }),
        onData: (callback: (port: number, data: Uint8Array) => void) => {
            const listener = (_: any, args: { port: number, data: Uint8Array }) => {
                callback(args.port, args.data);
            };
            ipcRenderer.on('tcp:data', listener);
            return () => ipcRenderer.off('tcp:data', listener);
        }
    });
}
