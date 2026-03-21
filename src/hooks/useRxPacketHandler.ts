/**
 * useRxPacketHandler.ts
 * RX 数据帧处理逻辑：支持四种模式（none / timeout / fixedLength / delimiter / delimiterWithTimeout）。
 * 从 useSessionManager.ts 中拆分出来，纯逻辑函数。
 */
import type { SessionState } from '../types/session';
import type { UseSessionLogReturn } from './useSessionLog';
import { validateRXCRC } from '../utils/crc';

/**
 * 合并 Uint8Array 缓冲区为单个连续数组
 */
function mergeBuffers(buffers: Uint8Array[]): Uint8Array {
    const totalLen = buffers.reduce((acc, b) => acc + b.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    buffers.forEach(b => { merged.set(b, offset); offset += b.length; });
    return merged;
}

/**
 * 解析分隔符字符串为字节数组（支持 hex 和转义字符格式）
 */
function parseDelimiterBytes(delimStr: string): number[] {
    if (!delimStr) return [];
    const trimmed = delimStr.trim();
    if (/^([0-9a-fA-F]{2}\s*)+$/.test(trimmed)) {
        return trimmed.split(/\s+/).map(h => parseInt(h, 16));
    }
    const parsed = delimStr.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    return Array.from(new TextEncoder().encode(parsed));
}

/**
 * 计算 CRC 校验状态
 */
function getCrcStatus(data: Uint8Array, shouldValidate: boolean, rxCRC: any): 'ok' | 'error' | 'none' {
    if (!shouldValidate) return 'none';
    return validateRXCRC(data, rxCRC) ? 'ok' : 'error';
}

/**
 * 处理接收到的串口数据，根据会话的 rxPacketMode 配置进行帧组装/分割。
 */
export function processIncomingData(
    sessionId: string,
    data: Uint8Array,
    timestamp: number,
    session: SessionState,
    sessionLog: UseSessionLogReturn,
    type: 'RX' | 'TX' = 'RX',
    topic?: string
) {
    const uiState = (session.config as any).uiState as Record<string, unknown> || {};
    const packetMode = uiState.rxPacketMode || 'none';
    const legacyTimeout = uiState.chunkTimeout || 0;
    const crcTarget = (uiState.crcTarget as string) || 'rx';

    // 是否需要按方向做 CRC 校验
    const shouldValidate = type === 'RX' 
        ? session.config.rxCRC?.enabled && (crcTarget === 'rx' || crcTarget === 'both')
        : (session.config as any).txCRC?.enabled && (crcTarget === 'tx' || crcTarget === 'both');
    const crcConfig = type === 'RX' ? session.config.rxCRC : (session.config as any).txCRC;
    
    const bufferKey = `${sessionId}_${type}_${topic || ''}`;

    // 无帧模式且无遗留超时：直接输出
    if (packetMode === 'none' && legacyTimeout === 0) {
        sessionLog.addLog(sessionId, type, data, getCrcStatus(data, !!shouldValidate, crcConfig), topic, undefined, timestamp);
        return;
    }

    // 缓冲数据
    let buffer = sessionLog.rxBuffersRef.current.get(bufferKey);
    if (!buffer) {
        buffer = [];
        sessionLog.rxBuffersRef.current.set(bufferKey, buffer);
    }
    buffer.push(data);

    // 清除已有定时器
    const existingTimer = sessionLog.rxTimersRef.current.get(bufferKey);
    if (existingTimer) clearTimeout(existingTimer);

    // 刷新缓冲区辅助函数
    const flushBuffer = () => {
        const finalBuffer = sessionLog.rxBuffersRef.current.get(bufferKey);
        if (finalBuffer && finalBuffer.length > 0) {
            const mergedData = mergeBuffers(finalBuffer);
            sessionLog.addLog(sessionId, type, mergedData, getCrcStatus(mergedData, !!shouldValidate, crcConfig), topic, undefined, timestamp);
            sessionLog.rxBuffersRef.current.set(bufferKey, []);
        }
        sessionLog.rxTimersRef.current.delete(bufferKey);
    };

    const mergedBuf = mergeBuffers(buffer);
    const currentBufferLen = mergedBuf.length;

    // 定长模式
    if (packetMode === 'fixedLength') {
        const fixedLen = (uiState.rxFixedLength as number) || 0;
        if (fixedLen > 0 && currentBufferLen >= fixedLen) {
            let processOffset = 0;
            const remainingBuffer: Uint8Array[] = [];
            while (processOffset + fixedLen <= currentBufferLen) {
                const frame = mergedBuf.slice(processOffset, processOffset + fixedLen);
                sessionLog.addLog(sessionId, type, frame, getCrcStatus(frame, !!shouldValidate, crcConfig), topic, undefined, timestamp);
                processOffset += fixedLen;
            }
            if (processOffset < currentBufferLen) {
                remainingBuffer.push(mergedBuf.slice(processOffset));
            }
            sessionLog.rxBuffersRef.current.set(bufferKey, remainingBuffer);
            return;
        }
    } else if (packetMode === 'delimiter' || packetMode === 'delimiterWithTimeout') {
        // 分隔符模式
        const delimBytes = parseDelimiterBytes((uiState.rxDelimiter as string) || '');
        if (delimBytes.length > 0) {
            let startIdx = 0;
            const remainingBuffer: Uint8Array[] = [];
            for (let i = 0; i <= currentBufferLen - delimBytes.length; i++) {
                let match = true;
                for (let j = 0; j < delimBytes.length; j++) {
                    if (mergedBuf[i + j] !== delimBytes[j]) { match = false; break; }
                }
                if (match) {
                    const frame = mergedBuf.slice(startIdx, i + delimBytes.length);
                    sessionLog.addLog(sessionId, type, frame, getCrcStatus(frame, !!shouldValidate, crcConfig), topic, undefined, timestamp);
                    startIdx = i + delimBytes.length;
                    i = startIdx - 1;
                }
            }
            if (startIdx < currentBufferLen) remainingBuffer.push(mergedBuf.slice(startIdx));
            sessionLog.rxBuffersRef.current.set(bufferKey, remainingBuffer);
            if (packetMode === 'delimiter') {
                return;
            }
        }
    }

    // 超时刷新（timeout / delimiterWithTimeout / 遗留 chunkTimeout）
    const timeoutMs = (packetMode === 'timeout' || packetMode === 'delimiterWithTimeout'
        ? (uiState.rxTimeoutMs as number || 50)
        : legacyTimeout) as number;

    if (timeoutMs > 0) {
        const newTimer = setTimeout(flushBuffer, timeoutMs);
        sessionLog.rxTimersRef.current.set(bufferKey, newTimer);
    }
}
