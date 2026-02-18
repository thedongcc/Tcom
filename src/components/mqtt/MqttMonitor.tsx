import { MqttSessionConfig, LogEntry } from '../../types/session';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Send, Trash2, ArrowDownToLine, Menu, X, ChevronDown, Download, Settings, RefreshCw, Check, Filter } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { AnimatePresence, motion } from 'framer-motion';
import { mqttTopicMatch } from '../../utils/mqttUtils';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { LogSearch, useLogSearch } from '../common/LogSearch';
import { useI18n } from '../../context/I18nContext';

interface MqttMonitorProps {
    session: {
        id: string;
        config: MqttSessionConfig;
        isConnected: boolean;
        isConnecting: boolean;
        logs: LogEntry[];
    };
    onShowSettings?: (view: string) => void;
    onPublish: (topic: string, payload: string | Uint8Array, qos: 0 | 1 | 2, retain: boolean) => void;
    onUpdateConfig?: (updates: Partial<MqttSessionConfig>) => void;
    onClearLogs?: () => void;
    onConnectRequest?: () => Promise<boolean>;
}

const defaultFonts = [
    { label: 'Monospace (Default)', value: 'mono' },
    { label: 'JetBrains Mono (Built-in)', value: 'JetBrains Mono' },
    { label: 'Consolas', value: 'consolas' },
    { label: 'Courier New', value: 'Courier New' },
    { label: 'Microsoft YaHei UI', value: 'Microsoft YaHei UI' },
    { label: 'Segoe UI', value: 'Segoe UI' },
    { label: 'Inter', value: 'Inter' },
];

