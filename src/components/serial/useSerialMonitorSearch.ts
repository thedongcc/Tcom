/**
 * useSerialMonitorSearch.ts
 * 串口监视器搜索/滚动/过滤/格式化逻辑 — 从 SerialMonitor.tsx 中提取。
 * 管理搜索状态持久化、日志过滤、自动滚动和 formatData。
 */
import { useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { LogEntry } from '../../types/session';
import { useLogSearch } from '../common/LogSearch';
import { Token } from '../../types/token';

interface UseSerialMonitorSearchParams {
    sessionId: string;
    logs: LogEntry[];
    autoScroll: boolean;
    flashNewMessage: boolean;
    viewMode: 'text' | 'hex' | 'both';
    encoding: string;
    filterMode: 'all' | 'rx' | 'tx';
    searchOpen: boolean;
    setSearchOpen: (v: boolean) => void;
    uiState: Record<string, any>;
    saveUIState: (updates: Record<string, any>) => void;
}

/** 模块级全局滚动位置缓存 */
const scrollPositions = new Map<string, number>();

export function useSerialMonitorSearch({
    sessionId, logs, autoScroll, flashNewMessage,
    viewMode, encoding, filterMode,
    searchOpen, setSearchOpen, uiState, saveUIState,
}: UseSerialMonitorSearchParams) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length);
    const mountTimeRef = useRef(Date.now());

    // ── 数据格式化 ──
    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex' | 'both', enc: string) => {
        let hexStr = '';
        let textStr = '';

        if (mode === 'hex' || mode === 'both') {
            if (typeof data === 'string') {
                const encoder = new TextEncoder();
                const bytes = encoder.encode(data);
                hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            } else {
                hexStr = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            }
        }

        if (mode === 'text' || mode === 'both') {
            if (typeof data === 'string') {
                textStr = data;
            } else {
                try {
                    textStr = new TextDecoder(enc).decode(data);
                } catch (e) {
                    textStr = new TextDecoder().decode(data);
                }
            }
        }

        if (mode === 'both') return `${hexStr} [${textStr}]`;
        if (mode === 'hex') return hexStr;
        return textStr;
    }, []);

    // ── 搜索 ──
    const {
        query, setQuery, isRegex, setIsRegex, matchCase, setMatchCase,
        matches, currentIndex, nextMatch, prevMatch, regexError, activeMatchRev
    } = useLogSearch(
        logs,
        uiState.searchOpen ? (uiState.searchQuery || '') : '',
        uiState.searchRegex || false,
        uiState.searchMatchCase || false,
        viewMode, formatData, encoding
    );

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        saveUIState({ searchQuery: newQuery });
    };

    const handleRegexChange = (newRegex: boolean) => {
        setIsRegex(newRegex);
        saveUIState({ searchRegex: newRegex });
    };

    const handleMatchCaseChange = (newMatchCase: boolean) => {
        setMatchCase(newMatchCase);
        saveUIState({ searchMatchCase: newMatchCase });
    };

    const handleToggleSearch = useCallback(() => {
        const next = !searchOpen;
        setSearchOpen(next);
        saveUIState({ searchOpen: next });
    }, [saveUIState, setSearchOpen, searchOpen]);

    // Ctrl+F 快捷键
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                handleToggleSearch();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleToggleSearch]);

    const activeMatch = matches[currentIndex];

    // 导航到活跃搜索匹配项
    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }, [activeMatchRev, activeMatch]);

    // ── 自动滚动 ──
    useLayoutEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            scrollPositions.set(sessionId, scrollRef.current.scrollHeight);
        }
    }, [logs, autoScroll, sessionId]);

    useLayoutEffect(() => {
        if (scrollRef.current && scrollPositions.has(sessionId)) {
            scrollRef.current.scrollTop = scrollPositions.get(sessionId) as number;
        }
    }, [sessionId]);

    useEffect(() => {
        if (!scrollRef.current || !autoScroll) return;
        const observer = new ResizeObserver(() => {
            if (scrollRef.current && scrollRef.current.clientHeight > 0) {
                if (scrollPositions.has(sessionId)) {
                    scrollRef.current.scrollTop = scrollPositions.get(sessionId) as number;
                }
            }
        });
        observer.observe(scrollRef.current);
        return () => observer.disconnect();
    }, [sessionId, autoScroll]);

    // ── 日志过滤 ──
    const filteredLogs = logs.filter(log => {
        if (log.type === 'INFO' || log.type === 'ERROR') return true;
        if (filterMode === 'rx') return log.type === 'RX';
        if (filterMode === 'tx') return log.type === 'TX';
        return true;
    });

    // ── 输入状态变更回调 ──
    const handleInputStateChange = useCallback((state: {
        content: string; html: string; tokens: Record<string, Token>;
        mode: 'text' | 'hex'; lineEnding: string; timerInterval: number;
    }) => {
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens as any,
            inputMode: state.mode,
            lineEnding: state.lineEnding,
            inputTimerInterval: state.timerInterval,
        });
    }, [saveUIState]);

    // ── 滚动事件回调 ──
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (!autoScroll) scrollPositions.set(sessionId, e.currentTarget.scrollTop);
    }, [autoScroll, sessionId]);

    return {
        scrollRef, initialLogCountRef, mountTimeRef, scrollPositions,
        formatData, filteredLogs,
        // 搜索
        query, isRegex, matchCase, matches, currentIndex, activeMatch, regexError,
        handleQueryChange, handleRegexChange, handleMatchCaseChange, handleToggleSearch,
        nextMatch, prevMatch,
        // 输入与滚动
        handleInputStateChange, handleScroll,
    };
}
