import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionState, SessionConfig, LogEntry, MqttTopicConfig } from '../types/session';
import { SerialPortInfo } from '../vite-env';
import { applyTXCRC, validateRXCRC } from '../utils/crc';
import { formatPortInfo } from '../utils/format';
// virtualPortService removed - no longer needed

const MAX_LOGS = 1000;

export const useSessionManager = () => {
    const [sessions, setSessions] = useState<SessionState[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [savedSessions, setSavedSessions] = useState<SessionConfig[]>([]);
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [workspacePath, setWorkspacePath] = useState<string | null>(null);
    const workspacePathRef = useRef<string | null>(null);
    const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);

    // We'll use a ref to track registered listeners to avoid duplicates/churn
    const registeredSessions = useRef<Set<string>>(new Set());
    const cleanupRefs = useRef(new Map<string, (() => void)[]>());

    // Helper to update a specific session
    const updateSession = useCallback((sessionId: string, updater: (prev: SessionState) => Partial<SessionState>) => {
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                return { ...s, ...updater(s) };
            }
            return s;
        }));
    }, []);

    const addLog = useCallback((sessionId: string, type: LogEntry['type'], data: string | Uint8Array, crcStatus: LogEntry['crcStatus'] = 'none', topic?: string) => {
        // console.log(`[SM] addLog ${sessionId} [${type}] dataLen=${data.length}`);
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                const logs = s.logs;
                const lastLog = logs[logs.length - 1];
                const mergeRepeats = s.config.uiState?.mergeRepeats;

                // Check for duplicate to merge
                if (mergeRepeats && lastLog && lastLog.type === type && lastLog.topic === topic) {
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
                        // Merge!
                        const newLogs = [...logs];
                        newLogs[newLogs.length - 1] = {
                            ...lastLog,
                            timestamp: Date.now(), // Update timestamp to latest
                            repeatCount: (lastLog.repeatCount || 1) + 1
                        };
                        return { ...s, logs: newLogs };
                    }
                }

                const newLogs = [...logs, { type, data, timestamp: Date.now(), crcStatus, topic }];
                if (newLogs.length > MAX_LOGS) newLogs.shift();
                return { ...s, logs: newLogs };
            }
            return s;
        }));
    }, []);

    const clearLogs = useCallback((sessionId: string) => {
        updateSession(sessionId, () => ({ logs: [] }));
    }, [updateSession]);

    // --- Serial API Interactions ---

    const listPorts = useCallback(async () => {
        if (!window.serialAPI) return;
        const result = await window.serialAPI.listPorts();
        if (result.success) {
            setPorts(result.ports);
        } else {
            console.error('Failed to list ports:', result.error);
        }
    }, []);

    const connectSession = useCallback(async (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || session.isConnected) return;

        // MQTT Connection
        if (session.config.type === 'mqtt') {
            if (!window.mqttAPI) {
                addLog(sessionId, 'ERROR', 'MQTT API not available (Electron context missing?)');
                return;
            }

            updateSession(sessionId, () => ({ isConnecting: true }));
            const result = await window.mqttAPI.connect(sessionId, session.config);

            if (result.success) {
                updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                addLog(sessionId, 'INFO', `Connected to ${(session.config as any).host}`);

                // Register Listeners
                const cleanups: (() => void)[] = [];

                cleanups.push(window.mqttAPI.onMessage(sessionId, (topic, payload) => {
                    addLog(sessionId, 'RX', payload, undefined, topic);
                }));

                cleanups.push(window.mqttAPI.onStatus(sessionId, (status) => {
                    if (status === 'disconnected') {
                        updateSession(sessionId, () => ({ isConnected: false }));
                        addLog(sessionId, 'INFO', 'Disconnected (Remote)');
                    }
                }));

                cleanups.push(window.mqttAPI.onError(sessionId, (err) => {
                    addLog(sessionId, 'ERROR', `MQTT Error: ${err}`);
                }));

                cleanupRefs.current.set(sessionId, cleanups);
            } else {
                updateSession(sessionId, () => ({ isConnecting: false }));
                addLog(sessionId, 'ERROR', `Connection failed: ${result.error}`);
            }
            return;
        }

        if (session.config.type && session.config.type !== 'serial') {
            console.warn('Connect not implemented for other non-serial sessions yet');
            return;
        }

        if (!window.serialAPI) return;

        updateSession(sessionId, () => ({ isConnecting: true }));

        const { connection: options } = session.config;

        // Virtual port support removed

        const result = await window.serialAPI.open(sessionId, options);
        console.log('[connectSession] API Result for', options.path, ':', result);

        if (result.success) {
            updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
            const { baudRate, dataBits, parity, stopBits } = options;
            addLog(sessionId, 'INFO', `Connected to ${options.path} (${baudRate}-${dataBits}-${parity.toUpperCase()}-${stopBits})`);
            return true;
        } else {
            updateSession(sessionId, () => ({ isConnecting: false }));
            addLog(sessionId, 'ERROR', `Failed to connect: ${result.error}`);
            console.warn('[connectSession] Failed:', result);
            return false;
        }
    }, [sessions, updateSession, addLog]);

    const disconnectSession = useCallback(async (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;

        if (session.config.type === 'serial') {
            if (window.serialAPI) {
                await window.serialAPI.close(sessionId);
            }
        } else if (session.config.type === 'mqtt') {
            if (window.mqttAPI) {
                await window.mqttAPI.disconnect(sessionId);
            }
            // Execute cleanups
            const cleanups = cleanupRefs.current.get(sessionId);
            if (cleanups) {
                cleanups.forEach(c => c());
                cleanupRefs.current.delete(sessionId);
            }
        }

        updateSession(sessionId, () => ({ isConnected: false }));
        addLog(sessionId, 'INFO', 'Disconnected');
    }, [sessions, updateSession, addLog]);

    const writeToSession = useCallback(async (sessionId: string, data: string | number[] | Uint8Array) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;

        if (session.config.type && session.config.type !== 'serial') {
            console.warn('Write not implemented for non-serial sessions yet');
            return;
        }

        if (!window.serialAPI) return;

        // Process data (CRC)
        // Process data (CRC)
        let rawData: Uint8Array;
        if (typeof data === 'string') {
            rawData = new TextEncoder().encode(data);
        } else if (data instanceof Uint8Array) {
            rawData = data;
        } else {
            rawData = new Uint8Array(data);
        }

        const finalData = applyTXCRC(rawData, session.config.txCRC);

        // Virtual port support removed

        const result = await window.serialAPI.write(sessionId, finalData);

        if (result.success) {
            // Also validate TX data with RX CRC config if enabled
            const crcStatus = session.config.rxCRC?.enabled
                ? (validateRXCRC(finalData, session.config.rxCRC) ? 'ok' : 'error')
                : 'none';
            addLog(sessionId, 'TX', finalData, crcStatus);
        } else {
            addLog(sessionId, 'ERROR', `Write failed: ${result.error}`);
        }
    }, [sessions, updateSession, addLog]);

    const publishMqtt = useCallback(async (sessionId: string, topic: string, payload: string | Uint8Array, options: { qos: 0 | 1 | 2, retain: boolean }) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;
        if (session.config.type !== 'mqtt') return;
        if (!window.mqttAPI) return;

        // publish
        const result = await window.mqttAPI.publish(sessionId, topic, payload, options);

        if (result.success) {
            // Log TX via addLog to support merging
            addLog(sessionId, 'TX', payload, 'none', topic);
        } else {
            addLog(sessionId, 'ERROR', `Publish failed: ${result.error}`);
        }
    }, [sessions, addLog]);

    // Mock Incoming Messages for MQTT - DISABLED for clarity
    /*
    useEffect(() => {
        const interval = setInterval(() => {
            sessions.forEach(session => {
                if (session.config.type === 'mqtt' && session.isConnected) {
                    const topics = (session.config as any).topics || [];
                    const topic = topics.length > 0 ? topics[Math.floor(Math.random() * topics.length)] : 'random/topic';
                    const data = `Mock Data ${Math.floor(Math.random() * 1000)}`;
                    
                    addLog(session.id, 'RX', data, undefined, topic);
                }
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [sessions, addLog]);
    */


    // --- Session Management ---

    const createSession = useCallback(async (type: SessionConfig['type'] = 'serial', config?: Partial<SessionConfig>) => {
        const newId = Date.now().toString();

        let baseConfig: SessionConfig;

        if (type === 'mqtt') {
            baseConfig = {
                id: newId,
                name: `MQTT ${savedSessions.filter(s => s.type === 'mqtt').length + 1}`,
                type: 'mqtt',
                autoConnect: false,
                protocol: 'tcp',
                host: 'broker.emqx.io',
                port: 1883,
                clientId: `client-${Math.random().toString(16).substring(2, 8)}`,
                keepAlive: 60,
                cleanSession: true,
                autoReconnect: true,
                connectTimeout: 30,
                topics: [],
                ...config
            } as any;
        } else if (type === 'graph') {
            baseConfig = {
                id: newId,
                name: `Graph ${savedSessions.filter(s => s.type === 'graph').length + 1}`,
                type: 'graph',
                autoConnect: false,
                graphData: { nodes: [], edges: [] },
                ...config
            } as any;
        } else if (type === 'settings') {
            baseConfig = {
                id: newId,
                name: 'Settings',
                type: 'settings',
                autoConnect: false,
                ...config
            } as any;
        } else {
            // Default to Serial
            baseConfig = {
                id: newId,
                name: `Serial ${savedSessions.filter(s => s.type === 'serial').length + 1}`,
                type: 'serial',
                connection: {
                    path: '',
                    baudRate: 115200,
                    dataBits: 8,
                    stopBits: 1,
                    parity: 'none'
                },
                txCRC: { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 },
                rxCRC: { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: -1 },
                autoConnect: false,
                uiState: {
                    inputContent: '',
                    inputMode: 'hex',
                    lineEnding: '\r\n',
                    viewMode: 'hex',
                    filterMode: 'all',
                    encoding: 'utf-8',
                    fontSize: 13,
                    fontFamily: 'mono',
                    showTimestamp: true
                },
                ...config
            } as any;
        }

        const newSession: SessionState = {
            id: newId,
            config: baseConfig,
            isConnected: false,
            isConnecting: false,
            logs: []
        };

        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(newId);

        // Persist immediately to workspace
        const newSaved = [...savedSessions, baseConfig];
        setSavedSessions(newSaved);
        if (workspacePathRef.current && window.workspaceAPI) {
            await window.workspaceAPI.saveSession(workspacePathRef.current, baseConfig);
        }

        return newId;
    }, [sessions, savedSessions]);

    const closeSession = useCallback((sessionId: string) => {
        disconnectSession(sessionId); // Ensure disconnected
        setSessions(prev => {
            const newSessions = prev.filter(s => s.id !== sessionId);
            return newSessions;
        });
        if (activeSessionId === sessionId) {
            // Logic to pick next active session is handled in UI usually, but we can do it here too
            // For now simple logic:
            setActiveSessionId(prev => prev === sessionId ? null : prev);
        }
    }, [disconnectSession, activeSessionId]);

    const duplicateSession = useCallback(async (sourceSessionId: string) => {
        const sourceSession = sessions.find(s => s.id === sourceSessionId);
        if (!sourceSession) return null;

        const newId = Date.now().toString();
        const newConfig = {
            ...sourceSession.config,
            id: newId,
            name: `${sourceSession.config.name} (Copy)`
        };

        const newSession: SessionState = {
            id: newId,
            config: newConfig as SessionConfig,
            isConnected: false,
            isConnecting: false,
            logs: [] // 不复制日志，只复制配置和 UI 状态
        };

        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(newId);

        // Persist
        const newSaved = [...savedSessions, newConfig as SessionConfig];
        setSavedSessions(newSaved);
        if (workspacePathRef.current && window.workspaceAPI) {
            await window.workspaceAPI.saveSession(workspacePathRef.current, newConfig);
        }

        return newId;
    }, [sessions, savedSessions]);

    // --- Global Listeners Setup ---
    // We need to setup listeners for ALL sessions.
    // Since listeners in preload are filtering by ID now, we need to register a listener for each session
    // OR we can make a single listener for all if we change the preload.
    // Given the current preload implementation:
    // onData(connectionId, callback)
    // We should register listeners when a session connects?
    // actually, it's better to register them when session is created, so we catch anything.

    // A better approach for React is to have a side-effect that syncs listeners with sessions.

    // We'll use a ref to track registered listeners to avoid duplicates/churn (moved to top)


    useEffect(() => {
        if (!window.serialAPI) return;

        sessions.forEach(session => {
            if (!registeredSessions.current.has(session.id)) {
                // Register
                const cleanupData = window.serialAPI.onData(session.id, (data) => {
                    setSessions(prev => {
                        const s = prev.find(x => x.id === session.id);
                        if (!s) return prev;

                        const now = Date.now();
                        const logs = s.logs;
                        const lastLog = logs[logs.length - 1];
                        const timeout = s.config.uiState?.chunkTimeout ?? 100; // Default 100ms if not set? Or 0? Let's say 0 is disabled, but user requested feature so default should probably be sensible or 0.
                        // Actually, if feature is "added", default probably 0 (disabled) to preserve old behavior, or small value.
                        // Let's rely on config.

                        const shouldMerge = lastLog &&
                            lastLog.type === 'RX' &&
                            timeout > 0 &&
                            (now - lastLog.timestamp) < timeout;

                        if (shouldMerge) {
                            // Merge
                            let newData: Uint8Array | string;
                            if (typeof lastLog.data === 'string' && typeof data === 'string') {
                                newData = lastLog.data + data;
                            } else {
                                // Convert both to Uint8Array
                                const oldArr = typeof lastLog.data === 'string' ? new TextEncoder().encode(lastLog.data) : lastLog.data;
                                const newArr = typeof data === 'string' ? new TextEncoder().encode(data) : data;
                                const merged = new Uint8Array(oldArr.length + newArr.length);
                                merged.set(oldArr);
                                merged.set(newArr, oldArr.length);
                                newData = merged;
                            }

                            // Update last log
                            // Re-validate CRC on full packet? Or just status?
                            // If we merge, we are building a larger packet. CRC might become valid.
                            // Ensure we have Uint8Array for validation
                            const dataToValidate = typeof newData === 'string' ? new TextEncoder().encode(newData) : newData;
                            const isOk = s.config.rxCRC?.enabled ? validateRXCRC(dataToValidate, s.config.rxCRC) : false;
                            const crcStatus = s.config.rxCRC?.enabled ? (isOk ? 'ok' : 'error') : 'none';

                            const newLogs = [...logs];
                            newLogs[newLogs.length - 1] = {
                                ...lastLog,
                                data: newData,
                                timestamp: now, // Update timestamp to now? Or keep start time? Updating 'now' extends the timeout window (sliding window).
                                crcStatus
                            } as LogEntry;

                            return prev.map(x => x.id === session.id ? { ...x, logs: newLogs } : x);

                            return prev.map(x => x.id === session.id ? { ...x, logs: newLogs } : x);

                        } else {
                            // Check for REPEAT merge (Strict equality check)
                            // This is for distinct packets that are identical, NOT chunk merging.
                            const mergeRepeats = s.config.uiState?.mergeRepeats;

                            if (mergeRepeats && lastLog && lastLog.type === 'RX') {
                                let isSameData = false;
                                if (typeof lastLog.data === 'string' && typeof data === 'string') {
                                    isSameData = lastLog.data === data;
                                } else if (lastLog.data instanceof Uint8Array && (data instanceof Uint8Array || typeof data === 'object')) { // data from API might be Uint8Array
                                    // Handle data conversion if needed, but here data is from onData which gives Uint8Array
                                    const newDataArr = data instanceof Uint8Array ? data : new Uint8Array(data);
                                    if (lastLog.data.length === newDataArr.length) {
                                        isSameData = true;
                                        for (let i = 0; i < newDataArr.length; i++) {
                                            if (lastLog.data[i] !== newDataArr[i]) {
                                                isSameData = false;
                                                break;
                                            }
                                        }
                                    }
                                }

                                if (isSameData) {
                                    // Merge as Repeat
                                    const newLogs = [...logs];
                                    newLogs[newLogs.length - 1] = {
                                        ...lastLog,
                                        timestamp: now,
                                        repeatCount: (lastLog.repeatCount || 1) + 1
                                    };
                                    return prev.map(x => x.id === session.id ? { ...x, logs: newLogs } : x);
                                }
                            }

                            // New Log
                            const isOk = validateRXCRC(data, s.config.rxCRC);
                            const newLogs = [...s.logs, { type: 'RX', data, timestamp: now, crcStatus: s.config.rxCRC.enabled ? (isOk ? 'ok' : 'error') : 'none' } as LogEntry];
                            if (newLogs.length > MAX_LOGS) newLogs.shift();
                            return prev.map(x => x.id === session.id ? { ...x, logs: newLogs } : x);
                        }
                    });
                });

                const cleanupClosed = window.serialAPI.onClosed(session.id, () => {
                    updateSession(session.id, () => ({ isConnected: false }));
                    addLog(session.id, 'INFO', 'Port closed remotely');
                });

                const cleanupError = window.serialAPI.onError(session.id, (err) => {
                    addLog(session.id, 'ERROR', `Error: ${err}`);
                });

                registeredSessions.current.add(session.id);

                // Cleanup function for this specific session? 
                // Complex in this "all in one" hook.
            }
        });


        // Virtual port listener handling removed

    }, [sessions.map(s => `${s.id}-${s.isConnected}`).join(','), updateSession, addLog]);
    // This dependency array is a bit cheat-y but works for detecting addition of sessions.
    // ideally we have a separate component or hook per session. But global manager is okay for now.

    // --- Persistence (Workspace-based) ---
    const loadSessionsFromWorkspace = useCallback(async (wsPath: string) => {
        if (!window.workspaceAPI) return;
        const result = await window.workspaceAPI.listSessions(wsPath);
        if (result.success && result.data) {
            setSavedSessions(result.data);
        }
    }, []);

    const loadRecentWorkspaces = useCallback(async () => {
        if (!window.workspaceAPI) return;
        const result = await window.workspaceAPI.getRecentWorkspaces();
        if (result.success) {
            setRecentWorkspaces(result.workspaces);
        }
    }, []);

    const openWorkspace = useCallback(async (wsPath: string) => {
        setWorkspacePath(wsPath);
        workspacePathRef.current = wsPath;
        // Persist as last workspace (also updates recent list in main process)
        await window.workspaceAPI?.setLastWorkspace(wsPath);
        // Load sessions
        await loadSessionsFromWorkspace(wsPath);
        // Refresh recent list
        await loadRecentWorkspaces();
    }, [loadSessionsFromWorkspace, loadRecentWorkspaces]);

    const closeWorkspace = useCallback(() => {
        // Disconnect all sessions
        sessions.forEach(s => {
            if (s.isConnected) disconnectSession(s.id);
        });
        setSessions([]);
        setSavedSessions([]);
        setActiveSessionId(null);
        setWorkspacePath(null);
        workspacePathRef.current = null;
        window.workspaceAPI?.setLastWorkspace(null);
    }, [sessions, disconnectSession]);

    const browseAndOpenWorkspace = useCallback(async () => {
        if (!window.workspaceAPI) return;
        const result = await window.workspaceAPI.openFolder();
        if (result.success && result.path) {
            await openWorkspace(result.path);
        }
    }, [openWorkspace]);

    const saveSession = useCallback(async (session: SessionConfig) => {
        if (!workspacePathRef.current || !window.workspaceAPI) return;

        // Check if exists, update or add
        let newSaved = [...savedSessions];
        const idx = newSaved.findIndex(s => s.id === session.id);
        const oldName = idx >= 0 ? newSaved[idx].name : null;

        if (idx >= 0) {
            newSaved[idx] = session;
        } else {
            newSaved.push(session);
        }

        // Optimistic update
        setSavedSessions(newSaved);

        // Rename file if needed
        if (oldName && oldName !== session.name) {
            await window.workspaceAPI.renameSession(workspacePathRef.current, oldName, session.name);
        }

        const result = await window.workspaceAPI.saveSession(workspacePathRef.current, session);
        if (result.success) {
            addLog(session.id, 'INFO', `Session saved as ${session.name}`);
        } else {
            console.error('Failed to save session:', result.error);
        }
    }, [savedSessions, addLog]);

    const deleteSession = useCallback(async (sessionId: string) => {
        if (!workspacePathRef.current || !window.workspaceAPI) return;

        const session = savedSessions.find(s => s.id === sessionId);
        if (!session) return;

        const result = await window.workspaceAPI.deleteSession(workspacePathRef.current, session);
        if (result.success) {
            setSavedSessions(prev => prev.filter(s => s.id !== sessionId));
        } else {
            console.error('Failed to delete session:', result.error);
        }
    }, [savedSessions]);

    // Helpers for UI to open a saved session
    const openSavedSession = useCallback((config: SessionConfig) => {
        // Check if already open
        const existing = sessions.find(s => s.id === config.id);
        if (existing) {
            setActiveSessionId(existing.id);
            return;
        }

        // Create new session state from config
        const newSession: SessionState = {
            id: config.id,
            config: { ...config }, // Clone to avoid mutation issues
            isConnected: false,
            isConnecting: false,
            logs: []
        };

        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(config.id);
    }, [sessions]);

    const updateSessionConfig = useCallback(async (sessionId: string, updates: Partial<SessionConfig>) => {
        console.log(`[SessionManager] Updating config for ${sessionId}`, updates);
        // 1. Update runtime session
        updateSession(sessionId, (prev) => ({ config: { ...prev.config, ...updates } as any }));

        // 2. Check if it's a saved session and update persistence
        // We use the functional state of savedSessions to ensure we have latest? 
        // Or just use the dependency.
        const session = sessions.find(s => s.id === sessionId);
        const isSaved = savedSessions.some(s => s.id === sessionId);

        if (session && isSaved) {
            const oldName = session.config.name;
            const newName = updates.name;

            const updatedConfig = { ...session.config, ...updates } as SessionConfig;
            const newSaved = savedSessions.map(s => s.id === sessionId ? { ...s, ...updates } as SessionConfig : s);
            setSavedSessions(newSaved);

            if (workspacePathRef.current && window.workspaceAPI) {
                // Check if name changed and rename file
                if (newName && newName !== oldName) {
                    await window.workspaceAPI.renameSession(workspacePathRef.current, oldName, newName);
                }
                await window.workspaceAPI.saveSession(workspacePathRef.current, updatedConfig);
            }
        }
    }, [sessions, savedSessions, updateSession]);

    const updateUIState = useCallback((sessionId: string, uiStateUpdates: Partial<any>) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || session.config.type !== 'serial') return;

        const currentUIState = (session.config as any).uiState || {};
        updateSessionConfig(sessionId, {
            uiState: { ...currentUIState, ...uiStateUpdates }
        } as any);
    }, [sessions, updateSessionConfig]);




    // Monitor ports and update lastDescription for sessions
    useEffect(() => {
        sessions.forEach(session => {
            if (session.config.type === 'serial') {
                const port = ports.find(p => p.path === session.config.connection.path);
                if (port) {
                    const desc = formatPortInfo(port);
                    if (session.config.lastDescription !== desc) {
                        updateSessionConfig(session.id, { lastDescription: desc });
                    }
                }
            }
        });
    }, [sessions, ports, updateSessionConfig]);

    // Monitor MQTT topics and update subscriptions dynamically
    const prevTopicsRef = useRef<Record<string, MqttTopicConfig[]>>({});

    useEffect(() => {
        sessions.forEach(session => {
            if (session.config.type === 'mqtt' && session.isConnected) {
                const currentTopics = (session.config as any).topics || [];
                // Ensure topics are objects (migration might have happened or checking types)
                // In runtime, if we just loaded, they might be strings if we didn't migrate yet?
                // We should ensure migration happens on load.
                // But let's handle safety here too.
                const validCurrentTopics: MqttTopicConfig[] = currentTopics.map((t: any) => {
                    if (typeof t === 'string') {
                        return { id: t, path: t, color: '#cccccc', subscribed: true };
                    }
                    return t;
                });

                const prevTopics = prevTopicsRef.current[session.id] || [];

                // Calculate active subscriptions (subscribed === true)
                const currentActive = validCurrentTopics.filter(t => t.subscribed).map(t => t.path);
                const prevActive = prevTopics.filter(t => t.subscribed).map(t => t.path);

                // Find added/enabled subscriptions
                const added = currentActive.filter(t => !prevActive.includes(t));
                // Find removed/disabled subscriptions
                const removed = prevActive.filter(t => !currentActive.includes(t));

                if (window.mqttAPI) {
                    added.forEach(topic => {
                        console.log(`[MQTT] Subscribing to ${topic}`);
                        window.mqttAPI.subscribe(session.id, topic);
                    });
                    removed.forEach(topic => {
                        console.log(`[MQTT] Unsubscribing from ${topic}`);
                        window.mqttAPI.unsubscribe(session.id, topic);
                    });
                }

                // Update ref
                if (added.length > 0 || removed.length > 0) {
                    // We store the full config state as prev
                    prevTopicsRef.current[session.id] = validCurrentTopics;
                } else {
                    // If paths didn't change but maybe color changed, we still want to update ref?
                    // Actually we only care about paths and subscribed status for the effect.
                    // But for detecting future changes, we should keep it sync.
                    // A deep compare would be better but expensive.
                    // Let's just update if we differ in length or content?
                    // Simple approach: Always update ref to current state if we are connected, 
                    // so we compare against latest next time.
                    prevTopicsRef.current[session.id] = validCurrentTopics;
                }

            } else if (session.config.type === 'mqtt' && !session.isConnected) {
                // Reset ref when disconnected to ensure we re-subscribe on next connect
                prevTopicsRef.current[session.id] = [];
            }
        });
    }, [sessions]);

    // Initial load — workspace-based
    useEffect(() => {
        listPorts();
        const interval = setInterval(listPorts, 5000);
        // ... (rest of existing effect)

        // Initialize workspace
        const initWorkspace = async () => {
            if (!window.workspaceAPI) return;

            // Load recent list first
            await loadRecentWorkspaces();

            // Try migration from old sessions.json (but don't auto-open unless user had no workspace before??)
            // Actually, for "No Default Workspace" request, we should only migrate if explicitly asked, 
            // OR we migrate silently to default location but DONT open it.
            // But the migration handler returns the path.
            // Let's stick to: Only open if lastWorkspace is set.
            const lastWs = await window.workspaceAPI.getLastWorkspace();
            if (lastWs.success && lastWs.path) {
                await openWorkspace(lastWs.path);
            } else {
                // First run or no workspace set.
                // Do we migrate? If we migrate, we create "DefaultWorkspace".
                // If we don't open it, user sees empty state.
                // Let's migrate silently so data isn't lost, but NOT open it.
                await window.workspaceAPI.migrateOldSessions();

                // If migration happened, it might be good to add valid default to recent list?
                // But user wants "No default workspace".
                // So we just stay empty.
            }
        };
        initWorkspace();

        return () => {
            clearInterval(interval);
        };
    }, [listPorts, openWorkspace, loadRecentWorkspaces]);



    return {
        sessions,
        activeSessionId,
        setActiveSessionId,
        savedSessions,
        ports,
        workspacePath,
        recentWorkspaces,
        createSession,
        duplicateSession,
        closeSession,
        connectSession,
        disconnectSession,
        writeToSession,
        updateSessionConfig,
        updateUIState,
        clearLogs,
        publishMqtt,
        listPorts,
        saveSession,
        deleteSession,
        openSavedSession,
        openWorkspace,
        closeWorkspace,
        browseAndOpenWorkspace,
        reorderSessions: useCallback(async (newOrder: SessionConfig[]) => {
            setSavedSessions(newOrder);
            // Re-save all in workspace (order doesn't affect files, but we update state)
        }, [])
    };
};
