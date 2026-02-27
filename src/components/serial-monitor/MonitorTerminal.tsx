import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import {
    Trash2,
    ArrowDownToLine,
    Download,
    Menu,
    X,
    ChevronDown,
    Copy,
    PlusSquare,
    Check,
    FileText,
    Settings,
    RefreshCw,
    Send
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCommandContext } from '../../context/CommandContext';
import { useSession } from '../../context/SessionContext';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { formatTimestamp } from '../../utils/format';
import { SerialInput } from '../serial/SerialInput';
import { motion, AnimatePresence } from 'framer-motion';
import { generateUniqueName } from '../../utils/commandUtils';
import { CommandEditorDialog } from '../commands/CommandEditorDialog';
import { ContextMenu } from '../common/ContextMenu';
import { SessionState, MonitorSessionConfig, LogEntry } from '../../types/session';
import { LogSearch, useLogSearch } from '../common/LogSearch';
import { useI18n } from '../../context/I18nContext';
import { useSystemMessage } from '../../hooks/useSystemMessage';

interface MonitorTerminalProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onConnectRequest?: () => Promise<boolean>;
}

// Memoized Log Item Component
const LogItem = React.memo(({
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
    fontSize = 15
}: any) => {
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
                    className={isActive ? 'bg-[var(--focus-border-color)] text-white shadow-sm' : 'bg-[var(--selection-background)] text-[var(--app-foreground)]'}
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
                        className="flex items-center justify-center text-[0.67em] text-[var(--button-background)] font-bold font-mono bg-[var(--button-background)]/10 px-[0.4em] rounded-full border border-[var(--button-background)]/30 min-w-[1.6em]"
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
            className={`flex items-start gap-1.5 mb-1 hover:bg-[var(--list-hover-background)] rounded-sm px-1.5 py-0.5 group relative ${(isNewLog && flashNewMessage) ? 'animate-flash-new' : ''} border border-transparent`}
            style={{
                fontSize: 'inherit',
                fontFamily: 'inherit',
                transform: 'translateZ(0)',
                lineHeight: `${lineHeightPx}px`,
                '--flash-color': 'var(--selection-background)'
            } as any}
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
                        className={`flex items-center justify-center gap-[0.2em] font-bold font-mono rounded-[0.2em] text-[0.8em] leading-none border shadow-sm w-auto px-1 min-w-[5.5em] shrink-0 select-none pt-[1px]
                        ${log.topic === 'virtual' ? 'bg-[var(--button-background)]/20 text-[var(--app-foreground)] border-[var(--button-background)]/40' : 'bg-[var(--st-rx-label)]/20 text-[var(--app-foreground)] border-[var(--st-rx-label)]/40'}`}
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        {log.type === 'TX' && log.crcStatus === 'none' ? (
                            <>
                                <span className="font-extrabold text-[var(--app-foreground)] truncate max-w-[3em] text-center shrink-0">Tcom</span>
                                <span className="opacity-50 text-[0.8em] shrink-0 mx-0.5">-&gt;</span>
                                <span className="opacity-90 truncate max-w-[3em] text-center shrink-0">{log.topic === 'virtual' ? virtualSerialPort : physicalPortPath}</span>
                            </>
                        ) : (
                            log.topic === 'virtual' ? (
                                <>
                                    <span className="opacity-90 truncate max-w-[3em] text-center shrink-0">{virtualSerialPort}</span>
                                    <span className="opacity-50 text-[0.8em] shrink-0 mx-0.5">-&gt;</span>
                                    <span className="font-extrabold text-[var(--app-foreground)] truncate max-w-[3em] text-center shrink-0">{physicalPortPath}</span>
                                </>
                            ) : (
                                <>
                                    <span className="font-extrabold text-[var(--app-foreground)] truncate max-w-[3em] text-center shrink-0">{physicalPortPath}</span>
                                    <span className="opacity-50 text-[0.8em] shrink-0 mx-0.5">-&gt;</span>
                                    <span className="opacity-90 truncate max-w-[3em] text-center shrink-0">{virtualSerialPort}</span>
                                </>
                            )
                        )}
                    </div>
                )}
                {showDataLength && (
                    <span
                        className="flex items-center justify-center font-mono select-none px-[0.4em] rounded-[0.2em] min-w-[2.8em] text-[0.8em] leading-none shadow-sm border border-white/10 bg-white/5 text-[#aaaaaa] pt-[1px] tabular-nums tracking-tight shrink-0"
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        {getDataLengthText(log.data)}
                    </span>
                )}
                {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                    <span
                        key={log.repeatCount}
                        className={`flex items-center justify-center text-[0.8em] leading-none text-[#ff9632] font-bold font-mono bg-[#ff9632]/10 px-[0.5em] rounded-[0.2em] border border-[#ff9632]/30 min-w-[1.8em] select-none shrink-0 pt-[1px] tabular-nums tracking-tight ${(isNewLog && flashNewMessage) ? 'animate-flash-gold' : ''}`}
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        x{log.repeatCount}
                    </span>
                )}
            </div>
            <span className={`whitespace-pre-wrap break-all select-text cursor-text flex-1 ${log.topic === 'virtual' ? 'text-[var(--st-tx-text)]' : 'text-[var(--st-rx-text)]'}`}>
                {renderHighlightedText(log, formatData(log.data, viewMode, encoding))}
            </span>
        </div>
    );
});

