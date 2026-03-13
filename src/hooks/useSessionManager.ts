/**
 * useSessionManager.ts
 * 会话管理中枢 Hook —— 组合 useWorkspace、usePortScanner、useSessionLog 三个子 Hook。
 * 职责：会话 CRUD、连接/断开、发送/接收、UI 状态更新。
 *
 * ⚠️ 对外 API 与原版完全一致，所有消费方无需做任何修改。
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SessionState, SessionConfig, MonitorSessionConfig } from '../types/session';
import { validateRXCRC } from '../utils/crc';
import { Com0Com } from '../utils/com0com';
import { generateUniqueName } from '../utils/naming';

import { useWorkspace } from './useWorkspace';
import { usePortScanner } from './usePortScanner';
import { useSessionLog } from './useSessionLog';
import { useSerialDataListener } from './useSerialDataListener';

export const useSessionManager = () => {
    const [sessions, setSessions] = useState<SessionState[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // --- 组合子 Hook ---
    const workspace = useWorkspace();
    const portScanner = usePortScanner();
    const sessionLog = useSessionLog(setSessions);

    // --- References for stable callbacks ---
    const sessionsRef = useRef<SessionState[]>([]);
    const cleanupRefs = useRef(new Map<string, (() => void)[]>());

    useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
    useEffect(() => { workspace.savedSessionsRef.current = workspace.savedSessions; }, [workspace.savedSessions]);

    // --- Helper to update specific session state ---
    const updateSession = useCallback((sessionId: string, updater: (prev: SessionState) => Partial<SessionState>) => {
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                return { ...s, ...updater(s) };
            }
            return s;
        }));
    }, []);

    // --- 串口数据监听（IPC 注册，委托给独立 Hook） ---
    useSerialDataListener(sessions, sessionsRef, updateSession, sessionLog);

    // --- Config Update with Stability ---
    const updateSessionConfig = useCallback(async (sessionId: string, updates: Partial<SessionConfig>) => {
        const currentSessions = sessionsRef.current;
        const session = currentSessions.find(s => s.id === sessionId);
        if (!session) return;

        // 跳过无变化的 uiState 更新
        if (updates.uiState && session.config.uiState) {
            const isDifferent = Object.keys(updates.uiState).some(k =>
                JSON.stringify((updates.uiState as Record<string, unknown>)[k]) !== JSON.stringify((session.config.uiState as Record<string, unknown>)[k])
            );
            if (!isDifferent && Object.keys(updates).length === 1) {
                return;
            }
        }

        console.log(`[SessionManager] Updating config for ${sessionId}`, updates);

        // 1. 即时更新运行时会话
        updateSession(sessionId, (prev) => ({ config: { ...prev.config, ...updates } as SessionConfig }));

        // 2. 防抖持久化
        workspace.persistSessionConfig(sessionId, updates, sessionsRef);
    }, [updateSession, workspace]);

    const updateUIState = useCallback((sessionId: string, uiStateUpdates: Partial<Record<string, unknown>>) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session) return;
        const currentUI = session.config.uiState || {};
        updateSessionConfig(sessionId, { uiState: { ...currentUI, ...uiStateUpdates } } as Partial<SessionConfig>);
    }, [updateSessionConfig]);

    const clearLogs = useCallback((sessionId: string) => {
        sessionLog.clearLogs(sessionId, updateSession);
    }, [sessionLog, updateSession]);

    // Refresh ports when active session changes
    useEffect(() => {
        if (activeSessionId && workspace.workspacePath) {
            localStorage.setItem(`active-session-${workspace.workspacePath}`, activeSessionId);
            portScanner.listPorts();
        }
    }, [activeSessionId, workspace.workspacePath, portScanner.listPorts]);

    // --- 连接管理 ---
    const connectSession = useCallback(async (sessionId: string) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || session.isConnected || session.isConnecting) return;

        if (session.config.type === 'mqtt') {
            if (!window.mqttAPI) { sessionLog.addLog(sessionId, 'ERROR', 'MQTT API missing'); return; }
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
        }

        if (session.config.type === 'monitor') {
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
                        updateSessionConfig(sessionId, { pairedPort: found });
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
        }

        if (!window.serialAPI) return;
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
    }, [updateSession, sessionLog, updateSessionConfig, portScanner]);

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
                    updateSessionConfig(sessionId, { pairedPort: undefined });
                } catch (e) { sessionLog.addLog(sessionId, 'ERROR', `Failed to remove pair: ${e}`); }
            }
        }
        updateSession(sessionId, () => ({ isConnected: false }));
        sessionLog.addLog(sessionId, 'INFO', 'Disconnected');
    }, [updateSession, sessionLog, updateSessionConfig, portScanner.setupcPath]);

    // --- 数据发送 ---
    const writeToSession = useCallback(async (sessionId: string, data: string | number[] | Uint8Array, options?: { commandName?: string }) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || !window.serialAPI) return;

        let rawData: Uint8Array;
        if (typeof data === 'string') rawData = new TextEncoder().encode(data);
        else if (data instanceof Uint8Array) rawData = data;
        else rawData = new Uint8Array(data);

        // 直接发送原始数据（不做任何修改）
        const result = await window.serialAPI.write(sessionId, rawData);
        if (result.success) {
            // 根据 crcTarget 决定是否对 TX 日志数据做 CRC 校验显示
            const uiState = (session.config as any).uiState as Record<string, unknown> || {};
            const crcTarget = (uiState.crcTarget as string) || 'rx';
            const shouldValidateTx = session.config.rxCRC?.enabled && (crcTarget === 'tx' || crcTarget === 'both');
            const txCrcStatus: 'ok' | 'error' | 'none' = shouldValidateTx
                ? (validateRXCRC(rawData, session.config.rxCRC!) ? 'ok' : 'error')
                : 'none';
            sessionLog.addLog(sessionId, 'TX', rawData, txCrcStatus, undefined, options?.commandName, Date.now());
        } else {
            sessionLog.addLog(sessionId, 'ERROR', `Write failed: ${result.error}`);
        }
    }, [sessionLog]);

    const publishMqtt = useCallback(async (sessionId: string, topic: string, payload: string | Uint8Array, options: { qos: 0 | 1 | 2, retain: boolean, commandName?: string }) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || session.config.type !== 'mqtt' || !window.mqttAPI) return;
        const result = await window.mqttAPI.publish(sessionId, topic, payload, options);
        if (result.success) sessionLog.addLog(sessionId, 'TX', payload, 'none', topic, options.commandName);
        else sessionLog.addLog(sessionId, 'ERROR', `Publish failed: ${result.error}`);
    }, [sessionLog]);

    const writeToMonitor = useCallback(async (sessionId: string, target: 'virtual' | 'physical', data: string | number[] | Uint8Array, options?: { commandName?: string }) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || session.config.type !== 'monitor' || !window.monitorAPI) return;
        const pData = data instanceof Uint8Array ? Array.from(data) : typeof data === 'string' ? data : data;
        const res = await window.monitorAPI.write(sessionId, target, pData);
        if (res.success) sessionLog.addLog(sessionId, 'TX', data as Uint8Array, 'none', target, options?.commandName);
        else sessionLog.addLog(sessionId, 'ERROR', `Write failed: ${res.error}`);
    }, [sessionLog]);

    // --- 会话 CRUD ---
    const createSession = useCallback(async (type: SessionConfig['type'] = 'serial', config?: Partial<SessionConfig>) => {
        const newId = Date.now().toString();
        const baseConfig: Record<string, unknown> = { id: newId, type, autoConnect: false, ...config };

        const existingNames = workspace.savedSessionsRef.current.map(s => s.name);
        if (type === 'serial') {
            baseConfig.name = generateUniqueName(existingNames, 'Serial');
            baseConfig.connection = { path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
            baseConfig.txCRC = { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
            baseConfig.rxCRC = { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
        } else if (type === 'mqtt') {
            baseConfig.name = generateUniqueName(existingNames, 'MQTT');
            baseConfig.host = 'broker.emqx.io'; baseConfig.port = 1883; baseConfig.clientId = `client-${Math.random().toString(16).slice(2, 8)}`;
        } else if (type === 'monitor') {
            baseConfig.name = generateUniqueName(existingNames, 'Monitor');
            baseConfig.connection = { path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
        }

        const newState: SessionState = { id: newId, config: baseConfig as unknown as SessionConfig, isConnected: false, isConnecting: false, txBytes: 0, rxBytes: 0, logs: [] };
        setSessions(prev => [...prev, newState]);
        setActiveSessionId(newId);
        workspace.setSavedSessions(prev => [...prev, baseConfig as unknown as SessionConfig]);
        if (workspace.workspacePathRef.current) await window.workspaceAPI?.saveSession(workspace.workspacePathRef.current, baseConfig as any);
        return newId;
    }, [workspace]);

    const closeSession = useCallback((sessionId: string) => {
        disconnectSession(sessionId);
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setActiveSessionId(prev => prev === sessionId ? null : prev);
    }, [disconnectSession]);

    const deleteSession = useCallback(async (sessionId: string) => {
        const session = workspace.savedSessionsRef.current.find(s => s.id === sessionId);
        if (!session) return;
        closeSession(sessionId);
        await workspace.deleteSessionFromDisk(session);
    }, [closeSession, workspace]);

    const duplicateSession = useCallback(async (sourceId: string) => {
        const source = sessionsRef.current.find(s => s.id === sourceId);
        if (!source) return null;
        const newId = Date.now().toString();
        const existingNames = workspace.savedSessionsRef.current.map(s => s.name);
        const newName = generateUniqueName(existingNames, source.config.name, 'Copy');
        const newConfig = { ...source.config, id: newId, name: newName };
        setSessions(prev => [...prev, { id: newId, config: newConfig as unknown as SessionConfig, isConnected: false, isConnecting: false, txBytes: 0, rxBytes: 0, logs: [] }]);
        workspace.setSavedSessions(prev => [...prev, newConfig as unknown as SessionConfig]);
        if (workspace.workspacePathRef.current) await window.workspaceAPI?.saveSession(workspace.workspacePathRef.current, newConfig as any);
        return newId;
    }, [workspace]);

    const openSavedSession = useCallback((config: SessionConfig) => {
        if (sessionsRef.current.some(s => s.id === config.id)) { setActiveSessionId(config.id); return; }
        setSessions(prev => [...prev, { id: config.id, config: { ...config }, isConnected: false, isConnecting: false, txBytes: 0, rxBytes: 0, logs: [] }]);
        setActiveSessionId(config.id);
    }, []);

    const openSavedSessions = useCallback((configs: SessionConfig[]) => {
        if (!configs.length) return;
        setSessions(prev => {
            const newSessions = [...prev];
            let changed = false;
            configs.forEach(config => {
                if (!newSessions.some(s => s.id === config.id)) {
                    newSessions.push({ id: config.id, config: { ...config }, isConnected: false, isConnecting: false, txBytes: 0, rxBytes: 0, logs: [] });
                    changed = true;
                }
            });
            return changed ? newSessions : prev;
        });
        if (configs.length > 0) {
            setActiveSessionId(prev => prev || configs[configs.length - 1].id);
        }
    }, []);

    // --- 工作区初始化 ---
    useEffect(() => {
        const initWs = async () => {
            if (!window.workspaceAPI) return;
            const lastWs = await window.workspaceAPI.getLastWorkspace();
            if (lastWs.success && lastWs.path) await workspace.openWorkspace(lastWs.path);
        };
        initWs();
    }, [workspace.openWorkspace]);

    // 包装 closeWorkspace
    const closeWorkspace = useCallback(() => {
        sessionsRef.current.forEach(s => { if (s.isConnected) disconnectSession(s.id); });
        setSessions([]);
        setActiveSessionId(null);
        workspace.closeWorkspace(() => { });
    }, [disconnectSession, workspace]);



    // --- 稳定的返回对象 ---
    return useMemo(() => ({
        sessions, activeSessionId, setActiveSessionId,
        savedSessions: workspace.savedSessions,
        ports: portScanner.ports,
        workspacePath: workspace.workspacePath,
        recentWorkspaces: workspace.recentWorkspaces,
        createSession, duplicateSession, closeSession, connectSession, disconnectSession,
        writeToSession, writeToMonitor, updateSessionConfig, updateUIState, clearLogs, publishMqtt,
        listPorts: portScanner.listPorts,
        saveSession: workspace.saveSession,
        deleteSession, openSavedSession, openSavedSessions,
        openWorkspace: workspace.openWorkspace,
        closeWorkspace,
        browseAndOpenWorkspace: workspace.browseAndOpenWorkspace,
        reorderSessions: async (order: SessionConfig[]) => workspace.setSavedSessions(order),
        isAdmin: portScanner.isAdmin,
        monitorEnabled: portScanner.monitorEnabled,
        toggleMonitor: portScanner.toggleMonitor,
        setupcPath: portScanner.setupcPath,
        setSetupcPath: portScanner.setSetupcPath,
    }), [
        sessions, activeSessionId, workspace.savedSessions, portScanner.ports,
        workspace.workspacePath, workspace.recentWorkspaces,
        createSession, duplicateSession, closeSession, connectSession, disconnectSession,
        writeToSession, writeToMonitor, updateSessionConfig, updateUIState, clearLogs, publishMqtt,
        portScanner.listPorts, workspace.saveSession, deleteSession, openSavedSession, openSavedSessions,
        workspace.openWorkspace, closeWorkspace, workspace.browseAndOpenWorkspace,
        portScanner.isAdmin, portScanner.monitorEnabled, portScanner.toggleMonitor,
        portScanner.setupcPath, portScanner.setSetupcPath,
    ]);
};
