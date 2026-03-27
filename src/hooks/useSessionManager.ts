/**
 * useSessionManager.ts
 * 会话管理中枢 Hook —— 组合各个子 Hook 对外暴露统一 API。
 *
 * 子模块：
 * - ProfileContext       — Profile CRUD 与持久化（替代旧 useWorkspace）
 * - usePortScanner      — 串口扫描与 com0com 状态
 * - useSessionLog       — 日志记录与 RX 字节统计
 * - useSerialDataListener — IPC 串口数据监听
 * - useSessionConnection  — 连接/断开管理（Serial / MQTT / Monitor）
 * - useSessionDataSender  — 数据发送（Serial 写入 / MQTT 发布 / Monitor 写入）
 *
 * ⚠️ 对外 API 与原版尽量保持一致，减少消费方修改。
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SessionState, SessionConfig } from '../types/session';
import { generateUniqueName } from '../utils/naming';

import { useProfile } from '../context/ProfileContext';
import { usePortScanner } from './usePortScanner';
import { useSessionLog } from './useSessionLog';
import { useSerialDataListener } from './useSerialDataListener';
import { useSessionConnection } from './useSessionConnection';
import { useSessionDataSender } from './useSessionDataSender';

export const useSessionManager = () => {
    const [sessions, setSessions] = useState<SessionState[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // --- 组合子 Hook ---
    const profile = useProfile();
    const portScanner = usePortScanner();
    const sessionLog = useSessionLog(setSessions);

    // --- References for stable callbacks ---
    const sessionsRef = useRef<SessionState[]>([]);

    useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
    useEffect(() => { profile.savedSessionsRef.current = profile.savedSessions; }, [profile.savedSessions]);

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

// log(`[SessionManager] Updating config for ${sessionId}`, updates);

        // 1. 即时更新运行时会话
        updateSession(sessionId, (prev) => ({ config: { ...prev.config, ...updates } as SessionConfig }));

        // 2. 防抖持久化
        profile.persistSessionConfig(sessionId, updates, sessionsRef);
    }, [updateSession, profile]);

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
        if (activeSessionId && profile.activeProfile) {
            void portScanner.listPorts();
        }
    }, [activeSessionId, profile.activeProfile, portScanner.listPorts]);

    // --- 连接管理（委托给 useSessionConnection） ---
    const { connectSession, disconnectSession } = useSessionConnection({
        sessionsRef, updateSession, updateSessionConfig, sessionLog, portScanner,
    });

    // --- 数据发送（委托给 useSessionDataSender） ---
    const { writeToSession, publishMqtt, writeToMonitor } = useSessionDataSender({
        sessionsRef, sessionLog,
    });

    // --- 会话 CRUD ---
    const createSession = useCallback(async (type: SessionConfig['type'] = 'serial', config?: Partial<SessionConfig>) => {
        const newId = Date.now().toString();
        const baseConfig: Record<string, unknown> = { id: newId, type, autoConnect: false, ...config };

        const existingNames = profile.savedSessionsRef.current.map(s => s.name);
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
        } else if (type === 'dashboard') {
            baseConfig.name = generateUniqueName(existingNames, 'Dashboard');
            // Dashboard 没有原生连接需求，纯 UI 视角配置
        }

        const newState: SessionState = { id: newId, config: baseConfig as unknown as SessionConfig, isConnected: false, isConnecting: false, txBytes: 0, rxBytes: 0, logs: [] };
        setSessions(prev => [...prev, newState]);
        setActiveSessionId(newId);
        profile.setSavedSessions(prev => [...prev, baseConfig as unknown as SessionConfig]);
        await window.profileAPI?.saveSession(profile.activeProfile, baseConfig as unknown as Record<string, unknown>);
        return newId;
    }, [profile]);

    const closeSession = useCallback((sessionId: string) => {
        void disconnectSession(sessionId);
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setActiveSessionId(prev => prev === sessionId ? null : prev);
    }, [disconnectSession]);

    const deleteSession = useCallback(async (sessionId: string) => {
        const session = profile.savedSessionsRef.current.find(s => s.id === sessionId);
        if (!session) return;
        closeSession(sessionId);
        await profile.deleteSessionFromDisk(session);
    }, [closeSession, profile]);

    const duplicateSession = useCallback(async (sourceId: string) => {
        const source = sessionsRef.current.find(s => s.id === sourceId);
        if (!source) return null;
        const newId = Date.now().toString();
        const existingNames = profile.savedSessionsRef.current.map(s => s.name);
        const newName = generateUniqueName(existingNames, source.config.name, 'Copy');
        const newConfig = { ...source.config, id: newId, name: newName };
        setSessions(prev => [...prev, { id: newId, config: newConfig as unknown as SessionConfig, isConnected: false, isConnecting: false, txBytes: 0, rxBytes: 0, logs: [] }]);
        profile.setSavedSessions(prev => [...prev, newConfig as unknown as SessionConfig]);
        await window.profileAPI?.saveSession(profile.activeProfile, newConfig as unknown as Record<string, unknown>);
        return newId;
    }, [profile]);

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

    // --- 稳定的返回对象 ---
    return useMemo(() => ({
        sessions, activeSessionId, setActiveSessionId,
        savedSessions: profile.savedSessions,
        ports: portScanner.ports,
        // Profile 信息（替代旧的 workspacePath/recentWorkspaces）
        activeProfile: profile.activeProfile,
        profiles: profile.profiles,
        isProfileLoaded: profile.isLoaded,
        createSession, duplicateSession, closeSession, connectSession, disconnectSession,
        writeToSession, writeToMonitor, updateSessionConfig, updateUIState, clearLogs, publishMqtt,
        listPorts: portScanner.listPorts,
        saveSession: profile.saveSession,
        deleteSession, openSavedSession, openSavedSessions,
        switchProfile: profile.switchProfile,
        createProfile: profile.createProfile,
        deleteProfile: profile.deleteProfile,
        renameProfile: profile.renameProfile,
        refreshProfiles: profile.refreshProfiles,
        reorderSessions: async (order: SessionConfig[]) => profile.setSavedSessions(order),
        isAdmin: portScanner.isAdmin,
        monitorEnabled: portScanner.monitorEnabled,
        toggleMonitor: portScanner.toggleMonitor,
        setupcPath: portScanner.setupcPath,
        setSetupcPath: portScanner.setSetupcPath,
    }), [
        sessions, activeSessionId, profile.savedSessions, portScanner.ports,
        profile.activeProfile, profile.profiles, profile.isLoaded,
        createSession, duplicateSession, closeSession, connectSession, disconnectSession,
        writeToSession, writeToMonitor, updateSessionConfig, updateUIState, clearLogs, publishMqtt,
        portScanner.listPorts, profile.saveSession, deleteSession, openSavedSession, openSavedSessions,
        profile.switchProfile, profile.createProfile, profile.deleteProfile,
        profile.renameProfile, profile.refreshProfiles,
        portScanner.isAdmin, portScanner.monitorEnabled, portScanner.toggleMonitor,
        portScanner.setupcPath, portScanner.setSetupcPath,
    ]);
};
