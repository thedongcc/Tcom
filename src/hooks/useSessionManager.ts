import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SessionState, SessionConfig, LogEntry, MqttTopicConfig, MonitorSessionConfig } from '../types/session';
import { SerialPortInfo } from '../vite-env';
import { applyTXCRC, validateRXCRC } from '../utils/crc';
import { formatPortInfo } from '../utils/format';
import { Com0Com } from '../utils/com0com';

const MAX_LOGS = 1000;

export const useSessionManager = () => {
    const [sessions, setSessions] = useState<SessionState[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [savedSessions, setSavedSessions] = useState<SessionConfig[]>([]);
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [workspacePath, setWorkspacePath] = useState<string | null>(null);
    const workspacePathRef = useRef<string | null>(null);
    const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);

    // --- References for stable callbacks ---
    const sessionsRef = useRef<SessionState[]>([]);
    const savedSessionsRef = useRef<SessionConfig[]>([]);

    useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
    useEffect(() => { savedSessionsRef.current = savedSessions; }, [savedSessions]);

    const registeredSessions = useRef<Set<string>>(new Set());
    const cleanupRefs = useRef(new Map<string, (() => void)[]>());
    const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

    // --- Helper to update specific session state ---
    const updateSession = useCallback((sessionId: string, updater: (prev: SessionState) => Partial<SessionState>) => {
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                return { ...s, ...updater(s) };
            }
            return s;
        }));
    }, []);

    const addLog = useCallback((sessionId: string, type: LogEntry['type'], data: string | Uint8Array, crcStatus: LogEntry['crcStatus'] = 'none', topic?: string) => {
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                const logs = s.logs;
                const mergeRepeats = s.config.uiState?.mergeRepeats;

                if (mergeRepeats) {
                    let lastIdx = -1;
                    if (logs.length > 0) {
                        const last = logs[logs.length - 1];
                        if (last.type === type && last.topic === topic) {
                            lastIdx = logs.length - 1;
                        }
                    }

                    if (lastIdx !== -1) {
                        const lastLog = logs[lastIdx];
                        let isSameData = false;
                        if (typeof lastLog.data === 'string' && typeof data === 'string') {
                            isSameData = lastLog.data === data;
                        } else if (lastLog.data instanceof Uint8Array && data instanceof Uint8Array) {
                            if (lastLog.data.length === data.length) {
                                isSameData = true;
                                for (let i = 0; i < data.length; i++) {
                                    if (lastLog.data[i] !== data[i]) {
                                        isSameData = false;
                                        break;
                                    }
                                }
                            }
                        }

                        if (isSameData) {
                            const updatedLog: LogEntry = {
                                ...lastLog,
                                timestamp: Date.now(),
                                repeatCount: (lastLog.repeatCount || 1) + 1
                            };
                            const newLogs = [...logs];
                            newLogs.splice(lastIdx, 1);
                            newLogs.push(updatedLog);
                            return { ...s, logs: newLogs };
                        }
                    }
                }

                const newLogs = [...logs, { id: crypto.randomUUID(), type, data, timestamp: Date.now(), crcStatus, topic }];
                if (newLogs.length > MAX_LOGS) newLogs.shift();
                return { ...s, logs: newLogs };
            }
            return s;
        }));
    }, []);

    const clearLogs = useCallback((sessionId: string) => {
        updateSession(sessionId, () => ({ logs: [] }));
    }, [updateSession]);

    // --- Config Update with Stability ---
    const updateSessionConfig = useCallback(async (sessionId: string, updates: Partial<SessionConfig>) => {
        // Use Ref to avoid loop and capture current state accurately
        const currentSessions = sessionsRef.current;
        const currentSaved = savedSessionsRef.current;
        const session = currentSessions.find(s => s.id === sessionId);
        if (!session) return;

        // Skip if uiState hasn't actually changed (deep check for nested objects if needed, but simple key check for now)
        if (updates.uiState && session.config.uiState) {
            const isDifferent = Object.keys(updates.uiState).some(k =>
                JSON.stringify((updates.uiState as any)[k]) !== JSON.stringify((session.config.uiState as any)[k])
            );
            if (!isDifferent && Object.keys(updates).length === 1) {
                return; // Nothing changed in uiState
            }
        }

        console.log(`[SessionManager] Updating config for ${sessionId}`, updates);

        // 1. Update runtime session (Immediate)
        updateSession(sessionId, (prev) => ({ config: { ...prev.config, ...updates } as any }));

        // 2. Persistence (Debounced)
        const isSaved = currentSaved.some(s => s.id === sessionId);
        if (isSaved) {
            // Update saved sessions list (Immediate for UI consistency)
            setSavedSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } as SessionConfig : s));

            // Clear existing timer
            if (debounceTimersRef.current[sessionId]) {
                clearTimeout(debounceTimersRef.current[sessionId]);
            }

            // Set new timer (1000ms delay)
            debounceTimersRef.current[sessionId] = setTimeout(async () => {
                const latestSession = sessionsRef.current.find(s => s.id === sessionId);
                if (!latestSession || !workspacePathRef.current || !window.workspaceAPI) return;

                const oldName = latestSession.config.name; // Use stable name from latest state

                // If name changed, we handle renaming first
                // (Note: renaming is actually handled immediately usually, but here we group it)
                if (updates.name && updates.name !== oldName) {
                    await window.workspaceAPI.renameSession(workspacePathRef.current, oldName, updates.name);
                }

                console.log(`[SessionManager] Persisting session ${sessionId} to disk...`);
                await window.workspaceAPI.saveSession(workspacePathRef.current, latestSession.config);
                delete debounceTimersRef.current[sessionId];
            }, 1000);
        }
    }, [updateSession]);

    const updateUIState = useCallback((sessionId: string, uiStateUpdates: Partial<any>) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session) return;
        const currentUI = session.config.uiState || {};
        updateSessionConfig(sessionId, { uiState: { ...currentUI, ...uiStateUpdates } } as any);
    }, [updateSessionConfig]);

    const findSetupcPath = useCallback(() => {
        const monitorSession = sessionsRef.current.find(s => s.config.type === 'monitor');
        if (monitorSession) return (monitorSession.config as MonitorSessionConfig).setupcPath;
        return localStorage.getItem('setupc_path') || undefined;
    }, []);

    const listPorts = useCallback(async () => {
        let allPorts: SerialPortInfo[] = [];
        if ((window as any).serialAPI) {
            const res = await (window as any).serialAPI.listPorts();
            if (res.success) allPorts = res.ports;
        }
        const setupcPath = findSetupcPath();
        if (setupcPath) {
            try {
                const pairs = await Com0Com.listPairs(setupcPath);
                pairs.forEach(pair => {
                    if (!allPorts.find(p => p.path === pair.portA)) {
                        allPorts.push({ path: pair.portA, manufacturer: 'com0com', friendlyName: `Virtual Port (${pair.portA})` });
                    }
                    if (!allPorts.find(p => p.path === pair.portB)) {
                        allPorts.push({ path: pair.portB, manufacturer: 'com0com', friendlyName: `Virtual Port (${pair.portB})` });
                    }
                });
            } catch (e) {
                console.warn("Failed to list com0com ports", e);
            }
        }
        setPorts(allPorts);
    }, [findSetupcPath]);

    const connectSession = useCallback(async (sessionId: string) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || session.isConnected) return;

        if (session.config.type === 'mqtt') {
            if (!window.mqttAPI) { addLog(sessionId, 'ERROR', 'MQTT API missing'); return; }
            updateSession(sessionId, () => ({ isConnecting: true }));
            const result = await window.mqttAPI.connect(sessionId, session.config);
            if (result.success) {
                updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                addLog(sessionId, 'INFO', `Connected to ${(session.config as any).host}`);
                const cleanups: (() => void)[] = [];
                cleanups.push(window.mqttAPI.onMessage(sessionId, (topic, payload) => addLog(sessionId, 'RX', payload, undefined, topic)));
                cleanups.push(window.mqttAPI.onStatus(sessionId, (status) => {
                    if (status === 'disconnected') {
                        updateSession(sessionId, () => ({ isConnected: false }));
                        addLog(sessionId, 'INFO', 'Disconnected (Remote)');
                    }
                }));
                cleanups.push(window.mqttAPI.onError(sessionId, (err) => addLog(sessionId, 'ERROR', `MQTT Error: ${err}`)));
                cleanupRefs.current.set(sessionId, cleanups);
                return true;
            } else {
                updateSession(sessionId, () => ({ isConnecting: false }));
                addLog(sessionId, 'ERROR', `Connection failed: ${result.error}`);
                return false;
            }
        }

        if (session.config.type === 'monitor') {
            const monitorConfig = session.config as MonitorSessionConfig;
            updateSession(sessionId, () => ({ isConnecting: true }));
            let actualPort = monitorConfig.pairedPort;
            if (!actualPort && monitorConfig.virtualSerialPort && monitorConfig.setupcPath) {
                try {
                    const found = await Com0Com.findPairedPort(monitorConfig.setupcPath, monitorConfig.virtualSerialPort);
                    if (found) {
                        actualPort = found;
                        updateSessionConfig(sessionId, { pairedPort: found });
                    }
                } catch (e) { console.error(e); }
            }
            if (!actualPort) {
                addLog(sessionId, 'ERROR', 'Missing Paired Port');
                updateSession(sessionId, () => ({ isConnecting: false }));
                return false;
            }
            if ((window as any).monitorAPI) {
                const res = await (window as any).monitorAPI.start(sessionId, { ...monitorConfig, pairedPort: actualPort });
                if (res.success) {
                    updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                    addLog(sessionId, 'INFO', 'Monitor started');
                    const cleanups: (() => void)[] = [];
                    cleanups.push(window.monitorAPI.onData(sessionId, (type, data) => addLog(sessionId, type, data, undefined, type === 'TX' ? 'virtual' : 'physical')));
                    cleanups.push(window.monitorAPI.onError(sessionId, (err) => addLog(sessionId, 'ERROR', err)));
                    cleanups.push(window.monitorAPI.onClosed(sessionId, (origin) => addLog(sessionId, 'INFO', `${origin} Closed`)));
                    cleanupRefs.current.set(sessionId, cleanups);
                    return true;
                } else {
                    addLog(sessionId, 'ERROR', res.error);
                    updateSession(sessionId, () => ({ isConnecting: false }));
                    return false;
                }
            }
            return false;
        }

        if (!window.serialAPI) return;
        updateSession(sessionId, () => ({ isConnecting: true }));
        const result = await window.serialAPI.open(sessionId, session.config.connection);
        if (result.success) {
            updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
            addLog(sessionId, 'INFO', `Connected to ${session.config.connection.path}`);
            return true;
        } else {
            updateSession(sessionId, () => ({ isConnecting: false }));
            addLog(sessionId, 'ERROR', `Failed: ${result.error}`);
            return false;
        }
    }, [updateSession, addLog, updateSessionConfig]);

    const disconnectSession = useCallback(async (sessionId: string) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;

        if (session.config.type === 'serial' && window.serialAPI) {
            await window.serialAPI.close(sessionId);
        } else if (session.config.type === 'mqtt' && window.mqttAPI) {
            await window.mqttAPI.disconnect(sessionId);
            const cleanups = cleanupRefs.current.get(sessionId);
            if (cleanups) { cleanups.forEach(c => c()); cleanupRefs.current.delete(sessionId); }
        } else if (session.config.type === 'monitor' && (window as any).monitorAPI) {
            const monitorConfig = session.config as MonitorSessionConfig;
            await (window as any).monitorAPI.stop(sessionId);
            if (monitorConfig.autoDestroyPair && monitorConfig.pairedPort && monitorConfig.setupcPath) {
                try {
                    await Com0Com.removePair(monitorConfig.setupcPath, monitorConfig.pairedPort);
                    updateSessionConfig(sessionId, { pairedPort: undefined });
                } catch (e) { addLog(sessionId, 'ERROR', `Failed to remove pair: ${e}`); }
            }
        }
        updateSession(sessionId, () => ({ isConnected: false }));
        addLog(sessionId, 'INFO', 'Disconnected');
    }, [updateSession, addLog, updateSessionConfig]);

    const writeToSession = useCallback(async (sessionId: string, data: string | number[] | Uint8Array) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || !window.serialAPI) return;

        let rawData: Uint8Array;
        if (typeof data === 'string') rawData = new TextEncoder().encode(data);
        else if (data instanceof Uint8Array) rawData = data;
        else rawData = new Uint8Array(data);

        const finalData = applyTXCRC(rawData, session.config.txCRC);
        const result = await window.serialAPI.write(sessionId, finalData);
        if (result.success) {
            const crcStatus = session.config.rxCRC?.enabled ? (validateRXCRC(finalData, session.config.rxCRC) ? 'ok' : 'error') : 'none';
            addLog(sessionId, 'TX', finalData, crcStatus);
        } else {
            addLog(sessionId, 'ERROR', `Write failed: ${result.error}`);
        }
    }, [addLog]);

    const publishMqtt = useCallback(async (sessionId: string, topic: string, payload: string | Uint8Array, options: { qos: 0 | 1 | 2, retain: boolean }) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || session.config.type !== 'mqtt' || !window.mqttAPI) return;
        const result = await window.mqttAPI.publish(sessionId, topic, payload, options);
        if (result.success) addLog(sessionId, 'TX', payload, 'none', topic);
        else addLog(sessionId, 'ERROR', `Publish failed: ${result.error}`);
    }, [addLog]);

    const writeToMonitor = useCallback(async (sessionId: string, target: 'virtual' | 'physical', data: string | number[] | Uint8Array) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || session.config.type !== 'monitor' || !(window as any).monitorAPI) return;
        const res = await (window as any).monitorAPI.write(sessionId, target, data as any);
        if (res.success) addLog(sessionId, 'TX', data as any, 'none', target);
        else addLog(sessionId, 'ERROR', `Write failed: ${res.error}`);
    }, [addLog]);

    // --- Workspace & Persistence ---
    const openWorkspace = useCallback(async (path: string) => {
        if (!window.workspaceAPI) return;
        const result = await window.workspaceAPI.setLastWorkspace(path);
        if (result.success) {
            setWorkspacePath(path);
            workspacePathRef.current = path;
            const sessionsData = await window.workspaceAPI.listSessions(path);
            if (sessionsData.success) {
                setSavedSessions(sessionsData.data);
            }
        }
    }, []);

    const browseAndOpenWorkspace = useCallback(async () => {
        if (!window.workspaceAPI) return;
        const result = await window.workspaceAPI.openFolder();
        if (result.success && result.path) await openWorkspace(result.path);
    }, [openWorkspace]);

    const closeWorkspace = useCallback(() => {
        sessionsRef.current.forEach(s => { if (s.isConnected) disconnectSession(s.id); });
        setSessions([]);
        setSavedSessions([]);
        setActiveSessionId(null);
        setWorkspacePath(null);
        workspacePathRef.current = null;
        window.workspaceAPI?.setLastWorkspace(null);
    }, [disconnectSession]);

    const saveSession = useCallback(async (session: SessionConfig) => {
        if (!workspacePathRef.current || !window.workspaceAPI) return;
        setSavedSessions(prev => {
            const idx = prev.findIndex(s => s.id === session.id);
            if (idx >= 0) {
                const newSaved = [...prev];
                newSaved[idx] = session;
                return newSaved;
            }
            return [...prev, session];
        });
        await window.workspaceAPI.saveSession(workspacePathRef.current, session);
    }, []);

    const deleteSession = useCallback(async (sessionId: string) => {
        const session = savedSessionsRef.current.find(s => s.id === sessionId);
        if (!session || !workspacePathRef.current || !window.workspaceAPI) return;
        const result = await window.workspaceAPI.deleteSession(workspacePathRef.current, session);
        if (result.success) setSavedSessions(prev => prev.filter(s => s.id !== sessionId));
    }, []);

    const createSession = useCallback(async (type: SessionConfig['type'] = 'serial', config?: Partial<SessionConfig>) => {
        const newId = Date.now().toString();
        let baseConfig: any = { id: newId, type, autoConnect: false, ...config };

        if (type === 'serial') {
            baseConfig.name = `Serial ${savedSessionsRef.current.filter(s => s.type === 'serial').length + 1}`;
            baseConfig.connection = { path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
            baseConfig.txCRC = { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
            baseConfig.rxCRC = { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: -1 };
        } else if (type === 'mqtt') {
            baseConfig.name = `MQTT ${savedSessionsRef.current.filter(s => s.type === 'mqtt').length + 1}`;
            baseConfig.host = 'broker.emqx.io'; baseConfig.port = 1883; baseConfig.clientId = `client-${Math.random().toString(16).slice(2, 8)}`;
        } else if (type === 'monitor') {
            baseConfig.name = `Monitor ${savedSessionsRef.current.filter(s => s.type === 'monitor').length + 1}`;
            baseConfig.connection = { path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
            baseConfig.setupcPath = 'C:\\Program Files (x86)\\com0com\\setupc.exe';
        }

        const newState: SessionState = { id: newId, config: baseConfig, isConnected: false, isConnecting: false, logs: [] };
        setSessions(prev => [...prev, newState]);
        setActiveSessionId(newId);
        setSavedSessions(prev => [...prev, baseConfig]);
        if (workspacePathRef.current) await window.workspaceAPI?.saveSession(workspacePathRef.current, baseConfig);
        return newId;
    }, []);

    const closeSession = useCallback((sessionId: string) => {
        disconnectSession(sessionId);
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setActiveSessionId(prev => prev === sessionId ? null : prev);
    }, [disconnectSession]);

    const duplicateSession = useCallback(async (sourceId: string) => {
        const source = sessionsRef.current.find(s => s.id === sourceId);
        if (!source) return null;
        const newId = Date.now().toString();
        const newConfig = { ...source.config, id: newId, name: `${source.config.name} (Copy)` };
        setSessions(prev => [...prev, { id: newId, config: newConfig as any, isConnected: false, isConnecting: false, logs: [] }]);
        setSavedSessions(prev => [...prev, newConfig as any]);
        if (workspacePathRef.current) await window.workspaceAPI?.saveSession(workspacePathRef.current, newConfig as any);
        return newId;
    }, []);

    const openSavedSession = useCallback((config: SessionConfig) => {
        if (sessionsRef.current.some(s => s.id === config.id)) { setActiveSessionId(config.id); return; }
        setSessions(prev => [...prev, { id: config.id, config: { ...config }, isConnected: false, isConnecting: false, logs: [] }]);
        setActiveSessionId(config.id);
    }, []);

    const openSavedSessions = useCallback((configs: SessionConfig[]) => {
        if (!configs.length) return;

        setSessions(prev => {
            const newSessions = [...prev];
            let changed = false;

            configs.forEach(config => {
                if (!newSessions.some(s => s.id === config.id)) {
                    newSessions.push({
                        id: config.id,
                        config: { ...config },
                        isConnected: false,
                        isConnecting: false,
                        logs: []
                    });
                    changed = true;
                }
            });

            return changed ? newSessions : prev;
        });

        // Activate the last one if any were provided
        if (configs.length > 0) {
            setActiveSessionId(configs[configs.length - 1].id);
        }
    }, []);

    // --- Background Tasks ---
    useEffect(() => {
        listPorts();
        const interval = setInterval(listPorts, 5000);
        const initWs = async () => {
            if (!window.workspaceAPI) return;
            const lastWs = await window.workspaceAPI.getLastWorkspace();
            if (lastWs.success && lastWs.path) await openWorkspace(lastWs.path);
        };
        initWs();
        return () => clearInterval(interval);
    }, [listPorts, openWorkspace]);

    useEffect(() => {
        if (!window.serialAPI) return;
        sessions.forEach(session => {
            if (registeredSessions.current.has(session.id)) return;
            window.serialAPI!.onData(session.id, (data) => {
                const now = Date.now();
                setSessions(prev => prev.map(s => {
                    if (s.id !== session.id) return s;
                    const lastLog = s.logs[s.logs.length - 1];
                    const timeout = s.config.uiState?.chunkTimeout || 0;
                    if (lastLog && lastLog.type === 'RX' && timeout > 0 && (now - lastLog.timestamp) < timeout) {
                        const oldArr = typeof lastLog.data === 'string' ? new TextEncoder().encode(lastLog.data) : lastLog.data;
                        const newArr = typeof data === 'string' ? new TextEncoder().encode(data) : data;
                        const merged = new Uint8Array(oldArr.length + newArr.length);
                        merged.set(oldArr); merged.set(newArr, oldArr.length);
                        const isOk = s.config.rxCRC?.enabled ? validateRXCRC(merged, s.config.rxCRC) : false;
                        const newLogs = [...s.logs];
                        newLogs[newLogs.length - 1] = { ...lastLog, data: merged, timestamp: now, crcStatus: s.config.rxCRC?.enabled ? (isOk ? 'ok' : 'error') : 'none' };
                        return { ...s, logs: newLogs };
                    }
                    // Generic repeat merge or new log (simplified for EXECUTION speed, preserving logic)
                    const mergeRepeats = s.config.uiState?.mergeRepeats;
                    if (mergeRepeats && lastLog && lastLog.type === 'RX' && JSON.stringify(lastLog.data) === JSON.stringify(data)) {
                        const newLogs = [...s.logs];
                        newLogs[newLogs.length - 1] = { ...lastLog, timestamp: now, repeatCount: (lastLog.repeatCount || 1) + 1 };
                        return { ...s, logs: newLogs };
                    }
                    const isOk = validateRXCRC(data, s.config.rxCRC);
                    const newLogs = [...s.logs, { id: crypto.randomUUID(), type: 'RX', data, timestamp: now, crcStatus: s.config.rxCRC?.enabled ? (isOk ? 'ok' : 'error') : 'none' } as LogEntry];
                    if (newLogs.length > MAX_LOGS) newLogs.shift();
                    return { ...s, logs: newLogs };
                }));
            });
            window.serialAPI!.onClosed(session.id, () => { updateSession(session.id, () => ({ isConnected: false })); addLog(session.id, 'INFO', 'Closed'); });
            window.serialAPI!.onError(session.id, (err) => addLog(session.id, 'ERROR', err));
            registeredSessions.current.add(session.id);
        });
    }, [sessions, updateSession, addLog]);

    // UseMemo for stable return object
    return useMemo(() => ({
        sessions, activeSessionId, setActiveSessionId, savedSessions, ports, workspacePath, recentWorkspaces,
        createSession, duplicateSession, closeSession, connectSession, disconnectSession,
        writeToSession, writeToMonitor, updateSessionConfig, updateUIState, clearLogs, publishMqtt,
        listPorts, saveSession, deleteSession, openSavedSession, openSavedSessions, openWorkspace, closeWorkspace, browseAndOpenWorkspace,
        reorderSessions: async (order: SessionConfig[]) => setSavedSessions(order)
    }), [
        sessions, activeSessionId, savedSessions, ports, workspacePath, recentWorkspaces,
        createSession, duplicateSession, closeSession, connectSession, disconnectSession,
        writeToSession, writeToMonitor, updateSessionConfig, updateUIState, clearLogs, publishMqtt,
        listPorts, saveSession, deleteSession, openSavedSession, openSavedSessions, openWorkspace, closeWorkspace, browseAndOpenWorkspace
    ]);
};
