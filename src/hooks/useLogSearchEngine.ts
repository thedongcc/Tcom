/**
 * useLogSearchEngine.ts
 * 日志搜索引擎 Hook：正则匹配、索引导航、搜索状态管理。
 * 从 LogSearch.tsx 的 useLogSearch 中拆分出来。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { SearchMatch } from '../components/common/LogSearch';

/** 模块级常量，避免每次 setState([]) 创建新引用 */
const EMPTY_MATCHES: SearchMatch[] = [];

/**
 * 在匹配列表中找到最接近屏幕中心的 match 索引
 */
function findClosestMatchIndex(matches: SearchMatch[]): number {
    let closestIndex = -1;
    let minDist = Infinity;
    const center = window.innerHeight / 2;
    for (let i = 0; i < matches.length; i++) {
        const el = document.getElementById(`log-${matches[i].logId}`);
        if (el) {
            const rect = el.getBoundingClientRect();
            const dist = Math.abs(rect.top + rect.height / 2 - center);
            if (dist < minDist) { minDist = dist; closestIndex = i; }
        }
    }
    return closestIndex === -1 ? matches.length - 1 : closestIndex;
}

/**
 * 在新匹配列表中恢复之前活跃的 match 索引
 */
function restorePreviousIndex(matches: SearchMatch[], prevMatch: SearchMatch | null, fallback: number): number {
    if (prevMatch) {
        const found = matches.findIndex(m => m.logId === prevMatch.logId && m.startIndex === prevMatch.startIndex);
        return found !== -1 ? found : -1;
    }
    return fallback;
}

/**
 * 构建搜索正则表达式
 */
function buildSearchRegex(query: string, isRegex: boolean, matchCase: boolean): RegExp {
    const flags = matchCase ? 'g' : 'gi';
    const pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(pattern, flags);
}

export const useLogSearchEngine = (
    logs: any[],
    initialQuery: string = '',
    initialIsRegex: boolean = false,
    initialIsMatchCase: boolean = false,
    viewMode: 'text' | 'hex' | 'json' | 'both' | 'base64',
    formatData: (data: any, mode: any, encoding: string) => string,
    encoding: string
) => {
    const [query, setQuery] = useState(initialQuery);
    const [isRegex, setIsRegex] = useState(initialIsRegex);
    const [matchCase, setMatchCase] = useState(initialIsMatchCase);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [matches, setMatches] = useState<SearchMatch[]>(EMPTY_MATCHES);
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
            // 只在真正需要清除时才 setState，避免创建新引用触发下游重渲染
            setMatches(prev => prev.length === 0 ? prev : EMPTY_MATCHES);
            setCurrentIndex(prev => prev === -1 ? prev : -1);
            setRegexError(prev => prev === false ? prev : false);
            lastSearchRef.current.query = '';
            lastSearchRef.current.activeMatch = null;
            return;
        }

        try {
            const regex = buildSearchRegex(query, isRegex, matchCase);
            setRegexError(false);

            const newMatches: SearchMatch[] = [];
            logs.forEach(log => {
                const text = formatData(log.data, viewMode, encoding);
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(text)) !== null) {
                    newMatches.push({ logId: log.id, startIndex: match.index, endIndex: regex.lastIndex });
                    if (regex.lastIndex === match.index) regex.lastIndex++;
                }
            });

            setMatches(newMatches);

            const conditionChanged =
                lastSearchRef.current.query !== query ||
                lastSearchRef.current.isRegex !== isRegex ||
                lastSearchRef.current.matchCase !== matchCase;

            if (newMatches.length > 0) {
                if (conditionChanged) {
                    setCurrentIndex(findClosestMatchIndex(newMatches));
                    setActiveMatchRev(r => r + 1);
                } else {
                    setCurrentIndex(restorePreviousIndex(newMatches, lastSearchRef.current.activeMatch, currentIndex === -1 ? -1 : 0));
                }
            } else {
                setCurrentIndex(-1);
            }

            lastSearchRef.current.query = query;
            lastSearchRef.current.isRegex = isRegex;
            lastSearchRef.current.matchCase = matchCase;
        } catch (e) {
            console.error('Search regex error:', e);
            setMatches([]); setCurrentIndex(-1); setRegexError(true);
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
        setCurrentIndex(prev => prev === -1 ? 0 : (prev + 1) % matches.length);
        setActiveMatchRev(r => r + 1);
    }, [matches.length]);

    const prevMatch = useCallback(() => {
        if (matches.length === 0) return;
        setCurrentIndex(prev => prev === -1 ? matches.length - 1 : (prev - 1 + matches.length) % matches.length);
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
