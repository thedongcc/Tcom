/**
 * MonitorLogItem.tsx
 * MonitorTerminal 的日志条目渲染子组件 (Memoized)。
 * 从 MonitorTerminal.tsx 中拆分出来，降低主组件复杂度。
 */
import React from 'react';
import { useSystemMessage } from '../../hooks/useSystemMessage';

interface SearchMatch {
    logId: string;
    startIndex: number;
    endIndex: number;
    [key: string]: any;
}

export interface MonitorLogItemProps {
    log: any;
    isNewLog: boolean;
    viewMode: 'text' | 'hex' | 'both';
    encoding: string;
    showTimestamp: boolean;
    showPacketType: boolean;
    showDataLength: boolean;
    virtualSerialPort: string;
    physicalPortPath: string;
    onContextMenu: (e: React.MouseEvent, log: any) => void;
    formatData: (data: string | Uint8Array, mode: 'text' | 'hex' | 'both', enc: string) => string;
    formatTimestamp: (timestamp: number, format?: string) => string;
    getDataLengthText: (data: string | Uint8Array) => string;
    timestampFormat?: string;
    matches?: SearchMatch[];
    activeMatch?: SearchMatch | null;
    mergeRepeats?: boolean;
    flashNewMessage?: boolean;
    fontSize?: number;
    rxCRC?: any;
    crcEnabled?: boolean;
}

