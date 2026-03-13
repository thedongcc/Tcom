/**
 * useSessionLog.ts
 * 高频日志批处理（16ms/60fps）、RX 包模式缓冲（timeout / delimiter / fixedLength）。
 * 从 useSessionManager 中拆分出来以实现职责单一。
 */
import { useCallback, useRef } from 'react';
import { SessionState, LogEntry } from '../types/session';
import { validateRXCRC } from '../utils/crc';

const MAX_LOGS = 1000;

export interface UseSessionLogReturn {
    addLog: (sessionId: string, type: LogEntry['type'], data: string | Uint8Array, crcStatus?: LogEntry['crcStatus'], topic?: string, commandName?: string, tsOverride?: number) => void;
    clearLogs: (sessionId: string, updateSession: (id: string, updater: (prev: SessionState) => Partial<SessionState>) => void) => void;
    flushLogBuffer: () => void;
    rxBuffersRef: React.MutableRefObject<Map<string, Uint8Array[]>>;
    rxTimersRef: React.MutableRefObject<Map<string, NodeJS.Timeout>>;
}

export const useSessionLog = (
    setSessions: React.Dispatch<React.SetStateAction<SessionState[]>>
): UseSessionLogReturn => {
    const logBufferRef = useRef<Map<string, LogEntry[]>>(new Map());
    const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const rxBuffersRef = useRef<Map<string, Uint8Array[]>>(new Map());
    const rxTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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

            let newTxBytes = s.txBytes || 0;
            let newRxBytes = s.rxBytes || 0;

            bufferLogs.forEach(incoming => {
                const len = typeof incoming.data === 'string'
                    ? new TextEncoder().encode(incoming.data).length
                    : incoming.data.length;

                if (incoming.type === 'TX') {
                    if (!incoming.topic || incoming.topic === 'virtual') {
                        newTxBytes += len * (incoming.repeatCount || 1);
                    }
                } else if (incoming.type === 'RX') {
                    if (!incoming.topic || incoming.topic === 'physical') {
                        newRxBytes += len * (incoming.repeatCount || 1);
                    }
                }
            });

            return { ...s, logs: newLogs, txBytes: newTxBytes, rxBytes: newRxBytes };
        }));
    }, [setSessions]);

    const addLog = useCallback((
        sessionId: string,
        type: LogEntry['type'],
        data: string | Uint8Array,
        crcStatus: LogEntry['crcStatus'] = 'none',
        topic?: string,
        commandName?: string,
        tsOverride?: number
    ) => {
        const entry: LogEntry = {
            id: crypto.randomUUID(),
            type,
            data,
            timestamp: tsOverride ?? Date.now(),
            crcStatus,
            topic,
            commandName,
        };

        let batch = logBufferRef.current.get(sessionId);
        if (!batch) {
            batch = [];
            logBufferRef.current.set(sessionId, batch);
        }
        batch.push(entry);

        if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(flushLogBuffer, 16); // 每帧批处理 (~60fps)
        }
    }, [flushLogBuffer]);

    const clearLogs = useCallback((
        sessionId: string,
        updateSession: (id: string, updater: (prev: SessionState) => Partial<SessionState>) => void
    ) => {
        updateSession(sessionId, () => ({ logs: [], txBytes: 0, rxBytes: 0 }));
    }, []);

    return {
        addLog,
        clearLogs,
        flushLogBuffer,
        rxBuffersRef,
        rxTimersRef,
    };
};
