import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, X, ChevronUp, ChevronDown, Regex } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SearchMatch {
    logId: string;
    startIndex: number;
    endIndex: number;
}

export interface LogSearchProps {
    // State
    isOpen: boolean;
    query: string;
    isRegex: boolean;
    isMatchCase: boolean;

    // Actions
    onToggle: () => void;
    onQueryChange: (query: string) => void;
    onRegexChange: (isRegex: boolean) => void;
    onMatchCaseChange: (isMatchCase: boolean) => void;
    onNext: () => void;
    onPrev: () => void;

    // Data
    logs: any[];
    currentIndex: number;
    totalMatches: number;
    viewMode: 'text' | 'hex' | 'json';
    formatData: (data: any, mode: any, encoding: string) => string;
    encoding: string;
    regexError?: boolean;
}

export const useLogSearch = (
    logs: any[],
    initialQuery: string = '',
    initialIsRegex: boolean = false,
    initialIsMatchCase: boolean = false,
    viewMode: 'text' | 'hex' | 'json',
    formatData: (data: any, mode: any, encoding: string) => string,
    encoding: string
) => {
    const [query, setQuery] = useState(initialQuery);
    const [isRegex, setIsRegex] = useState(initialIsRegex);
    const [matchCase, setMatchCase] = useState(initialIsMatchCase);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [matches, setMatches] = useState<SearchMatch[]>([]);
    const [regexError, setRegexError] = useState(false);
    const [activeMatchRev, setActiveMatchRev] = useState(0);

    // 同步外部传入的查询条件（比如当搜索框关闭时强制清除词）
    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        setIsRegex(initialIsRegex);
    }, [initialIsRegex]);

    useEffect(() => {
        setMatchCase(initialIsMatchCase);
    }, [initialIsMatchCase]);

    // 记录上一次成功搜索的条件信息
    const lastSearchRef = useRef({
        query: '',
        isRegex: false,
        matchCase: false,
        activeMatch: null as SearchMatch | null
    });

    useEffect(() => {
        if (!query) {
            setMatches([]);
            setCurrentIndex(-1);
            setRegexError(false);
            lastSearchRef.current.query = '';
            lastSearchRef.current.activeMatch = null;
            return;
        }

        try {
            let regex: RegExp;
            const flags = matchCase ? 'g' : 'gi';
            if (isRegex) {
                regex = new RegExp(query, flags);
            } else {
                const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(escapedQuery, flags);
            }
            setRegexError(false);

            const newMatches: SearchMatch[] = [];
            logs.forEach(log => {
                const text = formatData(log.data, viewMode, encoding);
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(text)) !== null) {
                    newMatches.push({
                        logId: log.id,
                        startIndex: match.index,
                        endIndex: regex.lastIndex
                    });
                    if (regex.lastIndex === match.index) regex.lastIndex++;
                }
            });

            setMatches(newMatches);

            // 判断搜索词或模式是否改变
            const conditionChanged =
                lastSearchRef.current.query !== query ||
                lastSearchRef.current.isRegex !== isRegex ||
                lastSearchRef.current.matchCase !== matchCase;

            if (newMatches.length > 0) {
                if (conditionChanged) {
                    // 查询条件变了，找到屏幕中心的 match
                    let closestIndex = -1;
                    let minDist = Infinity;
                    const center = window.innerHeight / 2;
                    for (let i = 0; i < newMatches.length; i++) {
                        const el = document.getElementById(`log-${newMatches[i].logId}`);
                        if (el) {
                            const rect = el.getBoundingClientRect();
                            const dist = Math.abs(rect.top + rect.height / 2 - center);
                            if (dist < minDist) {
                                minDist = dist;
                                closestIndex = i;
                            }
                        }
                    }
                    if (closestIndex === -1) {
                        closestIndex = newMatches.length - 1; // 如果都没渲染，选最新的
                    }
                    setCurrentIndex(closestIndex);
                    setActiveMatchRev(r => r + 1); // 触发滚动
                } else {
                    // 条件没变但是 logs 有更新：尝试找回之前的焦点
                    const prevMatch = lastSearchRef.current.activeMatch;
                    let nextIndex = 0;
                    if (prevMatch) {
                        const foundIndex = newMatches.findIndex(m =>
                            m.logId === prevMatch.logId &&
                            m.startIndex === prevMatch.startIndex
                        );
                        if (foundIndex !== -1) {
                            nextIndex = foundIndex;
                        } else {
                            nextIndex = -1;
                        }
                    } else if (currentIndex === -1) {
                        nextIndex = -1;
                    }
                    setCurrentIndex(nextIndex);
                    // 注意：这里不增加 activeMatchRev，不让他滚动
                }
            } else {
                setCurrentIndex(-1);
            }

            // 记录新的搜索条件
            lastSearchRef.current.query = query;
            lastSearchRef.current.isRegex = isRegex;
            lastSearchRef.current.matchCase = matchCase;

        } catch (e) {
            console.error('Search regex error:', e);
            setMatches([]);
            setCurrentIndex(-1);
            setRegexError(true);
        }
    }, [query, isRegex, matchCase, logs, viewMode, formatData, encoding]);

    // 同步 activeMatch
    useEffect(() => {
        if (currentIndex >= 0 && currentIndex < matches.length) {
            lastSearchRef.current.activeMatch = matches[currentIndex];
        } else {
            lastSearchRef.current.activeMatch = null;
        }
    }, [currentIndex, matches]);

    const nextMatch = useCallback(() => {
        if (matches.length === 0) return;
        setCurrentIndex(prev => {
            const next = prev === -1 ? 0 : (prev + 1) % matches.length;
            return next;
        });
        setActiveMatchRev(r => r + 1);
    }, [matches.length]);

    const prevMatch = useCallback(() => {
        if (matches.length === 0) return;
        setCurrentIndex(prev => {
            const next = prev === -1 ? matches.length - 1 : (prev - 1 + matches.length) % matches.length;
            return next;
        });
        setActiveMatchRev(r => r + 1);
    }, [matches.length]);

    return {
        query, setQuery,
        isRegex, setIsRegex,
        matchCase, setMatchCase,
        currentIndex,
        matches,
        nextMatch,
        prevMatch,
        regexError,
        activeMatchRev
    };
};

