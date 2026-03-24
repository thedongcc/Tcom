/**
 * useSessionLog.ts
 * 高频日志批处理（16ms/60fps）、RX 包模式缓冲（timeout / delimiter / fixedLength）。
 * 从 useSessionManager 中拆分出来以实现职责单一。
 */
import { useCallback, useRef } from 'react';
import { SessionState, LogEntry } from '../types/session';
import { useSettings } from '../context/SettingsContext';



/**
 * 比较两条日志的数据是否相同（支持 string 和 Uint8Array）
 */
function isSameData(a: string | Uint8Array, b: string | Uint8Array): boolean {
    if (typeof a === 'string' && typeof b === 'string') return a === b;
    if (a instanceof Uint8Array && b instanceof Uint8Array) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }
    return false;
}

/**
 * 将 incoming 日志合并到 logs 数组（支持重复合并）
 */
function mergeIncomingLog(logs: LogEntry[], incoming: LogEntry, mergeRepeats: boolean): void {
    const last = logs[logs.length - 1];
    if (mergeRepeats && last && last.type === incoming.type && last.topic === incoming.topic && isSameData(last.data, incoming.data)) {
        logs[logs.length - 1] = { ...last, timestamp: incoming.timestamp, repeatCount: (last.repeatCount || 1) + (incoming.repeatCount || 1) };
    } else {
        logs.push(incoming);
    }
}

/**
 * 计算日志条目的字节数
 */
function getLogByteLength(data: string | Uint8Array): number {
    return typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
}

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
    const { config } = useSettings();
    const maxLogs = config?.maxLogEntries || 1000;

    const logBufferRef = useRef<Map<string, LogEntry[]>>(new Map());
    const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rxBuffersRef = useRef<Map<string, Uint8Array[]>>(new Map());
    const rxTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    const flushLogBuffer = useCallback(() => {
        batchTimerRef.current = null;
        if (logBufferRef.current.size === 0) return;

        const t0 = performance.now();
        const buffer = new Map(logBufferRef.current);
        logBufferRef.current.clear();

        let totalEntries = 0;
        buffer.forEach(v => totalEntries += v.length);


        setSessions(prev => prev.map(s => {
            const bufferLogs = buffer.get(s.id);
            if (!bufferLogs?.length) return s;

            const mergeRepeats = !!s.config.uiState?.mergeRepeats;
            let newLogs = [...s.logs];
            bufferLogs.forEach(incoming => mergeIncomingLog(newLogs, incoming, mergeRepeats));
            if (newLogs.length > maxLogs) newLogs = newLogs.slice(-maxLogs);

            // 统计字节数
            let newTxBytes = s.txBytes || 0;
            let newRxBytes = s.rxBytes || 0;
            for (const incoming of bufferLogs) {
                const len = getLogByteLength(incoming.data) * (incoming.repeatCount || 1);
                if (s.config.type === 'monitor') {
                    if (incoming.type === 'TX' && incoming.topic === 'virtual' && incoming.sender !== 'tcom') newTxBytes += len;
                    else if (incoming.type === 'RX' && incoming.topic === 'physical') newRxBytes += len;
                } else {
                    if (incoming.type === 'TX') newTxBytes += len;
                    else if (incoming.type === 'RX') newRxBytes += len;
                }
            }

            return { ...s, logs: newLogs, txBytes: newTxBytes, rxBytes: newRxBytes };
        }));

        const elapsed = performance.now() - t0;

        if (elapsed > 5) {
            console.warn(`[Flush DIAG] ${elapsed.toFixed(1)}ms | entries=${totalEntries}`);
        }
    }, [setSessions, maxLogs]);

    const addLog = useCallback((
        sessionId: string,
        type: LogEntry['type'],
        data: string | Uint8Array,
        crcStatus: LogEntry['crcStatus'] = 'none',
        topic?: string,
        commandName?: string,
        tsOverride?: number,
        sender?: string
    ) => {
        const entry: LogEntry = {
            id: crypto.randomUUID(),
            type,
            data,
            timestamp: tsOverride ?? Date.now(),
            crcStatus,
            topic,
            commandName,
            sender,
        };

        let batch = logBufferRef.current.get(sessionId);
        if (!batch) {
            batch = [];
            logBufferRef.current.set(sessionId, batch);
        }
        batch.push(entry);

        if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(flushLogBuffer, 16);
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
