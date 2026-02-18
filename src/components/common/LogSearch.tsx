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

    // Actions
    onToggle: () => void;
    onQueryChange: (query: string) => void;
    onRegexChange: (isRegex: boolean) => void;
    onNext: () => void;
    onPrev: () => void;

    // Data
    logs: any[];
    currentIndex: number;
    totalMatches: number;
    viewMode: 'text' | 'hex' | 'json';
    formatData: (data: any, mode: any, encoding: string) => string;
    encoding: string;
}

export const useLogSearch = (
    logs: any[],
    initialQuery: string = '',
    initialIsRegex: boolean = false,
    viewMode: 'text' | 'hex' | 'json',
    formatData: (data: any, mode: any, encoding: string) => string,
    encoding: string
) => {
    const [query, setQuery] = useState(initialQuery);
    const [isRegex, setIsRegex] = useState(initialIsRegex);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [matches, setMatches] = useState<SearchMatch[]>([]);

    // Update state when initial props change (if needed for deep linking/restoring)
    useEffect(() => {
        if (initialQuery !== query && query === '') setQuery(initialQuery);
        if (initialIsRegex !== isRegex) setIsRegex(initialIsRegex);
        // We only start sync if local is empty to avoid overwriting user input, 
        // OR we can rely on parent to pass initial values only on mount.
        // For now, let's treat initial* as true INITIAL values for useState.
        // So we don't need this effect if we assume component remounts.
        // But if we want to sync with external state changes:
    }, []);

    useEffect(() => {
        if (!query) {
            setMatches([]);
            setCurrentIndex(-1);
            return;
        }

        try {
            let regex: RegExp;
            if (isRegex) {
                regex = new RegExp(query, 'gi');
            } else {
                // Escape special characters for literal search
                const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(escapedQuery, 'gi');
            }

            const newMatches: SearchMatch[] = [];
            logs.forEach(log => {
                const text = formatData(log.data, viewMode, encoding);
                let match;
                // Use exec for global search to find all occurrences in a line
                // Reset regex index for each line if not global, but we use 'gi'
                regex.lastIndex = 0;
                while ((match = regex.exec(text)) !== null) {
                    newMatches.push({
                        logId: log.id,
                        startIndex: match.index,
                        endIndex: regex.lastIndex
                    });
                    if (regex.lastIndex === match.index) regex.lastIndex++; // Avoid infinite loops
                }
            });

            setMatches(newMatches);
            setCurrentIndex(newMatches.length > 0 ? 0 : -1);
        } catch (e) {
            console.error('Search regex error:', e);
            setMatches([]);
            setCurrentIndex(-1);
        }
    }, [query, isRegex, logs, viewMode, formatData, encoding]);

    const nextMatch = useCallback(() => {
        if (matches.length === 0) return;
        setCurrentIndex(prev => (prev + 1) % matches.length);
    }, [matches.length]);

    const prevMatch = useCallback(() => {
        if (matches.length === 0) return;
        setCurrentIndex(prev => (prev - 1 + matches.length) % matches.length);
    }, [matches.length]);

    return {
        query,
        setQuery,
        isRegex,
        setIsRegex,
        currentIndex,
        matches,
        nextMatch,
        prevMatch
    };
};

export const LogSearch: React.FC<LogSearchProps> = ({
    isOpen,
    query,
    isRegex,
    onToggle,
    onQueryChange,
    onRegexChange,
    onNext,
    onPrev,
    currentIndex,
    totalMatches,
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
                        className="flex items-center bg-[#252526] border border-[#454545] rounded-sm overflow-hidden mr-1 shadow-lg h-7"
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Find..."
                            className="bg-transparent border-none outline-none text-[#cccccc] text-xs px-2 w-48 h-full font-mono"
                        />

                        <div className="flex items-center px-1 text-[10px] text-[#888888] font-mono min-w-[40px] justify-center select-none">
                            {totalMatches > 0 ? `${currentIndex + 1}/${totalMatches}` : '0/0'}
                        </div>

                        <button
                            onClick={() => onRegexChange(!isRegex)}
                            className={`p-1 hover:bg-[#3c3c3c] transition-colors ${isRegex ? 'text-[#007acc] bg-[#3c3c3c]' : 'text-[#969696]'}`}
                            title="Use Regular Expression (Alt+R)"
                        >
                            <Regex size={14} />
                        </button>

                        <div className="w-[1px] h-4 bg-[#454545] mx-0.5" />

                        <button
                            onClick={onPrev}
                            disabled={totalMatches === 0}
                            className="p-1 hover:bg-[#3c3c3c] text-[#969696] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Previous Match (Shift+Enter)"
                        >
                            <ChevronUp size={14} />
                        </button>
                        <button
                            onClick={onNext}
                            disabled={totalMatches === 0}
                            className="p-1 hover:bg-[#3c3c3c] text-[#969696] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Next Match (Enter)"
                        >
                            <ChevronDown size={14} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={onToggle}
                className={`p-1.5 rounded transition-colors ${isOpen ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3c3c3c]'}`}
                title="Find (Ctrl+F)"
            >
                {isOpen ? <X size={16} /> : <Search size={16} />}
            </button>
        </div>
    );
};

