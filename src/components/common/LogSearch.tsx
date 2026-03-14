import React, { useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from './Tooltip';
import { useI18n } from '../../context/I18nContext';

export interface SearchMatch {
    logId: string;
    startIndex: number;
    endIndex: number;
    [key: string]: any;
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
    viewMode: 'text' | 'hex' | 'json' | 'both' | 'base64';
    formatData: (data: any, mode: any, encoding: string) => string;
    encoding: string;
    regexError?: boolean;
}

// useLogSearch 已拆分到独立文件，此处保留重导出以兼容现有消费者
export { useLogSearchEngine as useLogSearch } from '../../hooks/useLogSearchEngine';


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
    const { t } = useI18n();

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
                            backgroundColor: 'var(--st-logsearch-bg)',
                            borderColor: regexError ? undefined : 'var(--st-logsearch-border)',
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
                            style={{ color: 'var(--st-logsearch-text)' }}
                        />

                        <div
                            className="flex items-center px-1 text-[10px] font-mono min-w-[40px] justify-center select-none"
                            style={{ color: 'var(--input-placeholder-color)' }}
                        >
                            {totalMatches > 0 ? `${currentIndex + 1}/${totalMatches}` : '0/0'}
                        </div>

                        <div className="flex items-center space-x-0.5 px-0.5">
                            <Tooltip content={t('search.matchCase')} position="bottom" wrapperClassName="flex items-center">
                                <button
                                    onClick={() => onMatchCaseChange(!isMatchCase)}
                                    className={`flex items-center justify-center w-5 h-5 transition-colors rounded-[4px] ${isMatchCase ? 'bg-[var(--logsearch-btn-match-case-active-bg)] text-white' : ''}`}
                                    style={isMatchCase ? {} : { color: 'var(--input-placeholder-color)' }}
                                    onMouseEnter={e => { if (!isMatchCase) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'; }}
                                    onMouseLeave={e => { if (!isMatchCase) (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
                                >
                                    <span className="font-sans font-medium text-[13px] leading-none tracking-tight">Aa</span>
                                </button>
                            </Tooltip>
                            <Tooltip content={t('search.useRegex')} position="bottom" wrapperClassName="flex items-center">
                                <button
                                    onClick={() => onRegexChange(!isRegex)}
                                    className={`flex items-center justify-center w-5 h-5 transition-colors rounded-[4px] ${isRegex ? 'bg-[var(--logsearch-btn-regex-active-bg)] text-white' : ''}`}
                                    style={isRegex ? {} : { color: 'var(--input-placeholder-color)' }}
                                    onMouseEnter={e => { if (!isRegex) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'; }}
                                    onMouseLeave={e => { if (!isRegex) (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
                                >
                                    <span className="font-mono font-bold text-[14px] leading-none tracking-widest pl-[1px] transform -translate-y-[1px]">.*</span>
                                </button>
                            </Tooltip>
                        </div>

                        <div className="w-[1px] h-4 mx-1" style={{ backgroundColor: 'var(--widget-border-color)' }} />

                        <Tooltip content={t('search.prevMatch')} position="bottom" wrapperClassName="flex items-center">
                            <button
                                onClick={onPrev}
                                disabled={totalMatches === 0}
                                className="p-1 disabled:opacity-30 transition-colors rounded-[4px]"
                                style={{ color: 'var(--focus-border-color)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''}
                            >
                                <ChevronUp size={14} />
                            </button>
                        </Tooltip>
                        <Tooltip content={t('search.nextMatch')} position="bottom" wrapperClassName="flex items-center">
                            <button
                                onClick={onNext}
                                disabled={totalMatches === 0}
                                className="p-1 disabled:opacity-30 transition-colors rounded-[4px]"
                                style={{ color: 'var(--focus-border-color)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''}
                            >
                                <ChevronDown size={14} />
                            </button>
                        </Tooltip>
                    </motion.div>
                )}
            </AnimatePresence>

            <Tooltip content={t('search.closeSearch')} position="bottom">
                <button
                    onClick={onToggle}
                    className="p-1.5 rounded transition-colors"
                    style={isOpen
                        ? { backgroundColor: 'var(--logsearch-nav-active-bg)', color: 'white' }
                        : { color: 'var(--input-placeholder-color)' }
                    }
                    onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)'; }}
                    onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
                >
                    {isOpen ? <X size={16} /> : <Search size={16} />}
                </button>
            </Tooltip>
        </div>
    );
};

