import { MqttSessionConfig, LogEntry } from '../../types/session';
import { useRef, useEffect, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { Send, Trash2, ArrowDownToLine, Menu, X, ChevronDown, Download, Settings, RefreshCw, Check, Filter } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { AnimatePresence, motion } from 'framer-motion';
import { mqttTopicMatch } from '../../utils/mqttUtils';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { LogSearch, useLogSearch } from '../common/LogSearch';
import { useI18n } from '../../context/I18nContext';
import { useSystemMessage } from '../../hooks/useSystemMessage';
import { Tooltip } from '../common/Tooltip';

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

const scrollPositions = new Map<string, number>();

export const MqttMonitor = ({ session, onShowSettings, onPublish, onUpdateConfig, onClearLogs, onConnectRequest }: MqttMonitorProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { t } = useI18n();
    const { parseSystemMessage } = useSystemMessage();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const topicDropdownRef = useRef<HTMLDivElement>(null);
    const uiState = config.uiState || {};
    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'json'>(uiState.viewMode || 'text');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [flashNewMessage, setFlashNewMessage] = useState(uiState.flashNewMessage !== false);
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || 15);
    const [fontFamily, setFontFamily] = useState<string>(uiState.fontFamily || 'AppCoreFont');
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
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
                    { label: '-- Built-in --', value: 'header-built-in', disabled: true },
                    ...builtIn,
                    ...(mono.length > 0 ? [{ label: '-- Monospaced --', value: 'header-mono', disabled: true }, ...mono] : []),
                    ...(prop.length > 0 ? [{ label: '-- Proportional --', value: 'header-prop', disabled: true }, ...prop] : [])
                ];
                setAvailableFonts(final);
            });
        }
    }, []);

    // Publish Area State（从 uiState 恢复持久化数据）
    const [topic, setTopic] = useState(uiState.publishTopic || '');
    const [payload, setPayload] = useState(uiState.publishPayload || '{"msg": "hello"}');
    const [qos, setQos] = useState<0 | 1 | 2>(0);
    const [retain, setRetain] = useState(false);
    const [publishFormat, setPublishFormat] = useState<'text' | 'hex' | 'json' | 'base64'>(uiState.publishFormat || 'text');
    const [showTopicDropdown, setShowTopicDropdown] = useState(false);

    // --- Core Logic ---

    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex' | 'json' | 'base64') => {
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
        if (mode === 'base64') {
            try {
                const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
                const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
                return btoa(binString);
            } catch { return '[Base64 Error]'; }
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
                viewMode, showTimestamp, showDataLength, autoScroll, flashNewMessage,
                fontSize, fontFamily, mergeRepeats, filterMode,
                ...updates,  // updates 最后展开，确保新值不被旧 state 覆盖
            }
        });
    }, [onUpdateConfig, config.uiState, viewMode, showTimestamp, showDataLength, autoScroll, flashNewMessage, fontSize, fontFamily, mergeRepeats, filterMode]);

    // 已订阅的主题列表，供发送区下拉选择
    const subscribedTopics = useMemo(() =>
        (config.topics || []).filter((t: any) => t.subscribed),
        [config.topics]
    );

    // Search Hook
    const {
        query, setQuery, isRegex, setIsRegex, matchCase, setMatchCase, matches, currentIndex, nextMatch, prevMatch, regexError, activeMatchRev
    } = useLogSearch(logs, uiState.searchOpen ? (uiState.searchQuery || '') : '', uiState.searchRegex || false, uiState.searchMatchCase || false, viewMode, formatData, 'utf-8');
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

    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }, [activeMatchRev]);

    // 新消息闪烁所需的历史记录屏障
    const initialLogCountRef = useRef(logs.length);
    const mountTimeRef = useRef(Date.now());

    useEffect(() => {
        // 重置 mountTime 仅在初次挂载时
        mountTimeRef.current = Date.now();
        initialLogCountRef.current = logs.length;
    }, []);

    // Topic 下拉框点击外部关闭
    useEffect(() => {
        if (!showTopicDropdown) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (topicDropdownRef.current && !topicDropdownRef.current.contains(e.target as Node)) {
                setShowTopicDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showTopicDropdown]);


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
        return `${length}B`;
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
                        let cls = 'color: var(--st-json-punctuation);';
                        if (/^"/.test(match)) {
                            cls = /:$/.test(match) ? 'color: var(--st-json-key); font-weight: bold;' : 'color: var(--st-json-string);';
                        } else if (/true|false/.test(match)) cls = 'color: var(--st-json-boolean); font-weight: bold;';
                        else if (/null/.test(match)) cls = 'color: var(--st-json-null); font-weight: bold;';
                        else if (/^-?\d/.test(match)) cls = 'color: var(--st-json-number);';
                        else if (/[\[\]{}:,]/.test(match)) cls = 'color: var(--st-json-punctuation); font-weight: bold;';
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
        } else if (publishFormat === 'base64') {
            try {
                const binaryStr = atob(payload.trim());
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                data = bytes;
            } catch {
                showToast('Invalid Base64', 'error');
                return;
            }
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
        if (!scrollRef.current) return;
        const observer = new ResizeObserver(() => {
            if (scrollRef.current && scrollRef.current.clientHeight > 0) {
                if (scrollPositions.has(session.id)) {
                    scrollRef.current.scrollTop = scrollPositions.get(session.id)!;
                }
            }
        });
        observer.observe(scrollRef.current);
        return () => observer.disconnect();
    }, [session.id]);

    return (
        <div className="absolute inset-0 flex flex-col bg-[var(--editor-background)] select-none">
            <style>{`
                @keyframes flash-new { 
                    0% { background-color: rgba(30, 255, 0, 0.2); } 
                    100% { background-color: var(--input-background); } 
                } 
                .animate-flash-new { 
                    animation: flash-new 1s ease-out forwards; 
                }
            `}</style>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--sidebar-background)] shrink-0">
                <div className="text-sm font-medium text-[var(--app-foreground)] flex items-center gap-2">
                    {isConnected ? (
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                    )}
                    {config.host}:{config.port}
                </div>

                <div className="flex items-center gap-4">
                    {/* Stats */}
                    <div className="flex items-center border border-[var(--widget-border-color)] rounded-[3px] divide-x divide-[var(--widget-border-color)] overflow-hidden h-[26px] bg-[rgba(128,128,128,0.1)]">
                        <Tooltip content={filterMode === 'tx' ? t('monitor.cancelFilter') : t('monitor.filterTxOnly')} position="bottom">
                            <div
                                className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-sm' : 'hover:bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)] bg-transparent'}`}
                                onClick={() => { const m = filterMode === 'tx' ? 'all' : 'tx'; setFilterMode(m); saveUIState({ filterMode: m }); }}
                            >
                                <span className="text-[11px] font-bold font-mono opacity-70">T:</span>
                                <span className="text-[11px] font-bold font-mono tabular-nums leading-none">
                                    {logs.filter(l => l.type === 'TX').reduce((s, l) => s + (typeof l.data === 'string' ? l.data.length : l.data.length), 0).toLocaleString()}
                                </span>
                            </div>
                        </Tooltip>
                        <Tooltip content={filterMode === 'rx' ? t('monitor.cancelFilter') : t('monitor.filterRxOnly')} position="bottom">
                            <div
                                className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-emerald-500 text-white shadow-sm' : 'hover:bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)] bg-transparent'}`}
                                onClick={() => { const m = filterMode === 'rx' ? 'all' : 'rx'; setFilterMode(m); saveUIState({ filterMode: m }); }}
                            >
                                <span className="text-[11px] font-bold font-mono opacity-70">R:</span>
                                <span className="text-[11px] font-bold font-mono tabular-nums leading-none">
                                    {logs.filter(l => l.type === 'RX').reduce((s, l) => s + (typeof l.data === 'string' ? l.data.length : l.data.length), 0).toLocaleString()}
                                </span>
                            </div>
                        </Tooltip>
                    </div>

                    {/* Mode Toggle & Options Group */}
                    <div className="flex items-center gap-1.5">
                        {/* View Modes */}
                        <div className="flex items-center gap-0.5 p-0.5 rounded-[3px] border border-[var(--widget-border-color)] bg-[rgba(128,128,128,0.1)] h-[26px]">
                            {(['hex', 'text', 'json', 'base64'] as const).map(m => (
                                <button
                                    key={m}
                                    className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === m ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-sm' : 'text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)]'}`}
                                    onClick={() => { setViewMode(m as any); saveUIState({ viewMode: m }); }}
                                >
                                    {m === 'text' ? 'TXT' : m === 'base64' ? 'B64' : m.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        {/* Options */}
                        <div className="relative">
                            <button
                                className={`h-[26px] px-2 hover:bg-[var(--button-secondary-hover-background)] rounded-[3px] text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)]' : ''}`}
                                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                            >
                                <Menu size={14} />
                                <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                            </button>
                            {showOptionsMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded-[3px] shadow-2xl p-3 z-50 min-w-[240px]">
                                        <div className="text-[12px] text-[var(--app-foreground)] font-bold mb-4 pb-1 border-b border-[var(--menu-border-color)]">{t('monitor.logSettings')}</div>
                                        <div className="space-y-4 px-1">
                                            <div className="space-y-2.5">
                                                <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.display')}</div>
                                                <Switch label={t('monitor.flashNewMessage')} checked={flashNewMessage} onChange={val => { setFlashNewMessage(val); saveUIState({ flashNewMessage: val }); }} />
                                                <Switch label={t('monitor.timestamp')} checked={showTimestamp} onChange={val => { setShowTimestamp(val); saveUIState({ showTimestamp: val }); }} />
                                                <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={val => { setShowDataLength(val); saveUIState({ showDataLength: val }); }} />
                                                <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={val => { setMergeRepeats(val); saveUIState({ mergeRepeats: val }); }} />

                                                <div className="pt-2 mt-2 border-t border-[var(--menu-border-color)]">
                                                    <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.typography')}</div>
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex flex-col gap-2">
                                                            <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('monitor.fontFamily')}:</span>
                                                            <CustomSelect
                                                                items={availableFonts}
                                                                value={fontFamily}
                                                                onChange={(val) => { setFontFamily(val); saveUIState({ fontFamily: val }); }}
                                                            />
                                                        </div>
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

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <Tooltip content={autoScroll ? t('monitor.autoScrollOn') : t('monitor.autoScrollOff')} position="bottom">
                            <button
                                className={`w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors ${autoScroll ? 'text-[var(--button-foreground)] bg-[var(--button-background)] shadow-sm' : 'text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)] bg-[rgba(128,128,128,0.1)] border border-[var(--widget-border-color)]'}`}
                                onClick={() => { setAutoScroll(!autoScroll); saveUIState({ autoScroll: !autoScroll }); }}
                            >
                                <ArrowDownToLine size={14} />
                            </button>
                        </Tooltip>
                        <Tooltip content={t('monitor.clearLogs')} position="bottom">
                            <button
                                className="w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)] bg-[rgba(128,128,128,0.1)] border border-[var(--widget-border-color)]"
                                onClick={() => onClearLogs?.()}
                            >
                                <Trash2 size={14} />
                            </button>
                        </Tooltip>
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
                        formatData={formatData}
                        encoding="utf-8"
                        regexError={regexError}
                    />
                </div>
                <div
                    className="absolute inset-0 overflow-auto p-2 flex flex-col gap-1.5 select-text"
                    ref={scrollRef}
                    onScroll={(e) => scrollPositions.set(session.id, e.currentTarget.scrollTop)}
                    style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)'), lineHeight: '1.5' }}
                >
                    {filteredLogs.map((log, index) => {
                        const isTX = log.type === 'TX';
                        const isNewLog = flashNewMessage && (index >= initialLogCountRef.current || log.timestamp > mountTimeRef.current);
                        const topicColor = (config.topics || []).find(t => t.path === log.topic)?.color || (isTX ? '#007acc' : '#4ec9b0');

                        if (log.type === 'INFO' || log.type === 'ERROR' || !log.topic) {
                            const content = formatData(log.data, 'text').trim();
                            const { styleClass, translatedText } = parseSystemMessage(log.type, content);

                            return (
                                <div key={log.id} className="flex justify-center my-2 gap-2 items-center">
                                    <span className={`px-4 py-1 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 select-text cursor-text ${styleClass}`}>
                                        {translatedText}
                                    </span>
                                    {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                                        <span className="h-[18px] flex items-center justify-center text-[10px] text-[var(--button-background)] font-bold font-mono bg-[var(--button-background)]/10 px-1.5 rounded-full border border-[var(--button-background)]/30 min-w-[24px]">
                                            x{log.repeatCount}
                                        </span>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <div
                                key={log.id}
                                id={`log-${log.id}`}
                                className={`flex w-full ${isTX ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    key={`${log.id}-${log.repeatCount || 1}`}
                                    className={`relative max-w-[90%] rounded-lg px-3 py-1.5 border shadow-sm ${isTX ? 'rounded-br-sm' : 'rounded-bl-sm'} ${((isNewLog || (log.repeatCount && log.repeatCount > 1)) && flashNewMessage && isNewLog) ? 'animate-flash-new' : 'bg-[var(--input-background)]'} ${activeMatch?.logId === log.id ? 'ring-1 ring-[#ff9632]' : ''}`}
                                    style={{ borderColor: topicColor + '50' }}
                                >
                                    <div className={`flex items-center gap-1.5 shrink-0 mb-1 ${isTX ? 'flex-row-reverse' : 'flex-row'}`} style={{ height: `${Math.floor(fontSize * 1.4)}px` }}>
                                        {showTimestamp && (
                                            <span className="text-[#999] font-mono opacity-90 tabular-nums tracking-tight">
                                                [{formatTimestamp(log.timestamp)}]
                                            </span>
                                        )}
                                        <span
                                            className="flex items-center justify-center font-bold font-mono select-none px-[0.4em] rounded-[0.2em] min-w-[2.8em] text-[0.8em] leading-none shadow-sm tracking-wide pt-[1px]"
                                            style={{ color: topicColor, backgroundColor: `${topicColor}20`, border: `1px solid ${topicColor}40`, height: `${Math.floor(fontSize * 1.4)}px` }}
                                        >
                                            {log.topic}
                                        </span>
                                        {showDataLength && (
                                            <span
                                                className="flex items-center justify-center font-mono select-none px-[0.4em] rounded-[0.2em] min-w-[2.8em] text-[0.8em] leading-none shadow-sm border border-white/10 bg-white/5 text-[#aaaaaa] pt-[1px] tabular-nums tracking-tight shrink-0"
                                                style={{ height: `${Math.floor(fontSize * 1.4)}px` }}
                                            >
                                                {getDataLengthText(log.data)}
                                            </span>
                                        )}
                                        {mergeRepeats && log.repeatCount && log.repeatCount > 1 && (
                                            <span
                                                key={log.repeatCount}
                                                className={`flex items-center justify-center text-[0.8em] leading-none text-[#ff9632] font-bold font-mono bg-[#ff9632]/10 px-[0.5em] rounded-[0.2em] border border-[#ff9632]/30 min-w-[1.8em] select-none shrink-0 pt-[1px] tabular-nums tracking-tight ${(isNewLog && flashNewMessage) ? 'animate-flash-gold' : ''}`}
                                                style={{ height: `${Math.floor(fontSize * 1.4)}px` }}
                                            >
                                                x{log.repeatCount}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`whitespace-pre-wrap break-all font-mono ${isTX ? 'text-[#e0e0e0]' : 'text-[#ce9178]'}`}>
                                        {renderPayload(log)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Publish Area */}
            <div className="border-t border-[var(--border-color)] bg-[var(--sidebar-background)] p-2 flex flex-col gap-2 shrink-0 select-none">
                {/* 第一行：格式下拉 + Topic 选择 + QoS + Retain */}
                <div className="flex items-center gap-2 h-[26px]">
                    {/* 格式选择下拉 (移到 Topic 左侧) */}
                    <div className="shrink-0">
                        <CustomSelect
                            className="!w-[80px] [&_button]:!h-[26px] [&_div.h-7]:!h-[26px] [&_span.text-ellipsis]:!text-[11px]"
                            items={[
                                { label: 'Text', value: 'text' },
                                { label: 'JSON', value: 'json' },
                                { label: 'Base64', value: 'base64' },
                                { label: 'HEX', value: 'hex' },
                            ]}
                            value={publishFormat}
                            onChange={(val) => { setPublishFormat(val as any); saveUIState({ publishFormat: val }); }}
                        />
                    </div>
                    {/* Topic 输入框：支持手动输入 + 从已订阅主题中选择 */}
                    <div className="relative flex-1 h-full" ref={topicDropdownRef}>
                        <div className="flex items-center gap-1.5 bg-[var(--input-background)] border border-[var(--input-border-color)] rounded px-2 h-full focus-within:border-[var(--focus-border-color)] cursor-text" onClick={() => document.getElementById('mqtt-topic-input')?.focus()}>
                            <span className="text-[var(--input-placeholder-color)] text-[11px] shrink-0 font-bold">Topic</span>
                            <div className="w-[1px] h-3 bg-[var(--border-color)]"></div>
                            <input
                                id="mqtt-topic-input"
                                className="bg-transparent border-none outline-none text-[var(--input-foreground)] text-[12px] flex-1 font-mono min-w-0"
                                value={topic}
                                onChange={e => { setTopic(e.target.value); saveUIState({ publishTopic: e.target.value }); }}
                                placeholder="输入或选择主题..."
                            />
                            {subscribedTopics.length > 0 && (
                                <Tooltip content={t('mqtt.addTopic')} position="top" wrapperClassName="shrink-0 flex items-center">
                                    <button
                                        className={`shrink-0 p-0.5 rounded hover:bg-[var(--list-hover-background)] text-[var(--input-placeholder-color)] hover:text-[var(--app-foreground)] transition-colors ${showTopicDropdown ? 'text-[var(--app-foreground)]' : ''}`}
                                        onClick={() => setShowTopicDropdown(v => !v)}
                                    >
                                        <ChevronDown size={12} />
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                        {showTopicDropdown && subscribedTopics.length > 0 && (
                            <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded shadow-lg z-50 max-h-40 overflow-auto">
                                {subscribedTopics.map((t: any) => (
                                    <div
                                        key={t.path}
                                        className={`px-2 py-1.5 text-[11px] font-mono cursor-pointer hover:bg-[var(--list-hover-background)] flex items-center gap-1.5 ${topic === t.path ? 'text-[var(--button-background)] font-bold' : 'text-[var(--app-foreground)]'}`}
                                        onClick={() => { setTopic(t.path); saveUIState({ publishTopic: t.path }); setShowTopicDropdown(false); }}
                                    >
                                        {t.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />}
                                        {t.path}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="shrink-0">
                        <CustomSelect
                            className="!w-[68px] [&_button]:!h-[26px] [&_div.h-7]:!h-[26px] [&_span.text-ellipsis]:!text-[11px]"
                            items={[
                                { label: 'QoS 0', value: '0' },
                                { label: 'QoS 1', value: '1' },
                                { label: 'QoS 2', value: '2' },
                            ]}
                            value={String(qos)}
                            onChange={(val) => setQos(Number(val) as 0 | 1 | 2)}
                        />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none bg-[var(--input-background)] border border-[var(--input-border-color)] px-2 rounded h-full hover:bg-[var(--list-hover-background)] transition-colors shrink-0">
                        <input type="checkbox" className="accent-[var(--button-background)] w-3 h-3 cursor-pointer" checked={retain} onChange={e => setRetain(e.target.checked)} />
                        <span className="text-[var(--app-foreground)] text-[11px]">Retain</span>
                    </label>
                </div>
                {/* 第二行：输入框 + 发送按钮 */}
                <div className="flex gap-2 items-stretch">
                    <textarea
                        className="flex-1 bg-[var(--st-input-bg,var(--input-background))] border border-[var(--input-border-color)] text-[var(--input-foreground)] p-2 outline-none resize-none focus:border-[var(--focus-border-color)] rounded h-[80px] select-text"
                        style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)') }}
                        value={payload}
                        onChange={e => { setPayload(e.target.value); saveUIState({ publishPayload: e.target.value }); }}
                    />
                    <button
                        className={`w-16 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${isConnected
                            ? (payload.trim() === '' ? 'bg-[var(--input-background)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed' : 'bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] text-[var(--button-foreground)]')
                            : 'bg-[var(--input-background)] hover:bg-[var(--list-hover-background)] text-[var(--app-foreground)] cursor-pointer border border-[var(--border-color)] hover:border-[var(--focus-border-color)]'
                            }`}
                        onClick={handleSend}
                        disabled={session.isConnecting}
                    >
                        {isConnected
                            ? <Send size={16} />
                            : <div className="relative"><Send size={16} className="opacity-50" /><div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[var(--accent-color)] rounded-full border border-[var(--sidebar-background)]" /></div>
                        }
                        <span className="text-[10px]">{isConnected ? t('serial.send') : t('mqtt.connect')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