const scrollPositions = new Map<string, number>();

export const MonitorTerminal = ({ session, onShowSettings, onConnectRequest }: MonitorTerminalProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { t } = useI18n();
    const sessionManager = useSession();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length);
    const mountTimeRef = useRef(Date.now());
    const { parseSystemMessage } = useSystemMessage();

    const uiState = (config as any).uiState || {};

    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'both'>(uiState.viewMode || 'hex');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showPacketType, setShowPacketType] = useState(uiState.showPacketType !== undefined ? uiState.showPacketType : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>(uiState.encoding || 'utf-8');
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || themeConfig.typography.fontSize || 15);

    // Sync fontSize with global theme when not overridden locally
    useEffect(() => {
        if (uiState.fontSize === undefined) {
            setFontSize(themeConfig.typography.fontSize || 15);
        }
    }, [themeConfig.typography.fontSize, uiState.fontSize]);
    const [fontFamily, setFontFamily] = useState<string>(uiState.fontFamily || 'AppCoreFont');
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [flashNewMessage, setFlashNewMessage] = useState(uiState.flashNewMessage !== false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    const [sendTarget, setSendTarget] = useState<'virtual' | 'physical'>(uiState.sendTarget || 'physical');
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);
    const [partnerConnected, setPartnerConnected] = useState(true);
    // Search State
    const [searchOpen, setSearchOpen] = useState(uiState.searchOpen || false);

    const monoKeywords = ['mono', 'console', 'code', 'courier', 'fixed', 'terminal'];

    useEffect(() => {
        const queryFonts = (window as any).queryLocalFonts || (window as any).updateAPI?.listFonts;
        if (queryFonts) {
            queryFonts().then((res: any) => {
                const fonts = Array.isArray(res) ? res : (res?.fonts || []);
                const uniqueNames = Array.from(new Set(fonts.map((f: any) => typeof f === 'string' ? f : f.fullName))).sort();

                const mono: any[] = [];
                const prop: any[] = [];

                uniqueNames.forEach(name => {
                    const lower = (name as string).toLowerCase();
                    const item = { label: name as string, value: `"${name as string}"` };
                    if (monoKeywords.some(kw => lower.includes(kw))) {
                        mono.push(item);
                    } else {
                        prop.push(item);
                    }
                });

                const builtIn = [
                    { label: '内嵌字体 (Default)', value: 'AppCoreFont' },
                ];

                const final = [
                    { label: '-- Built-in --', value: '', disabled: true },
                    ...builtIn,
                    ...(mono.length > 0 ? [{ label: '-- Monospaced --', value: '', disabled: true }, ...mono] : []),
                    ...(prop.length > 0 ? [{ label: '-- Proportional --', value: '', disabled: true }, ...prop] : [])
                ];
                setAvailableFonts(final);
            });
        }
    }, []);

    const saveUIState = useCallback((updates: any) => {
        const currentUIState = (config as any).uiState || {};
        sessionManager.updateSessionConfig(session.id, { uiState: { ...currentUIState, ...updates } } as any);
    }, [session.id, sessionManager, config]);

    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex' | 'both', enc: string) => {
        let hexStr = '';
        let textStr = '';

        if (mode === 'hex' || mode === 'both') {
            const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
            hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }

        if (mode === 'text' || mode === 'both') {
            if (typeof data === 'string') {
                textStr = data;
            } else {
                try {
                    textStr = new TextDecoder(enc).decode(data);
                } catch {
                    textStr = new TextDecoder().decode(data);
                }
            }
        }

        if (mode === 'both') {
            return `${hexStr} [${textStr}]`;
        } else if (mode === 'hex') {
            return hexStr;
        } else {
            return textStr;
        }
    }, []);

    const getDataLengthText = useCallback((data: string | Uint8Array) => `${(typeof data === 'string' ? new TextEncoder().encode(data).length : data.length)}B`, []);

    // Search logic
    const { query, setQuery, isRegex, setIsRegex, matchCase, setMatchCase, matches, currentIndex, nextMatch, prevMatch, regexError, activeMatchRev } = useLogSearch(logs, uiState.searchOpen ? (uiState.searchQuery || '') : '', uiState.searchRegex || false, uiState.searchMatchCase || false, viewMode, formatData as any, encoding);
    const activeMatch = matches[currentIndex];

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
        setSearchOpen(prev => {
            const next = !prev;
            saveUIState({ searchOpen: next });
            return next;
        });
    }, [saveUIState]);

    // Ctrl+F shortcut
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

    // Scroll to active match when activeMatchRev changes
    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }, [activeMatchRev]);

    useLayoutEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            scrollPositions.set(session.id, scrollRef.current.scrollHeight);
        }
    }, [logs, autoScroll, session.id]);

    useLayoutEffect(() => {
        if (scrollRef.current && scrollPositions.has(session.id)) {
            scrollRef.current.scrollTop = scrollPositions.get(session.id)!;
        }
    }, [session.id]);

    useEffect(() => {
        if (!scrollRef.current || !autoScroll) return;
        const observer = new ResizeObserver(() => {
            if (scrollRef.current && scrollRef.current.clientHeight > 0) {
                if (scrollPositions.has(session.id)) {
                    scrollRef.current.scrollTop = scrollPositions.get(session.id)!;
                }
            }
        });
        observer.observe(scrollRef.current);
        return () => observer.disconnect();
    }, [session.id, autoScroll]);

    const handleClearLogs = () => sessionManager.clearLogs(session.id);

    const txBytes = session.txBytes || 0;
    const rxBytes = session.rxBytes || 0;

    const handleSend = (data: string | Uint8Array, mode: 'text' | 'hex') => {
        if (!isConnected) { showToast(t('toast.connectFirst'), 'error'); return; }
        let finalData = data;
        if (mode === 'hex' && typeof data === 'string') {
            const cleanHex = data.replace(/\s+/g, '');
            if (cleanHex.length % 2 === 0) {
                const byteArray = new Uint8Array(cleanHex.length / 2);
                for (let i = 0; i < cleanHex.length; i += 2) byteArray[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
                finalData = byteArray;
            }
        }
        sessionManager.writeToMonitor(session.id, sendTarget, finalData);
    };

    const filteredLogs = useMemo(() => logs.filter(log => {
        if (log.type === 'INFO' || log.type === 'ERROR') return true;
        return filterMode === 'rx' ? log.topic === 'physical' : filterMode === 'tx' ? log.topic === 'virtual' : true;
    }), [logs, filterMode]);

    const { addCommand, commands } = useCommandContext();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, log: any } | null>(null);
    const [showCommandEditor, setShowCommandEditor] = useState<any | null>(null);

    const handleLogContextMenu = useCallback((e: React.MouseEvent, log: any) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, log }); }, []);
    const handleCopyLog = (log: any) => { navigator.clipboard.writeText(formatData(log.data, viewMode, encoding)); showToast(t('toast.copied'), 'success', 1500); setContextMenu(null); };
    const handleAddToCommand = (log: any) => { setShowCommandEditor({ name: generateUniqueName(commands, 'command', undefined), payload: formatData(log.data, viewMode, encoding), mode: viewMode === 'hex' ? 'hex' : 'text', tokens: {}, lineEnding: '' }); setContextMenu(null); };

    const handleInputStateChange = useCallback((state: any) => {
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens,
            inputMode: state.mode,
            lineEnding: state.lineEnding,
            inputTimerInterval: state.timerInterval
        });
    }, [saveUIState]);

    const handleSaveCommand = (updates: any) => {
        addCommand({ ...updates, parentId: undefined });
        setShowCommandEditor(null);
    };

    const handleSaveLogs = () => {
        const content = logs.map(log => {
            const timestampStr = new Date(log.timestamp).toLocaleTimeString();
            const dataStr = formatData(log.data, viewMode, encoding);
            return `[${timestampStr}][${log.topic === 'virtual' ? 'APP' : 'DEV'}] ${dataStr} `;
        }).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `monitor_log_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[var(--app-background)] bg-cover bg-center select-none" style={{ backgroundImage: 'var(--st-rx-bg-img)' }} onClick={() => setContextMenu(null)}>
            <style>{`@keyframes flash-new { 0% { background-color: var(--flash-color); } 100% { background-color: transparent; } } .animate-flash-new { animation: flash-new 1s ease-out forwards; }`}</style>

            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--sidebar-background)] shrink-0">
                <div className="text-sm font-medium text-[var(--app-foreground)] flex items-center gap-2">
                    {isConnected ? <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" /> : <div className="w-2 h-2 rounded-full bg-red-500" />}
                    <span className="opacity-80">Monitor: </span>
                    <span className="text-blue-400 font-bold">{(config as MonitorSessionConfig).virtualSerialPort}</span>
                    <span className="text-gray-600 px-1">⟷</span>
                    <span className="text-emerald-400 font-bold">{(config as MonitorSessionConfig).connection?.path || 'No Device'}</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center border border-[var(--widget-border-color)] rounded-[3px] divide-x divide-[var(--widget-border-color)] overflow-hidden h-[26px] bg-[rgba(128,128,128,0.1)]">
                        <div className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-sm' : 'hover:bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)] bg-transparent'}`} onClick={() => { const m = filterMode === 'tx' ? 'all' : 'tx'; setFilterMode(m); saveUIState({ filterMode: m }); }}>
                            <span className="text-[11px] font-bold font-mono opacity-70">{(config as MonitorSessionConfig).virtualSerialPort}:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{txBytes.toLocaleString()}</span>
                        </div>
                        <div className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-emerald-500 text-white shadow-sm' : 'hover:bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)] bg-transparent'}`} onClick={() => { const m = filterMode === 'rx' ? 'all' : 'rx'; setFilterMode(m); saveUIState({ filterMode: m }); }}>
                            <span className="text-[11px] font-bold font-mono opacity-70">{(config as MonitorSessionConfig).connection?.path || 'DEV'}:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{rxBytes.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-0.5 p-0.5 rounded-[3px] border border-[var(--widget-border-color)] bg-[rgba(128,128,128,0.1)] h-[26px]">
                            <button
                                className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === 'hex' || viewMode === 'both' ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-sm' : 'text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)]'}`}
                                onClick={() => {
                                    if (viewMode === 'hex') return;
                                    const newMode = viewMode === 'both' ? 'text' : 'both';
                                    setViewMode(newMode);
                                    saveUIState({ viewMode: newMode });
                                }}
                            >
                                HEX
                            </button>
                            <button
                                className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === 'text' || viewMode === 'both' ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-sm' : 'text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)]'}`}
                                onClick={() => {
                                    if (viewMode === 'text') return;
                                    const newMode = viewMode === 'both' ? 'hex' : 'both';
                                    setViewMode(newMode);
                                    saveUIState({ viewMode: newMode });
                                }}
                            >
                                TXT
                            </button>
                        </div>

                        <div className="relative">
                            <button className={`h-[26px] px-2 hover:bg-[var(--button-secondary-hover-background)] rounded-[3px] text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)]' : ''}`} onClick={() => setShowOptionsMenu(!showOptionsMenu)}>
                                <Menu size={14} /> <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                            </button>
                            {showOptionsMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded-[3px] shadow-2xl p-3 z-50 min-w-[260px]">
                                        <div className="flex items-center justify-between mb-4 pb-1 border-b border-[var(--menu-border-color)]">
                                            <div className="text-[12px] text-[var(--app-foreground)] font-bold">{t('monitor.logSettings')}</div>
                                            <X size={14} className="cursor-pointer text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)]" onClick={() => setShowOptionsMenu(false)} />
                                        </div>
                                        <div className="space-y-4 px-1">
                                            <div className="space-y-2.5">
                                                <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.display')}</div>
                                                <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2 hidden">{t('monitor.encoding')}</div>
                                                <CustomSelect items={[{ label: 'UTF-8', value: 'utf-8' }, { label: 'GBK', value: 'gbk' }, { label: 'ASCII', value: 'ascii' }]} value={encoding} onChange={(val) => { setEncoding(val as any); saveUIState({ encoding: val }); }} />
                                                <Switch label={t('monitor.timestamp')} checked={showTimestamp} onChange={val => { setShowTimestamp(val); saveUIState({ showTimestamp: val }); }} />
                                                <Switch label={t('monitor.packetType')} checked={showPacketType} onChange={val => { setShowPacketType(val); saveUIState({ showPacketType: val }); }} />
                                                <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={val => { setShowDataLength(val); saveUIState({ showDataLength: val }); }} />
                                                <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={val => { setMergeRepeats(val); saveUIState({ mergeRepeats: val }); }} />
                                                <Switch label={t('monitor.flashNewMessage')} checked={flashNewMessage} onChange={val => { setFlashNewMessage(val); saveUIState({ flashNewMessage: val }); }} />

                                                <div className="pt-2 mt-2 border-t border-[var(--menu-border-color)]">
                                                    <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.typography')}</div>
                                                    <div className="flex flex-col gap-2">
                                                        <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('monitor.fontFamily')}:</span>
                                                        <CustomSelect
                                                            items={availableFonts}
                                                            value={fontFamily}
                                                            onChange={(val) => { setFontFamily(val as any); saveUIState({ fontFamily: val }); }}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2 mt-2">
                                                        <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('monitor.fontSize')}:</span>
                                                        <CustomSelect
                                                            items={[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map(size => ({
                                                                label: `${size}px`,
                                                                value: size.toString()
                                                            }))}
                                                            value={fontSize.toString()}
                                                            onChange={(val) => { const size = Number(val); setFontSize(size); saveUIState({ fontSize: size }); }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-2 border-t border-[var(--menu-border-color)]">
                                                <button className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[var(--button-background)] text-[var(--button-foreground)] text-[11px] rounded hover:bg-[var(--button-hover-background)] transition-colors" onClick={() => { handleSaveLogs(); setShowOptionsMenu(false); }}>
                                                    <Download size={14} /> {t('monitor.exportLog')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <button
                            className={`w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors ${autoScroll ? 'text-[var(--button-foreground)] bg-[var(--button-background)] shadow-sm' : 'text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)] bg-[rgba(128,128,128,0.1)] border border-[var(--widget-border-color)]'}`}
                            onClick={() => {
                                const newState = !autoScroll;
                                setAutoScroll(newState);
                                saveUIState({ autoScroll: newState });
                                // If enabling, scroll to bottom immediately
                                if (newState && scrollRef.current) {
                                    requestAnimationFrame(() => {
                                        if (scrollRef.current) {
                                            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                                        }
                                    });
                                }
                            }}
                            title={`Auto Scroll: ${autoScroll ? 'On' : 'Off'}`}
                        >
                            <ArrowDownToLine size={14} />
                        </button>
                        <button className="w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)] bg-[rgba(128,128,128,0.1)] border border-[var(--widget-border-color)]" onClick={handleClearLogs}><Trash2 size={14} /></button>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isConnected && !partnerConnected && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-amber-600/20 border-b border-amber-600/30">
                        <div className="px-4 py-2 flex items-center justify-between gap-3 text-amber-400 text-xs">
                            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /><span>{t('monitor.partnerNotOpen', { port: (config as MonitorSessionConfig).virtualSerialPort })}</span></div>
                            <button className="px-2 py-1 bg-amber-600/30 rounded text-amber-200 text-[10px]" onClick={() => { setSendTarget('physical'); saveUIState({ sendTarget: 'physical' }); }}>{t('monitor.switchPhysical')}</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex-1 relative overflow-hidden">
                <div className="absolute top-4 right-4 z-10">
                    <LogSearch
                        isOpen={searchOpen}
                        onToggle={handleToggleSearch}
                        query={query}
                        isRegex={isRegex}
                        isMatchCase={matchCase}
                        onQueryChange={handleQueryChange}
                        onRegexChange={handleRegexChange}
                        onMatchCaseChange={handleMatchCaseChange}
                        onNext={nextMatch}
                        onPrev={prevMatch}
                        logs={logs}
                        currentIndex={currentIndex}
                        totalMatches={matches.length}
                        viewMode={viewMode}
                        formatData={formatData as any}
                        encoding={encoding}
                        regexError={regexError}
                    />
                </div>
                <div className="absolute inset-0 overflow-auto p-4" ref={scrollRef} onScroll={(e) => { if (!autoScroll) scrollPositions.set(session.id, e.currentTarget.scrollTop); }} style={{ fontSize: fontSize ? `${fontSize}px` : 'var(--st-font-size)', fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)'), lineHeight: `${Math.floor(fontSize * 1.5)}px` }}>
                    {filteredLogs.map((log, index) => {
                        const isNewLog = flashNewMessage && (index >= initialLogCountRef.current || log.timestamp > mountTimeRef.current);
                        const virtualSerPort = (config as MonitorSessionConfig).virtualSerialPort;
                        const physPort = (config as MonitorSessionConfig).connection?.path || 'DEV';

                        return (
                            <LogItem
                                key={`${log.id}-${log.repeatCount || 1}`}
                                log={log}
                                isNewLog={isNewLog}
                                viewMode={viewMode}
                                encoding={encoding}
                                showTimestamp={showTimestamp}
                                showPacketType={showPacketType}
                                showDataLength={showDataLength}
                                virtualSerialPort={virtualSerPort}
                                physicalPortPath={physPort}
                                onContextMenu={handleLogContextMenu}
                                formatData={formatData}
                                formatTimestamp={formatTimestamp}
                                getDataLengthText={getDataLengthText}
                                timestampFormat={themeConfig.timestampFormat}
                                matches={matches}
                                activeMatch={activeMatch}
                                mergeRepeats={mergeRepeats}
                                flashNewMessage={flashNewMessage}
                                fontSize={fontSize}
                            />
                        );
                    })}
                </div>

            </div>

            <div className="bg-[var(--app-background)] border-t border-[var(--border-color)]">
                <div className="flex items-center bg-[var(--widget-background)]/30 px-3 py-1 border-y border-white/5 gap-2">
                    <button onClick={() => { setSendTarget('virtual'); saveUIState({ sendTarget: 'virtual' }); }} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'virtual' ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-md' : 'bg-[var(--button-secondary-background)] text-gray-400 hover:text-gray-200 hover:bg-[var(--button-secondary-hover-background)]'}`}>{t('monitor.virtual')}: {(config as MonitorSessionConfig).virtualSerialPort}</button>
                    <button onClick={() => { setSendTarget('physical'); saveUIState({ sendTarget: 'physical' }); }} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'physical' ? 'bg-emerald-500 text-teal-950 shadow-md' : 'bg-[var(--button-secondary-background)] text-gray-400 hover:text-gray-200 hover:bg-[var(--button-secondary-hover-background)]'}`}>{t('monitor.physical')}: {(config as MonitorSessionConfig).connection?.path || t('monitor.unconnected')}</button>
                </div>
                <SerialInput key={session.id} onSend={handleSend} initialContent={uiState.inputContent} initialHTML={uiState.inputHTML} initialTokens={uiState.inputTokens} initialMode={uiState.inputMode || 'hex'} initialLineEnding={uiState.lineEnding ?? ''} initialTimerInterval={uiState.inputTimerInterval} onStateChange={handleInputStateChange} isConnected={isConnected} fontSize={fontSize} fontFamily={fontFamily} onConnectRequest={onConnectRequest} />
            </div>

            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: t('common.copy'), icon: <Copy size={13} />, onClick: () => handleCopyLog(contextMenu.log) }, { label: t('common.addCommand'), icon: <FileText size={13} />, onClick: () => handleAddToCommand(contextMenu.log) }]} />}
            {showCommandEditor && <CommandEditorDialog item={{ id: 'new', type: 'command', ...showCommandEditor }} onClose={() => setShowCommandEditor(null)} onSave={handleSaveCommand} existingNames={commands.filter(c => !c.parentId).map(c => c.name)} />}
        </div >
    );
};