export const MqttMonitor = ({ session, onShowSettings, onPublish, onUpdateConfig, onClearLogs, onConnectRequest }: MqttMonitorProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { t } = useI18n();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const mountTimeRef = useRef(Date.now());

    // UI States
    const uiState = config.uiState || {};
    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'json'>(uiState.viewMode || 'text');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [smoothScroll, setSmoothScroll] = useState(uiState.smoothScroll !== undefined ? uiState.smoothScroll : false);
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || 13);
    const [fontFamily, setFontFamily] = useState<string>(uiState.fontFamily || 'mono');
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [showAllFonts, setShowAllFonts] = useState(uiState.showAllFonts || false);
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    // Search State
    const [searchOpen, setSearchOpen] = useState(uiState.searchOpen || false);

    // Publish Area State
    const [topic, setTopic] = useState('test/topic');
    const [payload, setPayload] = useState('{"msg": "hello"}');
    const [qos, setQos] = useState<0 | 1 | 2>(0);
    const [retain, setRetain] = useState(false);
    const [publishFormat, setPublishFormat] = useState<'text' | 'hex' | 'json'>('text');

    // --- Core Logic ---

    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex' | 'json') => {
        if (mode === 'hex') {
            const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
            return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }
        if (mode === 'json') {
            try {
                const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
                const obj = JSON.parse(str);
                return JSON.stringify(obj, null, 2);
            } catch { /* fallback */ }
        }
        if (typeof data === 'string') return data;
        try {
            return new TextDecoder().decode(data);
        } catch {
            return `[Binary ${data.length} bytes]`;
        }
    }, []);

    const saveUIState = useCallback((updates: any) => {
        if (!onUpdateConfig) return;
        const currentUI = config.uiState || {};
        onUpdateConfig({
            uiState: {
                ...currentUI,
                viewMode, showTimestamp, showDataLength, autoScroll, smoothScroll,
                fontSize, fontFamily, mergeRepeats, filterMode,
                ...updates,  // updates 最后展开，确保新值不被旧 state 覆盖
            }
        });
    }, [onUpdateConfig, config.uiState, viewMode, showTimestamp, showDataLength, autoScroll, smoothScroll, fontSize, fontFamily, mergeRepeats, filterMode]);

    // Search Hook
    const {
        query, setQuery, isRegex, setIsRegex, matches, currentIndex, nextMatch, prevMatch
    } = useLogSearch(logs, uiState.searchQuery || '', uiState.searchRegex || false, viewMode, formatData, 'utf-8');
    const activeMatch = matches[currentIndex];

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        saveUIState({ searchQuery: newQuery });
    };

    const handleRegexChange = (newRegex: boolean) => {
        setIsRegex(newRegex);
        saveUIState({ searchRegex: newRegex });
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

    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeMatch]);

    // System Fonts
    useEffect(() => {
        // @ts-ignore
        if (showAllFonts && window.queryLocalFonts) {
            // @ts-ignore
            window.queryLocalFonts().then((fonts: any[]) => {
                const uniqueFonts = Array.from(new Set(fonts.map((f: any) => f.fullName)))
                    .map(name => fonts.find((f: any) => f.fullName === name))
                    .sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));
                setAvailableFonts(uniqueFonts);
            });
        }
    }, [showAllFonts]);

    // --- Render Helpers ---

    const formatTimestamp = (ts: number) => {
        const date = new Date(ts);
        const fmt = themeConfig.timestampFormat || 'HH:mm:ss.SSS';
        const pad = (n: number, w: number = 2) => n.toString().padStart(w, '0');
        return fmt
            .replace('HH', pad(date.getHours()))
            .replace('mm', pad(date.getMinutes()))
            .replace('ss', pad(date.getSeconds()))
            .replace('SSS', pad(date.getMilliseconds(), 3));
    };

    const getDataLengthText = (data: string | Uint8Array) => {
        const length = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
        return `[${length}B]`;
    };

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
                    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[\[\]{}:,])/g, (match) => {
                        let cls = 'color: #d4d4d4;';
                        if (/^"/.test(match)) {
                            cls = /:$/.test(match) ? 'color: #9cdcfe; font-weight: bold;' : 'color: #ce9178;';
                        } else if (/true|false/.test(match)) cls = 'color: #569cd6; font-weight: bold;';
                        else if (/null/.test(match)) cls = 'color: #569cd6; font-weight: bold;';
                        else if (/^-?\d/.test(match)) cls = 'color: #b5cea8;';
                        else if (/[\[\]{}:,]/.test(match)) cls = 'color: #ffd700; font-weight: bold;';
                        return `<span style="${cls}">${match}</span>`;
                    });
                return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
            } catch { /* fallback to text */ }
        }
        return renderHighlightedText(log, formatData(data, viewMode));
    };

    // --- Handlers ---

    const handleSend = async () => {
        if (!isConnected && onConnectRequest) {
            const success = await onConnectRequest();
            if (!success) {
                onShowSettings?.('connection');
                return;
            }
        }
        if (!topic) {
            showToast(t('toast.topicRequired'), 'error');
            return;
        }
        let data: string | Uint8Array = payload;
        if (publishFormat === 'hex') {
            const cleanHex = payload.replace(/\s+/g, '');
            if (cleanHex.length % 2 !== 0) {
                showToast(t('toast.invalidHex'), 'error');
                return;
            }
            data = new Uint8Array(cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        }
        onPublish(topic, data, qos, retain);
    };

    const handleSaveLogs = () => {
        const content = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            return `[${timestamp}][${log.type}] ${log.topic ? `[${log.topic}] ` : ''}${formatData(log.data, viewMode)}`;
        }).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mqtt_log_${Date.now()}.txt`;
        a.click();
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (log.type === 'INFO' || log.type === 'ERROR') return true;
            if (filterMode === 'tx' && log.type !== 'TX') return false;
            if (filterMode === 'rx' && log.type !== 'RX') return false;
            if (log.topic && (log.type === 'RX' || log.type === 'TX')) {
                const topicConfigs = config.topics || [];
                if (topicConfigs.length > 0) {
                    const matches = topicConfigs.filter(t => mqttTopicMatch(t.path, log.topic!));
                    if (matches.length > 0) return matches.some(m => m.subscribed);
                }
            }
            return true;
        });
    }, [logs, filterMode, config.topics]);

    // Auto-scroll effect
    useEffect(() => {
        if (scrollRef.current && autoScroll) {
            requestAnimationFrame(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            });
        }
    }, [logs, autoScroll, filterMode]);

    return (
        <div className="absolute inset-0 flex flex-col bg-[#1e1e1e] select-none">
            <style>{`
                @keyframes flash-new { 
                    0% { background-color: rgba(30, 255, 0, 0.2); } 
                    100% { background-color: #2d2d2d; } 
                } 
                .animate-flash-new { 
                    animation: flash-new 1s ease-out forwards; 
                }
            `}</style>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2b2b2b] bg-[#252526] shrink-0">
                <div className="text-sm font-medium text-[#cccccc] flex items-center gap-2">
                    {isConnected ? (
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                    )}
                    {config.host}:{config.port}
                </div>

                <div className="flex items-center gap-4">
                    {/* Stats */}
                    <div className="flex items-center bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm divide-x divide-[#3c3c3c] overflow-hidden">
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer ${filterMode === 'rx' ? 'bg-[#4ec9b0] text-[#1e1e1e]' : 'hover:bg-[#2a2d2e]'}`}
                            onClick={() => { const m = filterMode === 'rx' ? 'all' : 'rx'; setFilterMode(m); saveUIState({ filterMode: m }); }}
                        >
                            <span className="text-[11px] font-mono">R:</span>
                            <span className="text-[11px] font-mono tabular-nums">
                                {logs.filter(l => l.type === 'RX').reduce((s, l) => s + (typeof l.data === 'string' ? l.data.length : l.data.length), 0).toLocaleString()}
                            </span>
                        </div>
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer ${filterMode === 'tx' ? 'bg-[#007acc] text-white' : 'hover:bg-[#2a2d2e]'}`}
                            onClick={() => { const m = filterMode === 'tx' ? 'all' : 'tx'; setFilterMode(m); saveUIState({ filterMode: m }); }}
                        >
                            <span className="text-[11px] font-mono">T:</span>
                            <span className="text-[11px] font-mono tabular-nums">
                                {logs.filter(l => l.type === 'TX').reduce((s, l) => s + (typeof l.data === 'string' ? l.data.length : l.data.length), 0).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* View Modes */}
                    <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded border border-[#3c3c3c] h-7">
                        {(['text', 'hex', 'json'] as const).map(m => (
                            <button
                                key={m}
                                className={`px-2.5 h-full text-[10px] font-medium rounded-[2px] uppercase ${viewMode === m ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc]'}`}
                                onClick={() => { setViewMode(m); saveUIState({ viewMode: m }); }}
                            >
                                {m}
                            </button>
                        ))}
                    </div>


                    {/* Options */}
                    <div className="relative">
                        <button
                            className={`h-8 px-2 hover:bg-[#3c3c3c] rounded text-[#969696] flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[#3c3c3c] text-white' : ''}`}
                            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                        >
                            <Menu size={16} />
                            <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                        </button>
                        {showOptionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 bg-[#2b2d2e] border border-[#3c3c3c] rounded-[3px] shadow-2xl p-3 z-50 min-w-[240px]">
                                    <div className="text-[12px] text-[#cccccc] font-bold mb-4 pb-1 border-b border-[#3c3c3c]">{t('monitor.logSettings')}</div>
                                    <div className="space-y-4 px-1">
                                        <div className="space-y-2.5">
                                            <div className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-2">{t('monitor.display')}</div>
                                            <Switch label={t('monitor.smoothAnimation')} checked={smoothScroll} onChange={val => { setSmoothScroll(val); saveUIState({ smoothScroll: val }); }} />
                                            <Switch label={t('monitor.timestamp')} checked={showTimestamp} onChange={val => { setShowTimestamp(val); saveUIState({ showTimestamp: val }); }} />
                                            <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={val => { setShowDataLength(val); saveUIState({ showDataLength: val }); }} />
                                            <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={val => { setMergeRepeats(val); saveUIState({ mergeRepeats: val }); }} />

                                            <div className="pt-2 mt-2 border-t border-[#3c3c3c]">
                                                <div className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-2">{t('monitor.typography')}</div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[#aaaaaa]">{t('monitor.fontFamily')}:</span>
                                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                className="w-3 h-3 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0 focus:ring-offset-0"
                                                                checked={showAllFonts}
                                                                onChange={(e) => { setShowAllFonts(e.target.checked); saveUIState({ showAllFonts: e.target.checked }); }}
                                                            />
                                                            <span className="text-[10px] text-[#888888] group-hover:text-[#cccccc] transition-colors">{t('monitor.systemFonts')}</span>
                                                        </label>
                                                    </div>
                                                    <CustomSelect
                                                        items={[
                                                            ...defaultFonts,
                                                            ...(showAllFonts ? availableFonts.map(f => ({ label: f.fullName, value: f.fullName })) : [])
                                                        ]}
                                                        value={fontFamily}
                                                        onChange={(val) => { setFontFamily(val); saveUIState({ fontFamily: val }); }}
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

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <button className={`p-1 rounded ${autoScroll ? 'text-[#4ec9b0]' : 'text-[#969696]'}`} onClick={() => { setAutoScroll(!autoScroll); saveUIState({ autoScroll: !autoScroll }); }}>
                            <ArrowDownToLine size={14} />
                        </button>
                        <button className="p-1 text-[#969696] hover:text-[#cccccc]" onClick={() => onClearLogs?.()}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Logs Area */}
            <div className="flex-1 relative overflow-hidden">
                <div className="absolute top-4 right-4 z-10">
                    <LogSearch
                        isOpen={searchOpen}
                        onToggle={handleToggleSearch}
                        query={query}
                        isRegex={isRegex}
                        onQueryChange={handleQueryChange}
                        onRegexChange={handleRegexChange}
                        onNext={nextMatch}
                        onPrev={prevMatch}
                        logs={logs}
                        currentIndex={currentIndex}
                        totalMatches={matches.length}
                        viewMode={viewMode}
                        formatData={formatData}
                        encoding="utf-8"
                    />
                </div>
                <div
                    className="absolute inset-0 overflow-auto p-2 flex flex-col gap-1.5 select-text"
                    ref={scrollRef}
                    style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily, lineHeight: '1.4' }}
                >
                    {filteredLogs.slice(-100).map((log) => {
                        const isTX = log.type === 'TX';
                        const isNewLog = log.timestamp > mountTimeRef.current;
                        const topicColor = (config.topics || []).find(t => t.path === log.topic)?.color || (isTX ? '#007acc' : '#4ec9b0');

                        if (log.type === 'INFO' || log.type === 'ERROR' || !log.topic) {
                            return (
                                <div key={log.id} className="flex justify-center my-1">
                                    <span className={`px-4 py-0.5 rounded-full text-[10px] border ${log.type === 'ERROR' ? 'bg-red-900/20 text-red-400 border-red-500/30' : 'bg-gray-800/40 text-gray-400 border-gray-600/30'}`}>
                                        {formatData(log.data, 'text')}
                                    </span>
                                </div>
                            );
                        }

                        return (
                            <motion.div
                                key={log.id}
                                id={`log-${log.id}`}
                                initial={smoothScroll && isNewLog ? { opacity: 0, y: 10 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex w-full ${isTX ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    key={`${log.id}-${log.repeatCount || 1}`}
                                    className={`relative max-w-[90%] rounded-lg px-3 py-1.5 border shadow-sm ${isTX ? 'rounded-br-sm' : 'rounded-bl-sm'} ${(isNewLog || (log.repeatCount && log.repeatCount > 1)) ? 'animate-flash-new' : 'bg-[#2d2d2d]'} ${activeMatch?.logId === log.id ? 'ring-1 ring-[#ff9632]' : ''}`}
                                    style={{ borderColor: topicColor + '50' }}
                                >
                                    <div className={`flex items-baseline gap-2 mb-1 opacity-80 text-[0.85em] font-mono ${isTX ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {showTimestamp && <span>[{formatTimestamp(log.timestamp)}]</span>}
                                        <span className="px-1.5 rounded-[3px] border border-current opacity-90 text-[0.9em]" style={{ color: topicColor, borderColor: topicColor }}>{log.topic}</span>
                                        {showDataLength && (
                                            <span className="text-[0.85em] opacity-70">
                                                {getDataLengthText(log.data)}
                                            </span>
                                        )}
                                        {mergeRepeats && log.repeatCount && log.repeatCount > 1 && <span className="text-[#FFD700]">x{log.repeatCount}</span>}
                                    </div>
                                    <div className={`whitespace-pre-wrap break-all font-mono ${isTX ? 'text-[#e0e0e0]' : 'text-[#ce9178]'}`}>
                                        {renderPayload(log)}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Publish Area */}
            <div className="border-t border-[#2b2b2b] bg-[#252526] p-2 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#3c3c3c] rounded px-2 py-1 flex-1">
                        <span className="text-[#969696] text-[10px]">Topic</span>
                        <input className="bg-transparent border-none outline-none text-[#cccccc] text-[11px] flex-1 font-mono" value={topic} onChange={e => setTopic(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-[#969696] text-[10px]">QoS</span>
                        <select className="bg-[#3c3c3c] text-[#cccccc] text-[11px] p-0.5 rounded outline-none" value={qos} onChange={e => setQos(Number(e.target.value) as 0 | 1 | 2)}>
                            <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
                        </select>
                    </div>
                    <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={retain} onChange={e => setRetain(e.target.checked)} />
                        <span className="text-[#969696] text-[10px]">Retain</span>
                    </label>
                </div>
                <div className="flex gap-2 h-16">
                    <div className="flex flex-col gap-0.5 bg-[#1e1e1e] rounded p-0.5 border border-[#3c3c3c] w-16">
                        {['text', 'json', 'hex'].map(f => (
                            <div key={f} className={`text-[9px] text-center cursor-pointer py-0.5 rounded uppercase ${publishFormat === f ? 'bg-[#007acc] text-white' : 'text-[#969696]'}`} onClick={() => setPublishFormat(f as any)}>{f}</div>
                        ))}
                    </div>
                    <textarea className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc] p-1.5 text-[11px] font-mono outline-none resize-none" value={payload} onChange={e => setPayload(e.target.value)} />
                    <button className={`w-14 flex flex-col items-center justify-center rounded transition-colors ${isConnected ? 'bg-[#0e639c] text-white' : 'bg-[#2d2d2d] text-[#666]'}`} onClick={handleSend} disabled={session.isConnecting}>
                        <Send size={14} /> <span className="text-[9px]">{isConnected ? t('mqtt.command') : t('mqtt.connect')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
