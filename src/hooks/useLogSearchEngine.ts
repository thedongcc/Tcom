/**
 * useLogSearchEngine.ts
 * 日志搜索引擎 Hook：正则匹配、索引导航、搜索状态管理。
 * 从 LogSearch.tsx 的 useLogSearch 中拆分出来。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { SearchMatch } from '../components/common/LogSearch';

export const useLogSearchEngine = (
    logs: any[],
    initialQuery: string = '',
    initialIsRegex: boolean = false,
    initialIsMatchCase: boolean = false,
    viewMode: 'text' | 'hex' | 'json' | 'both',
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
