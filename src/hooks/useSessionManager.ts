/**
 * useSessionManager.ts
 * 会话管理中枢 Hook —— 组合各个子 Hook 对外暴露统一 API。
 *
 * 子模块：
 * - useWorkspace        — 工作区 CRUD 与持久化
 * - usePortScanner      — 串口扫描与 com0com 状态
 * - useSessionLog       — 日志记录与 RX 字节统计
 * - useSerialDataListener — IPC 串口数据监听
 * - useSessionConnection  — 连接/断开管理（Serial / MQTT / Monitor）
 * - useSessionDataSender  — 数据发送（Serial 写入 / MQTT 发布 / Monitor 写入）
 *
 * ⚠️ 对外 API 与原版完全一致，所有消费方无需做任何修改。
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SessionState, SessionConfig } from '../types/session';
import { generateUniqueName } from '../utils/naming';

import { useWorkspace } from './useWorkspace';
import { usePortScanner } from './usePortScanner';
import { useSessionLog } from './useSessionLog';
import { useSerialDataListener } from './useSerialDataListener';
import { useSessionConnection } from './useSessionConnection';
import { useSessionDataSender } from './useSessionDataSender';

export const useSessionManager = () => {
    const [sessions, setSessions] = useState<SessionState[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // --- 组合子 Hook ---
    const workspace = useWorkspace();
    const portScanner = usePortScanner();
    const sessionLog = useSessionLog(setSessions);

    // --- References for stable callbacks ---
    const sessionsRef = useRef<SessionState[]>([]);

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
            void portScanner.listPorts();
        }
    }, [activeSessionId, workspace.workspacePath, portScanner.listPorts]);

    // --- 连接管理（委托给 useSessionConnection） ---
    const { connectSession, disconnectSession } = useSessionConnection({
        sessionsRef, updateSession, updateSessionConfig, sessionLog: sessionLog as any, portScanner,
    });

    // --- 数据发送（委托给 useSessionDataSender） ---
    const { writeToSession, publishMqtt, writeToMonitor } = useSessionDataSender({
        sessionsRef, sessionLog: sessionLog as any,
    });

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
        void disconnectSession(sessionId);
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
        void initWs();
    }, [workspace.openWorkspace]);

    // 包装 closeWorkspace
    const closeWorkspace = useCallback(() => {
        sessionsRef.current.forEach(s => { if (s.isConnected) void disconnectSession(s.id); });
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
