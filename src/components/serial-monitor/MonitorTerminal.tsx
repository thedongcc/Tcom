import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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

interface MonitorTerminalProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onConnectRequest?: () => Promise<boolean>;
}

// Memoized Log Item Component
const LogItem = React.memo(({
    log,
    isNewLog,
    effectiveSmooth,
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
    mergeRepeats = true
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
                    className={isActive ? 'bg-[#ff9632] text-black' : 'bg-[#623315] text-[#ce9178]'}
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

    if (log.type === 'INFO' || log.type === 'ERROR') {
        const content = formatData(log.data, 'text', encoding).trim();
        let style = "bg-gray-800/40 text-gray-400 border-gray-600/30";
        if (log.type === 'ERROR') {
            style = "bg-red-900/40 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]";
        } else if (content.includes('Internal Bridge Port')) {
            style = "bg-blue-600/20 text-blue-400 border-blue-500/30 font-semibold";
        } else if (content.includes('Physical Device')) {
            style = "bg-emerald-600/20 text-emerald-400 border-emerald-500/30 font-semibold";
        } else if (content.includes('Started') || content.includes('Restored') || content.includes('Monitor started')) {
            style = "bg-green-600/20 text-green-400 border-green-500/30 font-bold";
        }
        return (
            <div className="flex justify-center my-2 gap-2 items-center">
                <span className={`px-4 py-1 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 ${style}`}>
                    {content}
                </span>
                {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                    <span className="h-[18px] flex items-center justify-center text-[10px] text-[#FFD700] font-bold font-mono bg-[#FFD700]/10 px-1.5 rounded-full border border-[#FFD700]/30 min-w-[24px]">
                        x{log.repeatCount}
                    </span>
                )}
            </div>
        );
    }

    return (
        <motion.div
            layout={effectiveSmooth ? "position" : undefined}
            initial={effectiveSmooth && isNewLog ? { opacity: 0, x: -10 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className={`flex items-start gap-1.5 mb-1 hover:bg-[#2a2d2e] rounded-sm px-1.5 py-0.5 group relative ${isNewLog ? 'animate-flash-new' : ''} border border-transparent`}
            style={{ fontSize: 'inherit', fontFamily: 'inherit', '--flash-color': 'rgba(0, 122, 204, 0.25)' } as any}
            onContextMenu={(e) => onContextMenu(e, log)}
        >
            {(showTimestamp || (log.repeatCount && log.repeatCount > 1)) && (
                <div className="shrink-0 flex items-center h-[1.6em] gap-1.5">
                    {showTimestamp && (
                        <span className="text-[#999] font-mono opacity-90">
                            [{formatTimestamp(log.timestamp, timestampFormat || 'HH:mm:ss.SSS')}]
                        </span>
                    )}
                    {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                        <span className="h-[18px] flex items-center justify-center text-[11px] text-[#FFD700] font-bold font-mono bg-[#FFD700]/10 px-1.5 rounded-[3px] border border-[#FFD700]/30 min-w-[24px]">
                            x{log.repeatCount}
                        </span>
                    )}
                </div>
            )}
            <div className="flex items-center gap-1.5 shrink-0 h-[1.6em]">
                {showPacketType && (
                    <div className={`h-[18px] flex items-center justify-center font-bold font-mono px-2 rounded-[3px] text-[10px] border shadow-sm
                    ${log.topic === 'virtual' ? 'bg-[#007acc]/20 text-[#4daafc] border-[#007acc]/30' : 'bg-[#4ec9b0]/10 text-[#4ec9b0] border-[#4ec9b0]/30'}`}>
                        {log.type === 'TX' && log.crcStatus === 'none' ? (
                            <span className="flex items-center gap-1">
                                <span className="font-extrabold text-[#79c0ff]">Tcom</span>
                                <span className="opacity-40 text-[8px]">→</span>
                                <span className="opacity-90">{log.topic === 'virtual' ? virtualSerialPort : physicalPortPath}</span>
                            </span>
                        ) : (
                            log.topic === 'virtual' ? (
                                <span className="flex items-center gap-1">
                                    <span className="opacity-70">{virtualSerialPort}</span>
                                    <span className="opacity-40 text-[8px]">→</span>
                                    <span className="font-extrabold">{physicalPortPath}</span>
                                </span>
                            ) : (
                                <span className="flex items-center gap-1">
                                    <span className="font-extrabold">{physicalPortPath}</span>
                                    <span className="opacity-40 text-[8px]">→</span>
                                    <span className="opacity-70">{virtualSerialPort}</span>
                                </span>
                            )
                        )}
                    </div>
                )}
                {showDataLength && (
                    <span className="h-[18px] flex items-center justify-center font-mono px-1.5 rounded-[3px] text-[11px] border border-white/10 bg-white/5 text-[#aaaaaa]">
                        {getDataLengthText(log.data)}
                    </span>
                )}
            </div>
            <span className={`whitespace-pre-wrap break-all select-text cursor-text flex-1 ${log.topic === 'virtual' ? 'text-[var(--st-tx-text)]' : 'text-[var(--st-rx-text)]'}`}>
                {renderHighlightedText(log, formatData(log.data, viewMode, encoding))}
            </span>
        </motion.div>
    );
});

export const MonitorTerminal = ({ session, onShowSettings, onConnectRequest }: MonitorTerminalProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { t } = useI18n();
    const sessionManager = useSession();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const mountTimeRef = useRef(Date.now());

    const uiState = (config as any).uiState || {};

    const [viewMode, setViewMode] = useState<'text' | 'hex'>(uiState.viewMode || 'hex');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showPacketType, setShowPacketType] = useState(uiState.showPacketType !== undefined ? uiState.showPacketType : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>(uiState.encoding || 'utf-8');
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || themeConfig.typography.fontSize || 13);

    // Sync fontSize with global theme when not overridden locally
    useEffect(() => {
        if (uiState.fontSize === undefined) {
            setFontSize(themeConfig.typography.fontSize || 13);
        }
    }, [themeConfig.typography.fontSize, uiState.fontSize]);
    const [fontFamily, setFontFamily] = useState<string>(uiState.fontFamily || 'mono');
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [smoothScroll, setSmoothScroll] = useState(uiState.smoothScroll !== undefined ? uiState.smoothScroll : true);
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

    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex', enc: string) => {
        if (mode === 'hex') {
            const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
            return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }
        if (typeof data === 'string') return data;
        try {
            return new TextDecoder(enc).decode(data);
        } catch {
            return new TextDecoder().decode(data);
        }
    }, []);

    const getDataLengthText = useCallback((data: string | Uint8Array) => `[${(typeof data === 'string' ? new TextEncoder().encode(data).length : data.length)}B]`, []);

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

    const prevLogLengthRef = useRef(logs.length);
    useEffect(() => {
        const prevLength = prevLogLengthRef.current;
        prevLogLengthRef.current = logs.length;
        // 只有新增了数据条目时才执行自动滚动
        if (scrollRef.current && autoScroll && logs.length > prevLength) {
            requestAnimationFrame(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            });
        }
    }, [logs.length, autoScroll]);

    const handleClearLogs = () => sessionManager.clearLogs(session.id);

    const txBytes = useMemo(() => logs.reduce((acc, log) => (log.type === 'TX' && log.topic === 'virtual' && log.crcStatus === 'ok' ? acc + ((typeof log.data === 'string' ? new TextEncoder().encode(log.data).length : log.data.length) * (log.repeatCount || 1)) : acc), 0), [logs]);
    const rxBytes = useMemo(() => logs.reduce((acc, log) => (log.type === 'RX' && log.topic === 'physical' && log.crcStatus === 'ok' ? acc + ((typeof log.data === 'string' ? new TextEncoder().encode(log.data).length : log.data.length) * (log.repeatCount || 1)) : acc), 0), [logs]);

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
            lineEnding: state.lineEnding
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
        <div className="absolute inset-0 flex flex-col bg-[var(--st-rx-bg)] bg-cover bg-center select-none" style={{ backgroundImage: 'var(--st-rx-bg-img)' }} onClick={() => setContextMenu(null)}>
            <style>{`@keyframes flash-new { 0% { background-color: var(--flash-color); } 100% { background-color: transparent; } } .animate-flash-new { animation: flash-new 1s ease-out forwards; }`}</style>

            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2b2b2b] bg-[#252526] shrink-0">
                <div className="text-sm font-medium text-[#cccccc] flex items-center gap-2">
                    {isConnected ? <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" /> : <div className="w-2 h-2 rounded-full bg-red-500" />}
                    <span className="opacity-80">Monitor: </span>
                    <span className="text-[#4daafc] font-bold">{(config as MonitorSessionConfig).virtualSerialPort}</span>
                    <span className="text-gray-600 px-1">⟷</span>
                    <span className="text-[#4ec9b0] font-bold">{(config as MonitorSessionConfig).connection?.path || 'No Device'}</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-[#1e1e1e]/80 border border-[#3c3c3c] rounded-sm divide-x divide-[#3c3c3c] overflow-hidden shadow-inner">
                        <div className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer ${filterMode === 'tx' ? 'bg-[#007acc] text-white' : 'hover:bg-[#2a2d2e]'}`} onClick={() => { const m = filterMode === 'tx' ? 'all' : 'tx'; setFilterMode(m); saveUIState({ filterMode: m }); }}>
                            <span className="text-[9px] font-bold font-mono opacity-80">{(config as MonitorSessionConfig).virtualSerialPort}:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{txBytes.toLocaleString()}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer ${filterMode === 'rx' ? 'bg-[#4ec9b0] text-[#1e1e1e]' : 'hover:bg-[#2a2d2e]'}`} onClick={() => { const m = filterMode === 'rx' ? 'all' : 'rx'; setFilterMode(m); saveUIState({ filterMode: m }); }}>
                            <span className="text-[9px] font-bold font-mono opacity-60">{(config as MonitorSessionConfig).connection?.path || 'DEV'}:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{rxBytes.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded border border-[#3c3c3c] h-[26px]">
                        {(['text', 'hex'] as const).map(m => (
                            <button key={m} className={`px-2.5 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase ${viewMode === m ? 'bg-[#007acc] text-white shadow-sm' : 'text-[#969696] hover:text-[#cccccc]'}`} onClick={() => { setViewMode(m); saveUIState({ viewMode: m }); }}>{m === 'text' ? 'TXT' : 'HEX'}</button>
                        ))}
                    </div>


                    <div className="relative">
                        <button className={`h-8 px-2 hover:bg-[#3c3c3c] rounded text-[#969696] flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[#3c3c3c] text-white' : ''}`} onClick={() => setShowOptionsMenu(!showOptionsMenu)}>
                            <Menu size={16} /> <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                        </button>
                        {showOptionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 bg-[#2b2d2e] border border-[#3c3c3c] rounded-[3px] shadow-2xl p-3 z-50 min-w-[260px]">
                                    <div className="flex items-center justify-between mb-4 pb-1 border-b border-[#3c3c3c]">
                                        <div className="text-[12px] text-[#cccccc] font-bold">{t('monitor.logSettings')}</div>
                                        <X size={14} className="cursor-pointer text-[#969696] hover:text-white" onClick={() => setShowOptionsMenu(false)} />
                                    </div>
                                    <div className="space-y-4 px-1">
                                        <div className="space-y-2.5">
                                            <div className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-2">{t('monitor.display')}</div>
                                            <div className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-2 hidden">{t('monitor.encoding')}</div>
                                            <CustomSelect items={[{ label: 'UTF-8', value: 'utf-8' }, { label: 'GBK', value: 'gbk' }, { label: 'ASCII', value: 'ascii' }]} value={encoding} onChange={(val) => { setEncoding(val as any); saveUIState({ encoding: val }); }} />
                                            <Switch label={t('monitor.timestamp')} checked={showTimestamp} onChange={val => { setShowTimestamp(val); saveUIState({ showTimestamp: val }); }} />
                                            <Switch label={t('monitor.packetType')} checked={showPacketType} onChange={val => { setShowPacketType(val); saveUIState({ showPacketType: val }); }} />
                                            <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={val => { setShowDataLength(val); saveUIState({ showDataLength: val }); }} />
                                            <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={val => { setMergeRepeats(val); saveUIState({ mergeRepeats: val }); }} />
                                            <Switch label={t('monitor.smoothAnimation')} checked={smoothScroll} onChange={val => { setSmoothScroll(val); saveUIState({ smoothScroll: val }); }} />

                                            <div className="pt-2 mt-2 border-t border-[#3c3c3c]">
                                                <div className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-2">{t('monitor.typography')}</div>
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[11px] text-[#aaaaaa]">{t('monitor.fontFamily')}:</span>
                                                    <CustomSelect
                                                        items={availableFonts}
                                                        value={fontFamily}
                                                        onChange={(val) => { setFontFamily(val as any); saveUIState({ fontFamily: val }); }}
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2 mt-2">
                                                    <span className="text-[11px] text-[#aaaaaa]">{t('monitor.fontSize')}:</span>
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

                                        <div className="pt-2 border-t border-[#3c3c3c]">
                                            <button className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[#007acc] text-white text-[11px] rounded hover:bg-[#0062a3] transition-colors" onClick={() => { handleSaveLogs(); setShowOptionsMenu(false); }}>
                                                <Download size={14} /> {t('monitor.exportLog')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <button className={`p-1 rounded ${autoScroll ? 'text-[#4ec9b0] bg-[#1e1e1e]' : 'text-[#969696]'}`} onClick={() => { setAutoScroll(!autoScroll); saveUIState({ autoScroll: !autoScroll }); }}>
                            <ArrowDownToLine size={14} />
                        </button>
                        <button className="p-1 text-[#969696] hover:text-[#cccccc]" onClick={handleClearLogs}><Trash2 size={14} /></button>
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
                <div className="absolute inset-0 overflow-auto p-4" ref={scrollRef} style={{ fontSize: fontSize ? `${fontSize}px` : 'var(--st-font-size)', fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : (fontFamily || 'var(--st-font-family)'), lineHeight: 'var(--st-line-height, 1.5)' }}>
                    <AnimatePresence initial={false}>
                        {filteredLogs.slice(-400).map((log) => (
                            <LogItem key={log.id} log={log} isNewLog={log.timestamp > mountTimeRef.current} effectiveSmooth={smoothScroll} viewMode={viewMode} encoding={encoding} showTimestamp={showTimestamp} showPacketType={showPacketType} showDataLength={showDataLength} mergeRepeats={mergeRepeats} virtualSerialPort={(config as MonitorSessionConfig).virtualSerialPort} physicalPortPath={(config as MonitorSessionConfig).connection?.path || 'DEV'} onContextMenu={handleLogContextMenu} formatData={formatData} formatTimestamp={formatTimestamp} getDataLengthText={getDataLengthText} timestampFormat={themeConfig.timestampFormat} matches={matches} activeMatch={activeMatch} />
                        ))}
                    </AnimatePresence>
                </div>

            </div>

            <div className="bg-[#1e1e1e] border-t border-[#2b2b2b]">
                <div className="flex items-center bg-[#2d2d2e]/30 px-3 py-1 border-y border-white/5 gap-2">
                    <button onClick={() => { setSendTarget('virtual'); saveUIState({ sendTarget: 'virtual' }); }} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'virtual' ? 'bg-[#007acc] text-white shadow-md' : 'bg-[#292929] text-gray-400 hover:text-gray-200 hover:bg-[#4a4a4a]'}`}>{t('monitor.virtual')}: {(config as MonitorSessionConfig).virtualSerialPort}</button>
                    <button onClick={() => { setSendTarget('physical'); saveUIState({ sendTarget: 'physical' }); }} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'physical' ? 'bg-[#4ec9b0] text-[#0a2e26] shadow-md' : 'bg-[#292929] text-gray-400 hover:text-gray-200 hover:bg-[#4a4a4a]'}`}>{t('monitor.physical')}: {(config as MonitorSessionConfig).connection?.path || t('monitor.unconnected')}</button>
                </div>
                <SerialInput key={session.id} onSend={handleSend} initialContent={uiState.inputContent} initialHTML={uiState.inputHTML} initialTokens={uiState.inputTokens} initialMode={uiState.inputMode || 'hex'} initialLineEnding={uiState.lineEnding || '\r\n'} onStateChange={handleInputStateChange} isConnected={isConnected} fontSize={fontSize} fontFamily={fontFamily} onConnectRequest={onConnectRequest} />
            </div>

            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: t('common.copy'), icon: <Copy size={13} />, onClick: () => handleCopyLog(contextMenu.log) }, { label: t('common.addCommand'), icon: <FileText size={13} />, onClick: () => handleAddToCommand(contextMenu.log) }]} />}
            {showCommandEditor && <CommandEditorDialog item={{ id: 'new', type: 'command', ...showCommandEditor }} onClose={() => setShowCommandEditor(null)} onSave={handleSaveCommand} existingNames={commands.filter(c => !c.parentId).map(c => c.name)} />}
        </div >
    );
};
