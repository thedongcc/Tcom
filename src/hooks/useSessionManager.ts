import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SessionState, SessionConfig, LogEntry, MqttTopicConfig, MonitorSessionConfig } from '../types/session';
import { SerialPortInfo } from '../vite-env';
import { applyTXCRC, validateRXCRC } from '../utils/crc';
import { formatPortInfo } from '../utils/format';
import { Com0Com } from '../utils/com0com';
import { generateUniqueName } from '../utils/naming';

const MAX_LOGS = 1000;

export const useSessionManager = () => {
    const [sessions, setSessions] = useState<SessionState[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [savedSessions, setSavedSessions] = useState<SessionConfig[]>([]);
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [workspacePath, setWorkspacePath] = useState<string | null>(null);
    const workspacePathRef = useRef<string | null>(null);
    const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [monitorEnabled, setMonitorEnabled] = useState(() => {
        return localStorage.getItem('tcom-monitor-enabled') !== 'false'; // Default to true
    });
    const [setupcPath, setSetupcPathState] = useState(() => {
        return localStorage.getItem('tcom-setupc-path') || '';
    });

    const setSetupcPath = useCallback((path: string) => {
        setSetupcPathState(path);
        localStorage.setItem('tcom-setupc-path', path);
    }, []);

    // --- References for stable callbacks ---
    const sessionsRef = useRef<SessionState[]>([]);
    const savedSessionsRef = useRef<SessionConfig[]>([]);

    useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
    useEffect(() => { savedSessionsRef.current = savedSessions; }, [savedSessions]);

    const registeredSessions = useRef<Set<string>>(new Set());
    const cleanupRefs = useRef(new Map<string, (() => void)[]>());
    const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

    const monitorEnabledRef = useRef(monitorEnabled);
    const isAdminRef = useRef(isAdmin);

    useEffect(() => { monitorEnabledRef.current = monitorEnabled; }, [monitorEnabled]);
    useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

    // --- Helper to update specific session state ---
    const updateSession = useCallback((sessionId: string, updater: (prev: SessionState) => Partial<SessionState>) => {
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                return { ...s, ...updater(s) };
            }
            return s;
        }));
    }, []);

    // --- High Frequency Log Batching ---
    const logBufferRef = useRef<Map<string, LogEntry[]>>(new Map());
    const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

    const flushLogBuffer = useCallback(() => {
        if (logBufferRef.current.size === 0) return;

        const buffer = new Map(logBufferRef.current);
        logBufferRef.current.clear();
        batchTimerRef.current = null;

        setSessions(prev => prev.map(s => {
            const bufferLogs = buffer.get(s.id);
            if (!bufferLogs || bufferLogs.length === 0) return s;

            let newLogs = [...s.logs];
            const mergeRepeats = s.config.uiState?.mergeRepeats;

            bufferLogs.forEach(incoming => {
                const lastLog = newLogs[newLogs.length - 1];
                if (mergeRepeats && lastLog && lastLog.type === incoming.type && lastLog.topic === incoming.topic) {
                    let isSameData = false;
                    if (typeof lastLog.data === 'string' && typeof incoming.data === 'string') {
                        isSameData = lastLog.data === incoming.data;
                    } else if (lastLog.data instanceof Uint8Array && incoming.data instanceof Uint8Array) {
                        if (lastLog.data.length === incoming.data.length) {
                            isSameData = true;
                            for (let i = 0; i < incoming.data.length; i++) {
                                if (lastLog.data[i] !== incoming.data[i]) {
                                    isSameData = false;
                                    break;
                                }
                            }
                        }
                    }

                    if (isSameData) {
                        newLogs[newLogs.length - 1] = {
                            ...lastLog,
                            timestamp: incoming.timestamp,
                            repeatCount: (lastLog.repeatCount || 1) + (incoming.repeatCount || 1)
                        };
                        return;
                    }
                }
                newLogs.push(incoming);
            });

            if (newLogs.length > MAX_LOGS) {
                newLogs = newLogs.slice(-MAX_LOGS);
            }
            return { ...s, logs: newLogs };
        }));
    }, []);

    const addLog = useCallback((sessionId: string, type: LogEntry['type'], data: string | Uint8Array, crcStatus: LogEntry['crcStatus'] = 'none', topic?: string) => {
        const entry: LogEntry = { id: crypto.randomUUID(), type, data, timestamp: Date.now(), crcStatus, topic };

        let batch = logBufferRef.current.get(sessionId);
        if (!batch) {
            batch = [];
            logBufferRef.current.set(sessionId, batch);
        }
        batch.push(entry);

        if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(flushLogBuffer, 16); // Batch every frame (~60fps)
        }
    }, [flushLogBuffer]);

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

    // --- Persistence for Active Session ---

    const findSetupcPath = useCallback(() => {
        return setupcPath;
    }, [setupcPath]);

    const listPorts = useCallback(async () => {
        let allPorts: SerialPortInfo[] = [];
        if ((window as any).serialAPI) {
            const res = await (window as any).serialAPI.listPorts({ includeCom0ComNames: monitorEnabledRef.current });
            if (res.success) allPorts = res.ports;
        }
        const setupcPath = findSetupcPath();
        if (monitorEnabledRef.current && setupcPath) {
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
            } catch (e: any) {
                const errStr = e.message || String(e);
                if (!errStr.includes('Unauthorized command') && !errStr.includes('Unauthorized')) {
                    console.warn("Failed to list com0com ports", e);
                }
            }
        }
        setPorts(allPorts);
    }, [findSetupcPath]);

    // Refresh ports immediately when active session changes (Tab switching)
    useEffect(() => {
        if (activeSessionId && workspacePath) {
            localStorage.setItem(`active-session-${workspacePath}`, activeSessionId);
            listPorts();
        }
    }, [activeSessionId, workspacePath, listPorts]);

    const connectSession = useCallback(async (sessionId: string) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || session.isConnected || session.isConnecting) return;

        if (session.config.type === 'mqtt') {
            if (!window.mqttAPI) { addLog(sessionId, 'ERROR', 'MQTT API missing'); return; }
            updateSession(sessionId, () => ({ isConnecting: true }));
            try {
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
            } catch (err: any) {
                updateSession(sessionId, () => ({ isConnecting: false }));
                addLog(sessionId, 'ERROR', `Connection Error: ${err.message}`);
                return false;
            }
        }

        if (session.config.type === 'monitor') {
            if (!monitorEnabledRef.current) {
                addLog(sessionId, 'ERROR', 'Virtual serial port not enabled');
                return false;
            }
            if (!isAdminRef.current) {
                addLog(sessionId, 'ERROR', 'Admin required to start monitoring');
                return false;
            }
            const monitorConfig = session.config as MonitorSessionConfig;
            updateSession(sessionId, () => ({ isConnecting: true }));
            let actualPort = monitorConfig.pairedPort;
            if (!actualPort && monitorConfig.virtualSerialPort && setupcPath) {
                try {
                    const found = await Com0Com.findPairedPort(setupcPath, monitorConfig.virtualSerialPort);
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
                try {
                    const res = await (window as any).monitorAPI.start(sessionId, { ...monitorConfig, pairedPort: actualPort });
                    if (res.success) {
                        updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                        addLog(sessionId, 'INFO', 'Monitor started');
                        const cleanups: (() => void)[] = [];
                        cleanups.push(window.monitorAPI.onData(sessionId, (type, data) => addLog(sessionId, type, data, 'ok', type === 'TX' ? 'virtual' : 'physical')));
                        cleanups.push(window.monitorAPI.onError(sessionId, (err) => addLog(sessionId, 'ERROR', err)));
                        cleanups.push(window.monitorAPI.onClosed(sessionId, (data: any) => {
                            const { origin, path } = data;
                            const label = origin === 'Internal' ? 'Internal Bridge Port' : 'Physical Device';
                            addLog(sessionId, 'INFO', `${label}: ${path} Disconnected`);
                        }));
                        cleanupRefs.current.set(sessionId, cleanups);
                        return true;
                    } else {
                        addLog(sessionId, 'ERROR', res.error);
                        updateSession(sessionId, () => ({ isConnecting: false }));
                        return false;
                    }
                } catch (err: any) {
                    addLog(sessionId, 'ERROR', `Monitor Start Error: ${err.message}`);
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
                addLog(sessionId, 'INFO', `Connected to ${session.config.connection.path}`);
                return true;
            } else {
                updateSession(sessionId, () => ({ isConnecting: false }));
                addLog(sessionId, 'ERROR', `Failed: ${result.error}`);
                return false;
            }
        } catch (err: any) {
            updateSession(sessionId, () => ({ isConnecting: false }));
            addLog(sessionId, 'ERROR', `Serial Open Error: ${err.message}`);
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

            // Clean up IPC listeners
            const cleanups = cleanupRefs.current.get(sessionId);
            if (cleanups) {
                cleanups.forEach(c => c());
                cleanupRefs.current.delete(sessionId);
            }

            if (monitorConfig.autoDestroyPair && monitorConfig.pairedPort && setupcPath) {
                try {
                    await Com0Com.removePair(setupcPath, monitorConfig.pairedPort);
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
                // Restore active session ID for this workspace
                const savedActiveId = localStorage.getItem(`active-session-${path}`);
                if (savedActiveId) {
                    setActiveSessionId(savedActiveId);
                }
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

    const createSession = useCallback(async (type: SessionConfig['type'] = 'serial', config?: Partial<SessionConfig>) => {
        const newId = Date.now().toString();
        let baseConfig: any = { id: newId, type, autoConnect: false, ...config };

        const existingNames = savedSessionsRef.current.map(s => s.name);
        if (type === 'serial') {
            baseConfig.name = generateUniqueName(existingNames, 'Serial');
            baseConfig.connection = { path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
            baseConfig.txCRC = { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
            baseConfig.rxCRC = { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: -1 };
        } else if (type === 'mqtt') {
            baseConfig.name = generateUniqueName(existingNames, 'MQTT');
            baseConfig.host = 'broker.emqx.io'; baseConfig.port = 1883; baseConfig.clientId = `client-${Math.random().toString(16).slice(2, 8)}`;
        } else if (type === 'monitor') {
            baseConfig.name = generateUniqueName(existingNames, 'Monitor');
            baseConfig.connection = { path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
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

    const deleteSession = useCallback(async (sessionId: string) => {
        const session = savedSessionsRef.current.find(s => s.id === sessionId);
        if (!session || !workspacePathRef.current || !window.workspaceAPI) return;

        // 1. First cleanup runtime state and connections
        closeSession(sessionId);

        // 2. Then delete from persistence
        const result = await window.workspaceAPI.deleteSession(workspacePathRef.current, session);
        if (result.success) setSavedSessions(prev => prev.filter(s => s.id !== sessionId));
    }, [closeSession]);

    const duplicateSession = useCallback(async (sourceId: string) => {
        const source = sessionsRef.current.find(s => s.id === sourceId);
        if (!source) return null;
        const newId = Date.now().toString();
        const existingNames = savedSessionsRef.current.map(s => s.name);
        const newName = generateUniqueName(existingNames, source.config.name, 'Copy');
        const newConfig = { ...source.config, id: newId, name: newName };
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

        // Activate the last one if any were provided and no session is currently active
        if (configs.length > 0) {
            setActiveSessionId(prev => prev || configs[configs.length - 1].id);
        }
    }, []);

    // --- Background Tasks ---
    useEffect(() => {
        listPorts();
        const interval = setInterval(listPorts, 2000);
        const initWs = async () => {
            let admin = false;
            if (window.com0comAPI?.isAdmin) {
                admin = await window.com0comAPI.isAdmin();
                setIsAdmin(admin);
            }

            // 如果是非管理员模式启动，自动关闭监控功能，防止由于持久化的 monitorEnabled 导致权限不足时的异常闪动
            if (!admin && monitorEnabledRef.current) {
                console.log('[SessionManager] Non-admin detected, auto-disabling monitor to prevent flickering.');
                setMonitorEnabled(false);
                localStorage.setItem('tcom-monitor-enabled', 'false');
            }

            if (!window.workspaceAPI) return;
            const lastWs = await window.workspaceAPI.getLastWorkspace();
            if (lastWs.success && lastWs.path) await openWorkspace(lastWs.path);
        };
        initWs();
        return () => clearInterval(interval);
    }, [listPorts, openWorkspace]);

    const toggleMonitor = useCallback((enabled: boolean) => {
        // Strict permission check
        if (enabled && !isAdminRef.current) {
            enabled = false;
        }

        setMonitorEnabled(enabled);
        localStorage.setItem('tcom-monitor-enabled', String(enabled));
        if (enabled) {
            listPorts();
        } else {
            // Remove com0com ports from list when disabled
            setPorts(prev => prev.filter(p => p.manufacturer !== 'com0com' && !p.friendlyName?.includes('Virtual')));
        }
    }, [listPorts]);

    useEffect(() => {
        if (!window.serialAPI) return;
        sessions.forEach(session => {
            if (registeredSessions.current.has(session.id)) return;
            window.serialAPI!.onData(session.id, (data) => {
                const now = Date.now();
                // Check if chunk timeout is enabled
                const timeout = (session.config as any).uiState?.chunkTimeout || 0;
                if (timeout > 0) {
                    // Fallback to legacy immediate update if timeout logic is needed (rarely batches across frame)
                    // For performance, we keep chunking synchronous if possible or batch it too
                    addLog(session.id, 'RX', data, 'none');
                } else {
                    addLog(session.id, 'RX', data, 'none');
                }
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
        reorderSessions: async (order: SessionConfig[]) => setSavedSessions(order),
        isAdmin, monitorEnabled, toggleMonitor, setupcPath, setSetupcPath
    }), [
        sessions, activeSessionId, savedSessions, ports, workspacePath, recentWorkspaces,
        createSession, duplicateSession, closeSession, connectSession, disconnectSession,
        writeToSession, writeToMonitor, updateSessionConfig, updateUIState, clearLogs, publishMqtt,
        listPorts, saveSession, deleteSession, openSavedSession, openSavedSessions, openWorkspace, closeWorkspace, browseAndOpenWorkspace,
        isAdmin, monitorEnabled, toggleMonitor, setupcPath, setSetupcPath
    ]);
};
