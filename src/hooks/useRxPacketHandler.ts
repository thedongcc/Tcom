/**
 * useRxPacketHandler.ts
 * RX 数据帧处理逻辑：支持四种模式（none / timeout / fixedLength / delimiter / delimiterWithTimeout）。
 * 从 useSessionManager.ts 中拆分出来，纯逻辑函数。
 */
import type { SessionState } from '../types/session';
import type { UseSessionLogReturn } from './useSessionLog';
import { validateRXCRC } from '../utils/crc';

/**
 * 处理接收到的串口数据，根据会话的 rxPacketMode 配置进行帧组装/分割。
 */
export function processIncomingData(
    sessionId: string,
    data: Uint8Array,
    timestamp: number,
    session: SessionState,
    sessionLog: UseSessionLogReturn,
) {
    const uiState = (session.config as any).uiState as Record<string, unknown> || {};
    const packetMode = uiState.rxPacketMode || 'none';
    const legacyTimeout = uiState.chunkTimeout || 0;
    const crcTarget = (uiState.crcTarget as string) || 'rx';

    // 是否需要对 RX 数据做 CRC 校验（crcTarget='tx' 时跳过 RX 校验）
    const shouldValidateRx = session.config.rxCRC?.enabled && (crcTarget === 'rx' || crcTarget === 'both');

    // 无帧模式且无遗留超时：直接输出
    if (packetMode === 'none' && legacyTimeout === 0) {
        const crcStatus = shouldValidateRx
            ? (validateRXCRC(data, session.config.rxCRC!) ? 'ok' : 'error')
            : 'none';
        sessionLog.addLog(sessionId, 'RX', data, crcStatus, undefined, undefined, timestamp);
        return;
    }

    // 缓冲数据
    let buffer = sessionLog.rxBuffersRef.current.get(sessionId);
    if (!buffer) {
        buffer = [];
        sessionLog.rxBuffersRef.current.set(sessionId, buffer);
    }
    buffer.push(data);

    // 清除已有定时器
    const existingTimer = sessionLog.rxTimersRef.current.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);

    // 刷新缓冲区辅助函数
    const flushBuffer = () => {
        const finalBuffer = sessionLog.rxBuffersRef.current.get(sessionId);
        if (finalBuffer && finalBuffer.length > 0) {
            const totalLen = finalBuffer.reduce((acc, curr) => acc + curr.length, 0);
            const mergedData = new Uint8Array(totalLen);
            let offset = 0;
            finalBuffer.forEach(b => { mergedData.set(b, offset); offset += b.length; });
            const crcStatus = shouldValidateRx
                ? (validateRXCRC(mergedData, session.config.rxCRC!) ? 'ok' : 'error')
                : 'none';
            sessionLog.addLog(sessionId, 'RX', mergedData, crcStatus, undefined, undefined, timestamp);
            sessionLog.rxBuffersRef.current.set(sessionId, []);
        }
        sessionLog.rxTimersRef.current.delete(sessionId);
    };

    const currentBufferLen = buffer.reduce((acc, curr) => acc + curr.length, 0);

    // 定长模式
    if (packetMode === 'fixedLength') {
        const fixedLen = (uiState.rxFixedLength as number) || 0;
        if (fixedLen > 0 && currentBufferLen >= fixedLen) {
            const mergedData = new Uint8Array(currentBufferLen);
            let offset = 0;
            buffer.forEach(b => { mergedData.set(b, offset); offset += b.length; });
            let processOffset = 0;
            const remainingBuffer: Uint8Array[] = [];
            while (processOffset + fixedLen <= currentBufferLen) {
                const frame = mergedData.slice(processOffset, processOffset + fixedLen);
                const crcStatus = shouldValidateRx
                    ? (validateRXCRC(frame, session.config.rxCRC!) ? 'ok' : 'error')
                    : 'none';
                sessionLog.addLog(sessionId, 'RX', frame, crcStatus, undefined, undefined, timestamp);
                processOffset += fixedLen;
            }
            if (processOffset < currentBufferLen) {
                remainingBuffer.push(mergedData.slice(processOffset));
            }
            sessionLog.rxBuffersRef.current.set(sessionId, remainingBuffer);
            return;
        }
    } else if (packetMode === 'delimiter' || packetMode === 'delimiterWithTimeout') {
        // 分隔符模式
        const delimStr = (uiState.rxDelimiter as string) || '';
        if (delimStr) {
            let delimBytes: number[] = [];
            if (/^([0-9a-fA-F]{2}\s*)+$/.test(delimStr.trim())) {
                delimBytes = delimStr.trim().split(/\s+/).map((h: string) => parseInt(h, 16));
            } else {
                const parsedStr = delimStr.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
                const encoder = new TextEncoder();
                delimBytes = Array.from(encoder.encode(parsedStr));
            }
            if (delimBytes.length > 0) {
                const mergedData = new Uint8Array(currentBufferLen);
                let offset = 0;
                buffer.forEach(b => { mergedData.set(b, offset); offset += b.length; });
                let startIdx = 0;
                const remainingBuffer: Uint8Array[] = [];
                for (let i = 0; i <= currentBufferLen - delimBytes.length; i++) {
                    let match = true;
                    for (let j = 0; j < delimBytes.length; j++) {
                        if (mergedData[i + j] !== delimBytes[j]) { match = false; break; }
                    }
                    if (match) {
                        const frame = mergedData.slice(startIdx, i + delimBytes.length);
                        const crcStatus = shouldValidateRx
                            ? (validateRXCRC(frame, session.config.rxCRC!) ? 'ok' : 'error')
                            : 'none';
                        sessionLog.addLog(sessionId, 'RX', frame, crcStatus, undefined, undefined, timestamp);
                        startIdx = i + delimBytes.length;
                        i = startIdx - 1;
                    }
                }
                if (startIdx < currentBufferLen) {
                    remainingBuffer.push(mergedData.slice(startIdx));
                }
                sessionLog.rxBuffersRef.current.set(sessionId, remainingBuffer);
                if (packetMode === 'delimiter') return;
            }
        }
    }

    // 超时刷新（timeout / delimiterWithTimeout / 遗留 chunkTimeout）
    const timeoutMs = (packetMode === 'timeout' || packetMode === 'delimiterWithTimeout'
        ? (uiState.rxTimeoutMs as number || 50)
        : legacyTimeout) as number;

    if (timeoutMs > 0) {
        const newTimer = setTimeout(flushBuffer, timeoutMs);
        sessionLog.rxTimersRef.current.set(sessionId, newTimer);
    }
}