// Memoized Log Item Component
export const MonitorLogItem = React.memo(({
    log,
    isNewLog,
    viewMode,
    encoding,
    showTimestamp,
    showPacketType,
    showDataLength,
    virtualSerialPort,
    physicalPortPath,
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
    rxCRC: _rxCRC,
    crcEnabled: _crcEnabled
}: MonitorLogItemProps) => {
    // 高亮搜索匹配文本
    const renderHighlightedText = (log: any, text: string) => {
        const logMatches = matches.filter((m: any) => m.logId === log.id);
        if (logMatches.length === 0) return text;

        const sortedMatches = [...logMatches].sort((a: any, b: any) => a.startIndex - b.startIndex);
        const result: React.ReactNode[] = [];
        let lastIndex = 0;

        sortedMatches.forEach((match: any, i: number) => {
            if (match.startIndex > lastIndex) {
                result.push(text.substring(lastIndex, match.startIndex));
            }
            const isActive = activeMatch === match;
            result.push(
                <span
                    key={`${log.id}-match-${i}`}
                    className={isActive ? 'bg-[var(--focus-border-color)] text-[var(--st-monitor-tab-active-text)] shadow-sm' : 'bg-[var(--st-logsearch-match-highlight)] text-[var(--st-monitor-tab-inactive-text)]'}
                >
                    {text.substring(match.startIndex, match.endIndex)}
                </span>
            );
            lastIndex = match.endIndex;
        });

        if (lastIndex < text.length) {
            result.push(text.substring(lastIndex));
        }
        return result;
    };

    const { parseSystemMessage } = useSystemMessage();

    const lineHeightPx = Math.floor(fontSize * 1.5);
    const itemHeightPx = Math.floor(fontSize * 1.4);

    // 系统信息/错误消息特殊渲染
    if (log.type === 'INFO' || log.type === 'ERROR') {
        const content = formatData(log.data, 'text', encoding).trim();
        const { styleClass, translatedText } = parseSystemMessage(log.type, content);
        return (
            <div className="flex justify-center my-2 gap-2 items-center" style={{ transform: 'translateZ(0)' }}>
                <span className={`px-4 py-1 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 select-text cursor-text ${styleClass}`}>
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

    // 常规数据日志渲染
    return (
        <div
            className={`flex items-start gap-1.5 mb-1 hover:bg-[var(--list-hover-background)] rounded-sm px-1.5 py-0.5 group relative ${(isNewLog && flashNewMessage) ? 'animate-flash-new' : ''} border border-transparent`}
            style={{
                fontSize: 'inherit',
                fontFamily: 'inherit',
                transform: 'translateZ(0)',
                lineHeight: `${lineHeightPx}px`,
                '--flash-color': 'var(--selection-background)'
            } as React.CSSProperties}
            onContextMenu={(e) => onContextMenu(e, log)}
        >
            {(showTimestamp || (log.repeatCount && log.repeatCount > 1)) && (
                <div className="shrink-0 flex items-center select-none gap-1.5" style={{ height: `${lineHeightPx}px` }}>
                    {showTimestamp && (
                        <span className="text-[var(--activitybar-inactive-foreground)] font-mono tabular-nums tracking-tight">
                            [{formatTimestamp(log.timestamp, timestampFormat || 'HH:mm:ss.SSS').trim()}]
                        </span>
                    )}
                </div>
            )}
            <div className="flex items-center gap-1.5 shrink-0" style={{ height: `${lineHeightPx}px` }}>
                {showPacketType && (
                    <div
                        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-[0.2em] font-bold font-mono rounded-[0.2em] text-[0.8em] leading-none border shadow-sm px-1 w-[8.5em] shrink-0 select-none pt-[1px]
                        ${log.type === 'TX' && log.crcStatus === 'none' 
                            ? (log.topic === 'virtual' ? 'bg-[var(--st-tcom-v-bg)] text-[var(--st-tcom-v-text)] border-[var(--st-tcom-v-border)]' : 'bg-[var(--st-tcom-p-bg)] text-[var(--st-tcom-p-text)] border-[var(--st-tcom-p-border)]')
                            : (log.topic === 'virtual' ? 'bg-[var(--st-monitor-log-tx-label-bg)] text-[var(--st-monitor-virtual-label-text)] border-[var(--st-monitor-log-tx-label-bg)]/40' : 'bg-[var(--st-monitor-log-rx-label-bg)] text-[var(--st-monitor-rx-label-text)] border-[var(--st-monitor-log-rx-label-bg)]/40')}`}
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        {log.type === 'TX' && log.crcStatus === 'none' ? (
                            <>
                                <span className={`font-extrabold truncate text-center shrink-0`}>Tcom</span>
                                <span className={`opacity-50 text-[0.8em] shrink-0 mx-0.5 text-center`}>-&gt;</span>
                                <span className={`opacity-90 truncate text-center shrink-0`}>{log.topic === 'virtual' ? virtualSerialPort : physicalPortPath}</span>
                            </>
                        ) : (
                            log.topic === 'virtual' ? (
                                <>
                                    <span className="opacity-90 truncate text-center shrink-0">{virtualSerialPort}</span>
                                    <span className="opacity-50 text-[0.8em] shrink-0 mx-0.5 text-center">-&gt;</span>
                                    <span className="font-extrabold text-[var(--st-monitor-virtual-label-text)] truncate text-center shrink-0">{physicalPortPath}</span>
                                </>
                            ) : (
                                <>
                                    <span className="font-extrabold text-[var(--st-monitor-rx-label-text)] truncate text-center shrink-0">{physicalPortPath}</span>
                                    <span className="opacity-50 text-[0.8em] shrink-0 mx-0.5 text-center">-&gt;</span>
                                    <span className="opacity-90 truncate text-center shrink-0">{virtualSerialPort}</span>
                                </>
                            )
                        )}
                    </div>
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
            <span className={`whitespace-pre-wrap break-all select-text cursor-text flex-1 ${
                log.type === 'TX' && log.crcStatus === 'none'
                    ? (log.topic === 'virtual' ? 'text-[var(--st-tcom-v-msg-text)] font-semibold' : 'text-[var(--st-tcom-p-msg-text)] font-semibold')
                    : (log.topic === 'virtual' ? 'text-[var(--st-tx-text)]' : 'text-[var(--st-rx-text)]')
            }`}>
                {renderHighlightedText(log, formatData(log.data, viewMode, encoding))}
            </span>
        </div>
    );
});
MonitorLogItem.displayName = 'MonitorLogItem';
