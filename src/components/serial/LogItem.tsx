/**
 * LogItem.tsx
 * Memoized 日志条目渲染组件，从 SerialMonitor.tsx 中拆分出来。
 * 负责单条日志的格式化显示（时间戳、类型标签、数据内容、CRC 状态、搜索高亮等）。
 *
 * 子模块：
 * - logRenderHelpers.tsx — 控制字符渲染和搜索高亮
 */
import React, { memo } from 'react';
import { LogEntry } from '../../types/session';
import { CRCConfig } from '../../utils/crc';
import { useSystemMessage } from '../../hooks/useSystemMessage';
import { Tooltip } from '../common/Tooltip';
import { renderHighlightedText } from './logRenderHelpers';

export interface SearchMatch {
    logId: string;
    startIndex: number;
    endIndex: number;
    [key: string]: any;
}

export interface LogItemProps {
    log: LogEntry;
    isNewLog: boolean;
    viewMode: 'text' | 'hex' | 'both';
    encoding: string;
    showTimestamp: boolean;
    showPacketType: boolean;
    showDataLength: boolean;
    onContextMenu: (e: React.MouseEvent, log: LogEntry) => void;
    formatData: (data: string | Uint8Array, mode: 'text' | 'hex' | 'both', enc: string) => string;
    formatTimestamp: (timestamp: number, format: string) => string;
    getDataLengthText: (data: string | Uint8Array) => string;
    timestampFormat?: string;
    matches?: SearchMatch[];
    activeMatch?: SearchMatch | null;
    mergeRepeats?: boolean;
    flashNewMessage?: boolean;
    fontSize?: number;
    showControlChars?: boolean;
    rxCRC?: CRCConfig;
    crcEnabled?: boolean;
}

