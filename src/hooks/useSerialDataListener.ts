/**
 * useSerialDataListener.ts
 * 串口 IPC 事件注册（onData / onClosed / onError / onTimedSendTick）。
 * 从 useSessionManager.ts 中拆分出来，管理串口数据事件的订阅生命周期。
 */
import { useEffect, useRef } from 'react';
import type { SessionState } from '../types/session';
import type { UseSessionLogReturn } from './useSessionLog';
import { processIncomingData } from './useRxPacketHandler';

/**
 * 为每个新会话注册串口 IPC 事件监听器。
 * 已注册的会话不会重复注册。
 */
export function useSerialDataListener(
    sessions: SessionState[],
    sessionsRef: React.MutableRefObject<SessionState[]>,
    updateSession: (sessionId: string, updater: (prev: SessionState) => Partial<SessionState>) => void,
    sessionLog: UseSessionLogReturn,
) {
    const registeredSessions = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!window.serialAPI) return;
        sessions.forEach(session => {
            if (registeredSessions.current.has(session.id)) return;

            // 数据接收
            window.serialAPI!.onData(session.id, (data, timestamp) => {
                const rxTs = timestamp ?? Date.now();
                const latestSession = sessionsRef.current.find(s => s.id === session.id);
                if (!latestSession) return;
                processIncomingData(session.id, data, rxTs, latestSession, sessionLog);
            });

            // 端口关闭
            window.serialAPI!.onClosed(session.id, () => {
                updateSession(session.id, () => ({ isConnected: false }));
                sessionLog.addLog(session.id, 'INFO', 'Closed');
            });

            // 错误
            window.serialAPI!.onError(session.id, (err) =>
                sessionLog.addLog(session.id, 'ERROR', err)
            );

            // 高精度定时发送 tick（含诊断）
            let jsTickCount = 0;
            let jsIntervalSum = 0;
            let jsLatencySum = 0;
            let jsLatencyMax = 0;
            let lastJsTickTime = 0;
            (window.serialAPI!.onTimedSendTick as any)?.(session.id, (data: any, timestamp: number) => {
                const jsNow = Date.now();
                const latency = jsNow - timestamp; // 事件传输延迟（Rust→JS）
                jsTickCount++;
                jsLatencySum += latency;
                if (latency > jsLatencyMax) jsLatencyMax = latency;
                if (lastJsTickTime > 0) {
                    jsIntervalSum += (jsNow - lastJsTickTime);
                }
                lastJsTickTime = jsNow;

                if (jsTickCount % 20 === 0) {
                    const avgLatency = Math.round(jsLatencySum / 20);
                    const avgInterval = Math.round(jsIntervalSum / 19);
                    console.log(`[TimedSend JS DIAG] tick#${jsTickCount} | avgLatency=${avgLatency}ms maxLatency=${jsLatencyMax}ms | avgJsInterval=${avgInterval}ms`);
                    jsLatencySum = 0;
                    jsLatencyMax = 0;
                    jsIntervalSum = 0;
                }

                sessionLog.addLog(session.id, 'TX', new Uint8Array(data), 'none', undefined, undefined, timestamp, 'tcom');
            });

            registeredSessions.current.add(session.id);
        });
    }, [sessions, sessionsRef, updateSession, sessionLog]);
}
