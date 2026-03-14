/**
 * logRenderHelpers.tsx
 * 日志渲染辅助函数 — 控制字符显示和搜索高亮渲染。
 * 从 LogItem.tsx 中拆分出来。
 */
import React from 'react';
import { LogEntry } from '../../types/session';
import { SearchMatch } from './LogItem';

/**
 * 渲染控制字符标签（CR、LF、TAB、NUL）
 * 当 show 为 true 时，将控制字符替换为带样式的可读标签。
 */
export function renderControlChars(str: string, show: boolean | undefined): React.ReactNode {
    if (!show) return str;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /[\r\n\t\0]/g;
    let match;
    let k = 0;
    while ((match = regex.exec(str)) !== null) {
        if (match.index > lastIndex) {
            parts.push(str.substring(lastIndex, match.index));
        }
        const char = match[0];
        let label = '';
        if (char === '\r') label = 'CR';
        else if (char === '\n') label = 'LF';
        else if (char === '\t') label = 'TAB';
        else if (char === '\0') label = 'NUL';

        parts.push(
            <span key={`ctrl-${k++}`}
                className="inline-flex items-center justify-center font-bold text-[0.72em] mx-[2px] px-[4px] py-0 rounded-[3px] select-none border"
                style={{
                    height: '1.5em',
                    verticalAlign: 'middle',
                    transform: 'translateY(-1px)',
                    color: 'var(--st-ctrl-char-fg, currentColor)',
                    backgroundColor: 'var(--st-ctrl-char-bg, rgba(128,128,128,0.12))',
                    borderColor: 'var(--st-ctrl-char-border, currentColor)',
                }}>
                {label}
            </span>
        );

        // 保留原始换行/制表符以正确渲染格式
        if (char === '\n') parts.push('\n');
        else if (char === '\t') parts.push('\t');

        lastIndex = match.index + 1;
    }
    if (lastIndex < str.length) {
        parts.push(str.substring(lastIndex));
    }
    return parts.length > 0 ? parts : str;
}

/**
 * 渲染带搜索高亮的文本
 * 将匹配项高亮显示，活跃匹配项使用不同样式。
 */
export function renderHighlightedText(
    log: LogEntry,
    text: string,
    matches: SearchMatch[],
    activeMatch: SearchMatch | null,
    showControlChars: boolean | undefined
): React.ReactNode {
    const logMatches = matches.filter((m: any) => m.logId === log.id) as SearchMatch[];
    if (logMatches.length === 0) return renderControlChars(text, showControlChars);

    const sortedMatches = [...logMatches].sort((a, b) => a.startIndex - b.startIndex);
    const result: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedMatches.forEach((match, i) => {
        if (match.startIndex > lastIndex) {
            result.push(renderControlChars(text.substring(lastIndex, match.startIndex), showControlChars));
        }
        const isActive = activeMatch === match;
        result.push(
            <span
                key={`${log.id}-match-${i}`}
                className={isActive ? 'bg-[var(--focus-border-color)] text-white shadow-sm' : 'bg-[var(--selection-background)] text-[var(--st-monitor-toolbar-foreground)]'}
            >
                {renderControlChars(text.substring(match.startIndex, match.endIndex), showControlChars)}
            </span>
        );
        lastIndex = match.endIndex;
    });

    if (lastIndex < text.length) {
        result.push(renderControlChars(text.substring(lastIndex), showControlChars));
    }
    return result;
}
