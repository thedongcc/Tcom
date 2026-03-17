/**
 * useSessionDataSender.ts
 * 会话数据发送 Hook — Serial 写入、MQTT 发布、Monitor 写入。
 * 从 useSessionManager.ts 中拆分出来。
 */
import { useCallback } from 'react';
import { SessionState } from '../types/session';
import { validateRXCRC } from '../utils/crc';
import { UseSessionLogReturn } from './useSessionLog';

interface UseSessionDataSenderParams {
    sessionsRef: React.MutableRefObject<SessionState[]>;
    sessionLog: UseSessionLogReturn;
}

export function useSessionDataSender({ sessionsRef, sessionLog }: UseSessionDataSenderParams) {
    // 串口数据写入
    const writeToSession = useCallback(async (sessionId: string, data: string | number[] | Uint8Array, options?: { commandName?: string }) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || !window.serialAPI) return;

        let rawData: Uint8Array;
        if (typeof data === 'string') rawData = new TextEncoder().encode(data);
        else if (ArrayBuffer.isView(data)) rawData = data as Uint8Array;
        else rawData = new Uint8Array(data);

        // 直接发送原始数据（不做任何修改）
        const result = await window.serialAPI.write(sessionId, rawData);
        if (result.success) {
            // 根据 crcTarget 决定是否对 TX 日志数据做 CRC 校验显示
            const uiState = session.config.uiState as Record<string, unknown> || {};
            const crcTarget = (uiState.crcTarget as string) || 'rx';
            const shouldValidateTx = session.config.rxCRC?.enabled && (crcTarget === 'tx' || crcTarget === 'both');
            const txCrcStatus: 'ok' | 'error' | 'none' = shouldValidateTx
                ? (validateRXCRC(rawData, session.config.rxCRC!) ? 'ok' : 'error')
                : 'none';
            sessionLog.addLog(sessionId, 'TX', rawData, txCrcStatus, undefined, options?.commandName, Date.now());
        } else {
            sessionLog.addLog(sessionId, 'ERROR', `Write failed: ${result.error}`);
        }
    }, [sessionsRef, sessionLog]);

    // MQTT 消息发布
    const publishMqtt = useCallback(async (sessionId: string, topic: string, payload: string | Uint8Array, options: { qos: 0 | 1 | 2, retain: boolean, commandName?: string }) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || session.config.type !== 'mqtt' || !window.mqttAPI) return;
        const result = await window.mqttAPI.publish(sessionId, topic, payload, options);
        if (result.success) sessionLog.addLog(sessionId, 'TX', payload, 'none', topic, options.commandName);
        else sessionLog.addLog(sessionId, 'ERROR', `Publish failed: ${result.error}`);
    }, [sessionsRef, sessionLog]);

    // Monitor 数据写入
    const writeToMonitor = useCallback(async (sessionId: string, target: 'virtual' | 'physical', data: string | number[] | Uint8Array, options?: { commandName?: string }) => {
        const session = sessionsRef.current.find(s => s.id === sessionId);
        if (!session || !session.isConnected || session.config.type !== 'monitor' || !window.monitorAPI) return;
        const pData = ArrayBuffer.isView(data) ? Array.from(data as Uint8Array) : typeof data === 'string' ? data : data;
        const res = await window.monitorAPI.write(sessionId, target, pData);
        if (res.success) sessionLog.addLog(sessionId, 'TX', data as Uint8Array, 'none', target, options?.commandName);
        else sessionLog.addLog(sessionId, 'ERROR', `Write failed: ${res.error}`);
    }, [sessionsRef, sessionLog]);

    return { writeToSession, publishMqtt, writeToMonitor };
}
