/**
 * MqttLogItem.tsx
 * MQTT 监视器日志条目渲染组件。
 * 从 MqttMonitor.tsx 中拆分出来。
 */
import React from 'react';
import { LogEntry, MqttSessionConfig } from '../../types/session';
import { useSystemMessage } from '../../hooks/useSystemMessage';

interface SearchMatch {
    logId: string;
    startIndex: number;
    endIndex: number;
    [key: string]: any;
}

export interface MqttLogItemProps {
    log: LogEntry;
    isNewLog: boolean;
    isTX: boolean;
    topicColor: string;
    viewMode: 'text' | 'hex' | 'json' | 'base64';
    showTimestamp: boolean;
    showDataLength: boolean;
    mergeRepeats: boolean;
    flashNewMessage: boolean;
    fontSize: number;
    formatTimestamp: (ts: number) => string;
    getDataLengthText: (data: string | Uint8Array) => string;
    formatData: (data: string | Uint8Array, mode: 'text' | 'hex' | 'json' | 'base64') => string;
    matches: SearchMatch[];
    activeMatch?: SearchMatch | null;
}

export const MqttLogItem = React.memo(({
    log, isNewLog, isTX, topicColor, viewMode,
    showTimestamp, showDataLength, mergeRepeats, flashNewMessage, fontSize,
    formatTimestamp, getDataLengthText, formatData,
    matches, activeMatch,
}: MqttLogItemProps) => {
    const { parseSystemMessage } = useSystemMessage();
    const itemHeightPx = Math.floor(fontSize * 1.4);

    // 高亮搜索匹配
    const renderHighlightedText = (log: LogEntry, text: string) => {
        const logMatches = matches.filter(m => m.logId === log.id);
        if (logMatches.length === 0) return text;

        const sortedMatches = [...logMatches].sort((a, b) => a.startIndex - b.startIndex);
        const result: React.ReactNode[] = [];
        let lastIndex = 0;

        sortedMatches.forEach((match, i) => {
            if (match.startIndex > lastIndex) {
                result.push(text.substring(lastIndex, match.startIndex));
            }
            const isActive = activeMatch === match;
            result.push(
                <span
                    key={`${log.id}-match-${i}`}
                    className={isActive ? 'bg-[var(--focus-border-color)] text-white shadow-sm' : 'bg-[var(--selection-background)] text-[var(--st-monitor-toolbar-foreground)]'}
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

    // JSON 语法高亮渲染
    const renderPayload = (log: LogEntry) => {
        const { data } = log;
        if (viewMode === 'json') {
            try {
                const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
                const obj = JSON.parse(str);
                const json = JSON.stringify(obj, null, 2);
                const highlighted = json
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*\"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[\[\]{}:,])/g, (match) => {
                        let cls = 'color: var(--st-json-punctuation);';
                        if (/^"/.test(match)) {
                            cls = /:$/.test(match) ? 'color: var(--st-json-key); font-weight: bold;' : 'color: var(--st-json-string);';
                        } else if (/true|false/.test(match)) cls = 'color: var(--st-json-boolean); font-weight: bold;';
                        else if (/null/.test(match)) cls = 'color: var(--st-json-null); font-weight: bold;';
                        else if (/^-?\d/.test(match)) cls = 'color: var(--st-json-number);';
                        else if (/[\[\]{}:,]/.test(match)) cls = 'color: var(--st-json-punctuation); font-weight: bold;';
                        return `<span style="${cls}">${match}</span>`;
                    });
                return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
            } catch { /* fallback to text */ }
        }
        return renderHighlightedText(log, formatData(data, viewMode));
    };

    // 系统消息（INFO/ERROR）渲染
    if (log.type === 'INFO' || log.type === 'ERROR' || !log.topic) {
        const content = formatData(log.data, 'text').trim();
        const { styleClass, translatedText } = parseSystemMessage(log.type, content);

        return (
            <div className="flex justify-center my-2 gap-2 items-center" data-component="system-message">
                <span className={`px-4 py-1 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 select-text cursor-text ${styleClass}`}>
                    {translatedText}
                </span>
                {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                    <span className="h-[18px] flex items-center justify-center text-[10px] text-[var(--st-monitor-repeat-badge-text)] font-bold font-mono bg-[var(--st-monitor-repeat-badge-bg)] px-1.5 rounded-full border border-[var(--st-monitor-repeat-badge-bg)]/30 min-w-[24px]">
                        x{log.repeatCount}
                    </span>
                )}
            </div>
        );
    }

    // 常规消息气泡渲染
    return (
        <div
            id={`log-${log.id}`}
            className={`flex w-full ${isTX ? 'justify-end' : 'justify-start'}`}
        >
            <div
                className={`relative max-w-[90%] rounded-lg px-3 py-1.5 border shadow-sm ${isTX ? 'rounded-br-sm' : 'rounded-bl-sm'} ${((isNewLog || (log.repeatCount && log.repeatCount > 1)) && flashNewMessage && isNewLog) ? 'animate-flash-new' : 'bg-[var(--input-background)]'} ${activeMatch?.logId === log.id ? 'ring-1 ring-[var(--st-monitor-gold-flash)]' : ''}`}
                style={{ borderColor: isTX ? 'var(--monitor-bubble-tx-border)' : 'var(--monitor-bubble-rx-border)' }}
            >
                <div className={`flex items-center gap-1.5 shrink-0 mb-1 ${isTX ? 'flex-row-reverse' : 'flex-row'}`} style={{ height: `${itemHeightPx}px` }}>
                    {showTimestamp && (
                        <span className="text-[var(--st-monitor-timestamp)] font-mono opacity-90 tabular-nums tracking-tight">
                            [{formatTimestamp(log.timestamp)}]
                        </span>
                    )}
                    <span
                        className="flex items-center justify-center font-bold font-mono select-none px-[0.4em] rounded-[0.2em] min-w-[2.8em] text-[0.8em] leading-none shadow-sm tracking-wide pt-[1px]"
                        style={{ color: topicColor, backgroundColor: `${topicColor}20`, border: `1px solid ${topicColor}40`, height: `${itemHeightPx}px` }}
                    >
                        {log.topic}
                    </span>
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
                            className={`flex items-center justify-center text-[0.8em] leading-none text-[var(--st-monitor-gold-flash)] font-bold font-mono bg-[var(--st-monitor-gold-flash-bg)] px-[0.5em] rounded-[0.2em] border border-[var(--st-monitor-gold-flash-border)] min-w-[1.8em] select-none shrink-0 pt-[1px] tabular-nums tracking-tight ${(isNewLog && flashNewMessage) ? 'animate-flash-gold' : ''}`}
                            style={{ height: `${itemHeightPx}px` }}
                        >
                            x{log.repeatCount}
                        </span>
                    )}
                </div>
                <div className={`whitespace-pre-wrap break-all font-mono ${isTX ? 'text-[var(--st-tx-text)]' : 'text-[var(--st-rx-text)]'}`}>
                    {renderPayload(log)}
                </div>
            </div>
        </div>
    );
});
MqttLogItem.displayName = 'MqttLogItem';
