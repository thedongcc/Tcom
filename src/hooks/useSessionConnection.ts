/**
 * useSessionConnection.ts
 * 会话连接/断开管理 Hook — 处理 Serial、MQTT、Monitor 三种连接类型。
 * 从 useSessionManager.ts 中拆分出来。
 */
import { useCallback, useRef } from 'react';
import { SessionState, SessionConfig, MonitorSessionConfig } from '../types/session';
import { Com0Com } from '../utils/com0com';

interface UseSessionConnectionParams {
    sessionsRef: React.MutableRefObject<SessionState[]>;
    updateSession: (sessionId: string, updater: (prev: SessionState) => Partial<SessionState>) => void;
    updateSessionConfig: (sessionId: string, updates: Partial<SessionConfig>) => void;
    sessionLog: {
        addLog: (sessionId: string, type: string, data: any, crcStatus?: string, topic?: string, commandName?: string, timestamp?: number) => void;
    };
    portScanner: {
        monitorEnabledRef: React.MutableRefObject<boolean>;
        isAdminRef: React.MutableRefObject<boolean>;
        setupcPath: string | null;
    };
}

export function useSessionConnection({
    sessionsRef, updateSession, updateSessionConfig, sessionLog, portScanner,
}: UseSessionConnectionParams) {
    const cleanupRefs = useRef(new Map<string, (() => void)[]>());

    // ── MQTT 连接 ──
    const connectMqtt = useCallback(async (sessionId: string, session: SessionState) => {
        if (!window.mqttAPI) { sessionLog.addLog(sessionId, 'ERROR', 'MQTT API missing'); return false; }
        updateSession(sessionId, () => ({ isConnecting: true }));
        try {
            const result = await window.mqttAPI.connect(sessionId, session.config as any);
            if (result.success) {
                updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                sessionLog.addLog(sessionId, 'INFO', `Connected to ${(session.config as any).host}`);
                const cleanups: (() => void)[] = [];
                cleanups.push(window.mqttAPI.onMessage(sessionId, (topic, payload) => sessionLog.addLog(sessionId, 'RX', payload, undefined, topic)));
                cleanups.push(window.mqttAPI.onStatus(sessionId, (status) => {
                    if (status === 'disconnected') {
                        updateSession(sessionId, () => ({ isConnected: false }));
                        sessionLog.addLog(sessionId, 'INFO', 'Disconnected (Remote)');
                    }
                }));
                cleanups.push(window.mqttAPI.onError(sessionId, (err) => sessionLog.addLog(sessionId, 'ERROR', `MQTT Error: ${err}`)));
                cleanupRefs.current.set(sessionId, cleanups);
                return true;
            } else {
                updateSession(sessionId, () => ({ isConnecting: false }));
                sessionLog.addLog(sessionId, 'ERROR', `Connection failed: ${result.error}`);
                return false;
            }
        } catch (err: unknown) {
            updateSession(sessionId, () => ({ isConnecting: false }));
            sessionLog.addLog(sessionId, 'ERROR', `Connection Error: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }, [updateSession, sessionLog]);

    // ── Monitor 连接 ──
    const connectMonitor = useCallback(async (sessionId: string, session: SessionState) => {
        if (!portScanner.monitorEnabledRef.current) {
            sessionLog.addLog(sessionId, 'ERROR', 'Virtual serial port not enabled');
            return false;
        }
        if (!portScanner.isAdminRef.current) {
            sessionLog.addLog(sessionId, 'ERROR', 'Admin required to start monitoring');
            return false;
        }
        const monitorConfig = session.config as MonitorSessionConfig;
        updateSession(sessionId, () => ({ isConnecting: true }));
        let actualPort = monitorConfig.pairedPort;
        if (!actualPort && monitorConfig.virtualSerialPort && portScanner.setupcPath) {
            try {
                const found = await Com0Com.findPairedPort(portScanner.setupcPath, monitorConfig.virtualSerialPort);
                if (found) {
                    actualPort = found;
                    void updateSessionConfig(sessionId, { pairedPort: found });
                }
            } catch (e) { console.error(e); }
        }
        if (!actualPort) {
            sessionLog.addLog(sessionId, 'ERROR', 'Missing Paired Port');
            updateSession(sessionId, () => ({ isConnecting: false }));
            return false;
        }
        if (window.monitorAPI) {
            try {
                const res = await window.monitorAPI.start(sessionId, { ...monitorConfig, pairedPort: actualPort } as any);
                if (res.success) {
                    updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                    sessionLog.addLog(sessionId, 'INFO', 'Monitor started');
                    const cleanups: (() => void)[] = [];
                    cleanups.push(window.monitorAPI.onData(sessionId, (type, data) => sessionLog.addLog(sessionId, type, data, 'ok', type === 'TX' ? 'virtual' : 'physical')));
                    cleanups.push(window.monitorAPI.onError(sessionId, (err) => sessionLog.addLog(sessionId, 'ERROR', err)));
                    cleanups.push(window.monitorAPI.onClosed(sessionId, (data: { origin: string, path: string }) => {
                        const { origin, path } = data;
                        const label = origin === 'Internal' ? 'Internal Bridge Port' : 'Physical Device';
                        sessionLog.addLog(sessionId, 'INFO', `${label}: ${path} Disconnected`);
                    }));
                    cleanupRefs.current.set(sessionId, cleanups);
                    return true;
                } else {
                    sessionLog.addLog(sessionId, 'ERROR', res.error);
                    updateSession(sessionId, () => ({ isConnecting: false }));
                    return false;
                }
            } catch (err: unknown) {
                sessionLog.addLog(sessionId, 'ERROR', `Monitor Start Error: ${err instanceof Error ? err.message : String(err)}`);
                updateSession(sessionId, () => ({ isConnecting: false }));
                return false;
            }
        }
        return false;
    }, [updateSession, updateSessionConfig, sessionLog, portScanner]);

    // ── Serial 连接 ──
    const connectSerial = useCallback(async (sessionId: string, session: SessionState) => {
        if (!window.serialAPI) return false;
        updateSession(sessionId, () => ({ isConnecting: true }));
        try {
            const result = await window.serialAPI.open(sessionId, session.config.connection);
            if (result.success) {
                updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                sessionLog.addLog(sessionId, 'INFO', `Connected to ${session.config.connection.path}`);
                return true;
            } else {
                updateSession(sessionId, () => ({ isConnecting: false }));
                sessionLog.addLog(sessionId, 'ERROR', `Failed: ${result.error}`);
                return false;
            }
        } catch (err: unknown) {
            updateSession(sessionId, () => ({ isConnecting: false }));
            sessionLog.addLog(sessionId, 'ERROR', `Serial Open Error: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }, [updateSession, sessionLog]);

    // ── 统一连接入口 ──
    const connectSession = useCallback(async (sessionId: string) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || session.isConnected || session.isConnecting) return;

        if (session.config.type === 'mqtt') return connectMqtt(sessionId, session);
        if (session.config.type === 'monitor') return connectMonitor(sessionId, session);
        return connectSerial(sessionId, session);
    }, [sessionsRef, connectMqtt, connectMonitor, connectSerial]);

    // ── 统一断开入口 ──
    const disconnectSession = useCallback(async (sessionId: string) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;

        if (session.config.type === 'serial' && window.serialAPI) {
            await window.serialAPI.close(sessionId);
        } else if (session.config.type === 'mqtt' && window.mqttAPI) {
            await window.mqttAPI.disconnect(sessionId);
            const cleanups = cleanupRefs.current.get(sessionId);
            if (cleanups) { cleanups.forEach(c => c()); cleanupRefs.current.delete(sessionId); }
        } else if (session.config.type === 'monitor' && window.monitorAPI) {
            const monitorConfig = session.config as MonitorSessionConfig;
            await window.monitorAPI.stop(sessionId);
            const cleanups = cleanupRefs.current.get(sessionId);
            if (cleanups) { cleanups.forEach(c => c()); cleanupRefs.current.delete(sessionId); }
            if (monitorConfig.autoDestroyPair && monitorConfig.pairedPort && portScanner.setupcPath) {
                try {
                    await Com0Com.removePair(portScanner.setupcPath, monitorConfig.pairedPort);
                    void updateSessionConfig(sessionId, { pairedPort: undefined });
                } catch (e) { sessionLog.addLog(sessionId, 'ERROR', `Failed to remove pair: ${e}`); }
            }
        }
        updateSession(sessionId, () => ({ isConnected: false }));
        sessionLog.addLog(sessionId, 'INFO', 'Disconnected');
    }, [sessionsRef, updateSession, sessionLog, updateSessionConfig, portScanner]);

    return { connectSession, disconnectSession };
}