// Memoized Log Item Component
export const LogItem = memo(({
    log,
    isNewLog,
    viewMode,
    encoding,
    showTimestamp,
    showPacketType,
    showDataLength,
    onContextMenu,
    formatData,
    formatTimestamp,
    getDataLengthText,
    timestampFormat,
    matches = [],
    activeMatch = null,
    mergeRepeats = true,
    flashNewMessage,
    fontSize = 15,
    showControlChars,
    rxCRC,
    crcEnabled
}: LogItemProps) => {

    const { parseSystemMessage } = useSystemMessage();

    const lineHeightPx = Math.floor(fontSize * 1.5);
    const itemHeightPx = Math.floor(fontSize * 1.4);

    if (log.type === 'INFO' || log.type === 'ERROR') {
        const content = formatData(log.data, 'text', encoding).trim();
        const { styleClass, translatedText } = parseSystemMessage(log.type, content);
        return (
            <div className="flex justify-center my-2 gap-2 items-center" style={{ transform: 'translateZ(0)' }} data-component="system-message">
                <span className={`px-4 py-1 rounded-full text-xs font-medium border border-[var(--st-msg-bubble-border)] shadow-sm transition-all duration-300 select-text cursor-text ${styleClass}`}>
                    {translatedText}
                </span>
                {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                    <span
                        className="flex items-center justify-center text-[0.67em] text-[var(--st-monitor-repeat-badge-text)] font-bold font-mono bg-[var(--st-monitor-repeat-badge-bg)] px-[0.4em] rounded-full border border-[var(--st-monitor-repeat-badge-bg)]/30 min-w-[1.6em]"
                        style={{ height: `${Math.floor(lineHeightPx * 0.8)}px` }}
                    >
                        x{log.repeatCount}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div
            id={`log-${log.id}`}
            className={`flex items-start gap-1.5 mb-1 hover:bg-[var(--list-hover-background)] rounded-sm px-1.5 py-0.5 group relative ${(isNewLog && flashNewMessage && log.crcStatus !== 'error') ? 'animate-flash-new' : ''
                } ${log.crcStatus === 'error' ? 'bg-[var(--st-error-text)]/10 border border-[var(--st-error-text)]/30 dark:bg-[var(--st-error-text)]/10 dark:border-[var(--st-error-text)]/50' : 'border border-transparent'
                }`}
            style={{
                fontSize: 'inherit',
                fontFamily: 'inherit',
                transform: 'translateZ(0)',
                lineHeight: `${lineHeightPx}px`,
                '--flash-color': 'var(--selection-background)'
            } as React.CSSProperties}
            onContextMenu={(e) => onContextMenu(e, log)}
            data-component="monitor-bubble"
        >
            {(showTimestamp || (log.repeatCount && log.repeatCount > 1)) && (
                <div className="shrink-0 flex items-center select-none gap-1.5" style={{ height: `${lineHeightPx}px` }}>
                    {showTimestamp && (
                        <span className="text-[var(--st-monitor-timestamp)] font-mono opacity-90 tabular-nums tracking-tight">
                            [{formatTimestamp(log.timestamp, timestampFormat || 'HH:mm:ss.SSS').trim()}]
                        </span>
                    )}
                </div>
            )}
            <div className="flex items-center gap-1.5 shrink-0" style={{ height: `${lineHeightPx}px` }}>
                {showPacketType && (
                    <span className={`flex items-center justify-center font-bold font-mono select-none px-[0.4em] rounded-[0.2em] min-w-[2.8em] text-[0.8em] leading-none shadow-sm tracking-wide pt-[1px]
                    ${log.type === 'TX' ? 'bg-[var(--monitor-tx-label-bg)] text-[var(--st-monitor-tx-label-text)] border border-[var(--monitor-tx-label-border)]' :
                            log.type === 'RX' ? 'bg-[var(--monitor-rx-label-bg)] text-[var(--st-monitor-rx-label-text)] border border-[var(--monitor-rx-label-border)]' :
                                'bg-[var(--st-monitor-sys-bg)] text-[var(--st-monitor-sys-text)] border border-[var(--st-monitor-sys-border)]'
                        }`}
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        {log.type === 'TX' ? 'TX' : log.type === 'RX' ? 'RX' : 'SYS'}
                    </span>
                )}
                {showDataLength && (
                    <span
                        className="flex items-center justify-center font-mono select-none px-[0.4em] rounded-[0.2em] min-w-[2.8em] text-[0.8em] leading-none shadow-sm border border-[var(--st-monitor-tag-border)] bg-[var(--st-monitor-tag-bg)] text-[var(--st-monitor-tag-text)] pt-[1px] tabular-nums tracking-tight shrink-0"
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        {getDataLengthText(log.data)}
                    </span>
                )}
                {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                    <span
                        key={log.repeatCount}
                        className={`flex items-center justify-center text-[0.8em] leading-none text-[var(--st-monitor-gold-flash)] font-bold font-mono bg-[var(--st-monitor-gold-flash-bg)] px-[0.5em] rounded-[0.2em] border border-[var(--st-monitor-gold-flash-border)] min-w-[1.8em] select-none shrink-0 pt-[1px] tabular-nums tracking-tight ${(isNewLog && flashNewMessage) ? 'animate-flash-gold' : ''}`}
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        x{log.repeatCount}
                    </span>
                )}
            </div>
            <span className={`whitespace-pre-wrap break-all select-text cursor-text flex-1 ${log.type === 'TX' ? 'text-[var(--st-tx-text)]' :
                log.type === 'RX' ? 'text-[var(--st-rx-text)]' :
                    log.type === 'ERROR' ? 'text-[var(--st-error-text)]' :
                        'text-[var(--st-info-text)]'
                }`}>
                {renderHighlightedText(log, formatData(log.data, viewMode, encoding), matches, activeMatch, showControlChars)}
            </span>
            {log.crcStatus === 'error' && (
                <span
                    className="ml-2 text-[10px] text-red-600 bg-red-900 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-900/50 px-1.5 rounded border flex items-center shrink-0 font-bold"
                    style={{ height: `${itemHeightPx}px` }}
                >
                    CRC Error
                </span>
            )}
            {log.commandName && (() => {
                const parts = log.commandName.split('::::');
                const cmdName = parts[0];
                const cmdGroup = parts[1];
                const titleStr = cmdGroup ? `${cmdGroup}:${cmdName}` : cmdName;
                return (
                    <Tooltip content={titleStr} position="top" wrapperClassName="ml-2 flex items-center shrink-0">
                        <span
                            className="text-[11px] text-[var(--st-monitor-toolbar-foreground)] max-w-[200px] truncate select-none bg-[rgba(128,128,128,0.1)] px-1.5 rounded-[3px] cursor-default"
                            style={{ height: `${itemHeightPx}px` }}
                        >
                            {cmdName}
                        </span>
                    </Tooltip>
                );
            })()}
        </div>
    );
});