export const LogSearch: React.FC<LogSearchProps> = ({
    isOpen,
    query,
    isRegex,
    isMatchCase,
    onToggle,
    onQueryChange,
    onRegexChange,
    onMatchCaseChange,
    onNext,
    onPrev,
    currentIndex,
    totalMatches,
    regexError
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onQueryChange(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                onPrev();
            } else {
                onNext();
            }
        } else if (e.key === 'Escape') {
            onToggle();
        }
    };

    return (
        <div className="relative flex items-center">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ width: 0, opacity: 0, scale: 0.95 }}
                        animate={{ width: 'auto', opacity: 1, scale: 1 }}
                        exit={{ width: 0, opacity: 0, scale: 0.95 }}
                        className={`flex items-center border rounded-sm overflow-hidden mr-1 shadow-lg h-7 transition-colors focus-within:ring-1 focus-within:ring-[var(--focus-border-color)] ${regexError ? 'border-[var(--st-error-text)] shadow-sm' : ''
                            }`}
                        style={{
                            backgroundColor: 'var(--widget-background)',
                            borderColor: regexError ? undefined : 'var(--widget-border-color)',
                        }}
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Find..."
                            className="bg-transparent border-none outline-none text-xs px-2 w-48 h-full font-mono"
                            style={{ color: 'var(--app-foreground)' }}
                        />

                        <div
                            className="flex items-center px-1 text-[10px] font-mono min-w-[40px] justify-center select-none"
                            style={{ color: 'var(--input-placeholder-color)' }}
                        >
                            {totalMatches > 0 ? `${currentIndex + 1}/${totalMatches}` : '0/0'}
                        </div>

                        <div className="flex items-center space-x-0.5 px-0.5">
                            <button
                                onClick={() => onMatchCaseChange(!isMatchCase)}
                                className={`flex items-center justify-center w-5 h-5 transition-colors rounded-[4px] ${isMatchCase ? 'bg-[var(--button-background)] text-[var(--button-foreground)]' : ''}`}
                                style={isMatchCase ? {} : { color: 'var(--input-placeholder-color)' }}
                                onMouseEnter={e => { if (!isMatchCase) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'; }}
                                onMouseLeave={e => { if (!isMatchCase) (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
                                title="Match Case"
                            >
                                <span className="font-sans font-medium text-[13px] leading-none tracking-tight">Aa</span>
                            </button>
                            <button
                                onClick={() => onRegexChange(!isRegex)}
                                className={`flex items-center justify-center w-5 h-5 transition-colors rounded-[4px] ${isRegex ? 'bg-[var(--button-background)] text-[var(--button-foreground)]' : ''}`}
                                style={isRegex ? {} : { color: 'var(--input-placeholder-color)' }}
                                onMouseEnter={e => { if (!isRegex) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'; }}
                                onMouseLeave={e => { if (!isRegex) (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
                                title="Use Regular Expression"
                            >
                                <span className="font-mono font-bold text-[14px] leading-none tracking-widest pl-[1px] transform -translate-y-[1px]">.*</span>
                            </button>
                        </div>

                        <div className="w-[1px] h-4 mx-1" style={{ backgroundColor: 'var(--widget-border-color)' }} />

                        <button
                            onClick={onPrev}
                            disabled={totalMatches === 0}
                            className="p-1 disabled:opacity-30 transition-colors rounded-[4px]"
                            style={{ color: 'var(--focus-border-color)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''}
                            title="Previous Match (Shift+Enter)"
                        >
                            <ChevronUp size={14} />
                        </button>
                        <button
                            onClick={onNext}
                            disabled={totalMatches === 0}
                            className="p-1 disabled:opacity-30 transition-colors rounded-[4px]"
                            style={{ color: 'var(--focus-border-color)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''}
                            title="Next Match (Enter)"
                        >
                            <ChevronDown size={14} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={onToggle}
                className="p-1.5 rounded transition-colors"
                style={isOpen
                    ? { backgroundColor: 'var(--accent-color)', color: 'var(--button-foreground)' }
                    : { color: 'var(--input-placeholder-color)' }
                }
                onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'; }}
                onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
                title="Find (Ctrl+F)"
            >
                {isOpen ? <X size={16} /> : <Search size={16} />}
            </button>
        </div>
    );
};

