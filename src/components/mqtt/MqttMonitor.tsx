import { MqttSessionConfig, LogEntry } from '../../types/session';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Send, Trash2, ArrowDownToLine, Menu, X, ChevronDown, Download, Settings, RefreshCw, Check, Filter } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';

interface MqttMonitorProps {
    session: {
        id: string;
        config: MqttSessionConfig;
        isConnected: boolean;
        logs: LogEntry[];
    };
    onShowSettings?: (view: string) => void;
    onPublish: (topic: string, payload: string | Uint8Array, qos: 0 | 1 | 2, retain: boolean) => void;
    onUpdateConfig?: (updates: Partial<MqttSessionConfig>) => void;
    onClearLogs?: () => void;
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

export const MqttMonitor = ({ session, onShowSettings, onPublish, onUpdateConfig, onClearLogs }: MqttMonitorProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length); // Track log count at mount to skip flash on tab switch

    // Initial State from Config
    const uiState = config.uiState || {};

    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'json'>(uiState.viewMode || 'text');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || 13);
    const [fontFamily, setFontFamily] = useState<string>(uiState.fontFamily || 'mono');
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');

    // Font Selection Logic
    const [showAllFonts, setShowAllFonts] = useState(uiState.showAllFonts || false);
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);

    const [showOptionsMenu, setShowOptionsMenu] = useState(false);

    // Publish State
    const [topic, setTopic] = useState('test/topic');
    const [payload, setPayload] = useState('{"msg": "hello"}');
    const [qos, setQos] = useState<0 | 1 | 2>(0);
    const [retain, setRetain] = useState(false);
    const [publishFormat, setPublishFormat] = useState<'text' | 'hex' | 'json'>('text');

    // Helper: Save UI State
    const saveUIState = (updates: any) => {
        if (!onUpdateConfig) return;
        const currentUI = config.uiState || {};
        onUpdateConfig({ uiState: { ...currentUI, ...updates } });
    };

    // Auto-scroll logic
    useEffect(() => {
        if (scrollRef.current && autoScroll) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll, filterMode]); // Added filterMode dependency to scroll when filter changes

    // System Fonts Loading
    useEffect(() => {
        if (showAllFonts) {
            // @ts-ignore - queryLocalFonts is an experimental API
            if (window.queryLocalFonts) {
                // @ts-ignore
                window.queryLocalFonts().then((fonts: any[]) => {
                    // Filter and deduplicate
                    const uniqueFonts = Array.from(new Set(fonts.map((f: any) => f.fullName)))
                        .map(name => fonts.find((f: any) => f.fullName === name))
                        .sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));
                    setAvailableFonts(uniqueFonts);
                }).catch((e: any) => {
                    console.error('Failed to query local fonts:', e);
                });
            }
        }
    }, [showAllFonts]);

    // Helpers
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

    const formatData = (data: string | Uint8Array, mode: 'text' | 'hex' | 'json') => {
        if (mode === 'hex') {
            const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
            return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }
        if (mode === 'json') {
            try {
                const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
                const obj = JSON.parse(str);
                return JSON.stringify(obj, null, 2);
            } catch {
                // fallback to text if invalid json
            }
        }
        // Text
        if (typeof data === 'string') return data;
        try {
            return new TextDecoder().decode(data);
        } catch {
            return `[Binary ${data.length} bytes]`;
        }
    };

    const getDataLengthText = (data: string | Uint8Array) => {
        let length = 0;
        if (typeof data === 'string') {
            length = new TextEncoder().encode(data).length;
        } else {
            length = data.length;
        }
        return `[${length}B]`;
    };

    const handleSend = () => {
        if (!session.isConnected || !topic) return;

        let data: string | Uint8Array = payload;

        if (publishFormat === 'hex') {
            const cleanHex = payload.replace(/\s+/g, '');
            if (!/^[0-9A-Fa-f]*$/.test(cleanHex) || cleanHex.length % 2 !== 0) {
                showToast('Invalid Hex String', 'error');
                return;
            }
            if (cleanHex.length > 0)
                data = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            else
                data = new Uint8Array(0);

        } else if (publishFormat === 'json') {
            try {
                JSON.parse(payload);
            } catch (e) {
                // warning optional
            }
        }
        onPublish(topic, data, qos, retain);
    };

    const handleClearLogs = () => {
        if (onClearLogs) onClearLogs();
    };

    const handleSaveLogs = () => {
        const content = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const dataStr = formatData(log.data, viewMode);
            const topicStr = log.topic ? `[${log.topic}] ` : '';
            return `[${timestamp}][${log.type}] ${topicStr}${dataStr}`;
        }).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mqtt_log_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Toggle Filter Mode
    const toggleFilter = (mode: 'tx' | 'rx') => {
        const newMode = filterMode === mode ? 'all' : mode;
        setFilterMode(newMode);
        saveUIState({ filterMode: newMode });
    };

    // Stats Calculation
    const txBytes = logs.filter(log => log.type === 'TX').reduce((sum, log) => {
        const count = log.repeatCount || 1;
        const len = typeof log.data === 'string' ? new TextEncoder().encode(log.data).length : log.data.length;
        return sum + (len * count);
    }, 0);

    const rxBytes = logs.filter(log => log.type === 'RX').reduce((sum, log) => {
        const count = log.repeatCount || 1;
        const len = typeof log.data === 'string' ? new TextEncoder().encode(log.data).length : log.data.length;
        return sum + (len * count);
    }, 0);

    // Filter Logs for Display
    const filteredLogs = logs.filter(log => {
        if (filterMode === 'tx') return log.type === 'TX';
        if (filterMode === 'rx') return log.type === 'RX';
        return true;
    });

    // JSON Highlighter Helper
    const renderPayload = (data: string | Uint8Array, mode: 'text' | 'hex' | 'json') => {
        if (mode === 'json') {
            try {
                const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
                const obj = JSON.parse(str);
                const json = JSON.stringify(obj, null, 2);

                const escaped = json
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                // Enhanced Regex for keys, strings, numbers, booleans, null, and punctuation
                const highlighted = escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[\[\]{}:,])/g, (match) => {
                    let cls = 'color: #d4d4d4;'; // default/punctuation
                    if (/^"/.test(match)) {
                        if (/:$/.test(match)) {
                            cls = 'color: #9cdcfe; font-weight: bold;'; // key
                        } else {
                            cls = 'color: #ce9178;'; // string
                        }
                    } else if (/true|false/.test(match)) {
                        cls = 'color: #569cd6; font-weight: bold;'; // boolean
                    } else if (/null/.test(match)) {
                        cls = 'color: #569cd6; font-weight: bold;'; // null
                    } else if (/^-?\d/.test(match)) {
                        cls = 'color: #b5cea8;'; // number
                    } else if (/[\[\]{}:,]/.test(match)) {
                        cls = 'color: #ffd700; font-weight: bold;'; // punctuation
                    }
                    return `<span style="${cls}">${match}</span>`;
                });

                return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
            } catch (e) {
                // fallback to text if invalid json
            }
        }
        return formatData(data, mode);
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[#1e1e1e] select-none">
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
                    {/* Stats with Filter Toggle - Swapped R/T Order */}
                    <div className="flex items-center bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm divide-x divide-[#3c3c3c] overflow-hidden shadow-sm">
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-[#4ec9b0] text-[#1e1e1e] hover:bg-[#3da892]' : 'hover:bg-[#2a2d2e] bg-transparent'}`}
                            title="Click to filter RX only"
                            onClick={() => toggleFilter('rx')}
                        >
                            <span className={`text-[11px] font-semibold font-mono ${filterMode === 'rx' ? 'text-[#1e1e1e]' : 'text-[#aaaaaa]'}`}>R:</span>
                            <span className={`text-[11px] font-semibold font-mono tabular-nums leading-none ${filterMode === 'rx' ? 'text-[#1e1e1e]' : 'text-[#cccccc]'}`}>{rxBytes.toLocaleString()}</span>
                        </div>
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[#007acc] text-white hover:bg-[#0062a3]' : 'hover:bg-[#2a2d2e] bg-transparent'}`}
                            title="Click to filter TX only"
                            onClick={() => toggleFilter('tx')}
                        >
                            <span className={`text-[11px] font-semibold font-mono ${filterMode === 'tx' ? 'text-white' : 'text-[#aaaaaa]'}`}>T:</span>
                            <span className={`text-[11px] font-semibold font-mono tabular-nums leading-none ${filterMode === 'tx' ? 'text-white' : 'text-[#cccccc]'}`}>{txBytes.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* View Mode */}
                    <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded border border-[#3c3c3c] h-[26px]">
                        {(['text', 'hex', 'json'] as const).map(m => (
                            <button
                                key={m}
                                className={`px-2.5 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase ${viewMode === m ? 'bg-[#007acc] text-white shadow-sm' : 'text-[#969696] hover:text-[#cccccc]'}`}
                                onClick={() => { setViewMode(m); saveUIState({ viewMode: m }); }}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    {/* Options */}
                    <div className="relative">
                        <button
                            className={`h-8 px-2 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-[#cccccc] transition-colors flex items-center gap-1.5 border border-transparent ${showOptionsMenu ? 'bg-[#3c3c3c] text-white' : ''}`}
                            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                            title="Options"
                        >
                            <Menu size={16} />
                            <span className="text-[11px] font-medium">Options</span>
                        </button>
                        {showOptionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 bg-[#2b2d2e] border border-[#3c3c3c] rounded-[3px] shadow-2xl p-3 z-50 min-w-[240px]">
                                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#3c3c3c]">
                                        <div className="text-[12px] text-[#cccccc] font-bold">Log Settings</div>
                                    </div>
                                    <div className="space-y-3 px-1">

                                        {/* Features */}
                                        <div className="space-y-2 mb-4">
                                            <div className="flex items-center gap-2 mb-2 text-[11px] font-bold text-[#bbbbbb] whitespace-nowrap">
                                                <span>Features</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                                            </div>

                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <span className="text-[11px] text-[#cccccc] group-hover:text-white transition-colors">Timestamp</span>
                                                <input
                                                    type="checkbox"
                                                    checked={showTimestamp}
                                                    onChange={(e) => { setShowTimestamp(e.target.checked); saveUIState({ showTimestamp: e.target.checked }); }}
                                                    className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0"
                                                />
                                            </label>

                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <span className="text-[11px] text-[#cccccc] group-hover:text-white transition-colors">Data Length</span>
                                                <input
                                                    type="checkbox"
                                                    checked={showDataLength}
                                                    onChange={(e) => { setShowDataLength(e.target.checked); saveUIState({ showDataLength: e.target.checked }); }}
                                                    className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0"
                                                />
                                            </label>

                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <span className="text-[11px] text-[#cccccc] group-hover:text-white transition-colors">Merge Repeats</span>
                                                <input
                                                    type="checkbox"
                                                    checked={mergeRepeats}
                                                    onChange={(e) => { setMergeRepeats(e.target.checked); saveUIState({ mergeRepeats: e.target.checked }); }}
                                                    className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0"
                                                />
                                            </label>
                                        </div>

                                        {/* Font Settings */}
                                        <div className="space-y-3 mb-4">
                                            <div className="flex items-center gap-2 mb-2 text-[11px] font-bold text-[#bbbbbb] whitespace-nowrap">
                                                <span>Appearance</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-[#cccccc]">Font Size:</span>
                                                <div className="relative">
                                                    <select
                                                        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-[2px] outline-none px-2 py-1 w-20 appearance-none hover:bg-[#454545] transition-colors"
                                                        value={fontSize}
                                                        onChange={(e) => { const val = Number(e.target.value); setFontSize(val); saveUIState({ fontSize: val }); }}
                                                    >
                                                        {[10, 11, 12, 13, 14, 15, 16, 18, 20].map(size => (
                                                            <option key={size} value={size}>{size}px</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                                        <ChevronDown size={10} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] text-[#cccccc]">Font Family:</span>
                                                <div className="relative">
                                                    <select
                                                        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-[2px] outline-none px-2 py-1 w-full appearance-none hover:bg-[#454545] transition-colors pr-6"
                                                        value={fontFamily}
                                                        onChange={(e) => { setFontFamily(e.target.value); saveUIState({ fontFamily: e.target.value }); }}
                                                    >
                                                        <optgroup label="Preset Fonts">
                                                            {defaultFonts.map(f => (
                                                                <option key={f.value} value={f.value}>{f.label}</option>
                                                            ))}
                                                        </optgroup>
                                                        {showAllFonts && availableFonts.length > 0 && (
                                                            <optgroup label="System Fonts">
                                                                {availableFonts.map((font: any) => (
                                                                    <option key={font.fullName} value={font.fullName}>
                                                                        {font.fullName}
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        )}
                                                    </select>
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                                        <ChevronDown size={12} />
                                                    </div>
                                                </div>

                                                <label className="flex items-center gap-2 mt-1 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={showAllFonts}
                                                        onChange={(e) => { setShowAllFonts(e.target.checked); saveUIState({ showAllFonts: e.target.checked }); }}
                                                        className="w-3 h-3 rounded border-[#3c3c3c] bg-[#1e1e1e]"
                                                    />
                                                    <span className="text-[10px] text-[#969696]">Show System Fonts</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="pt-2 border-t border-[#3c3c3c]">
                                            <button
                                                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[#007acc] hover:bg-[#0062a3] text-white text-[11px] rounded transition-colors"
                                                onClick={() => {
                                                    handleSaveLogs();
                                                    setShowOptionsMenu(false);
                                                }}
                                            >
                                                <Download size={14} />
                                                <span>Export Log</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <button
                            className={`p-1 rounded transition-colors ${autoScroll ? 'text-[#4ec9b0] bg-[#1e1e1e]' : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3c3c3c]'}`}
                            onClick={() => {
                                const newState = !autoScroll;
                                setAutoScroll(newState);
                                saveUIState({ autoScroll: newState });
                                if (newState && scrollRef.current) {
                                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                                }
                            }}
                            title={`Auto Scroll: ${autoScroll ? 'On' : 'Off'}`}
                        >
                            <ArrowDownToLine size={14} />
                        </button>
                        <button
                            className="p-1 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-[#cccccc] transition-colors"
                            onClick={handleClearLogs}
                            title="Clear Logs"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                </div>
            </div>

            {/* Logs Area - Compact Chat Bubble Layout */}
            <div
                className="flex-1 overflow-auto p-2 flex flex-col gap-1.5 select-text scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                ref={scrollRef}
                style={{
                    fontSize: `${fontSize}px`,
                    fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily,
                    lineHeight: '1.4'
                }}
            >
                {logs.length === 0 && (
                    <div className="text-[#666] italic text-center mt-10 select-none text-sm">
                        {session.isConnected ? 'Connected. Waiting for messages...' : 'Disconnected.'}
                    </div>
                )}
                {filteredLogs.map((log, i) => {
                    const isTX = log.type === 'TX';
                    const isRX = log.type === 'RX';
                    const isError = log.type === 'ERROR';
                    const isInfo = log.type === 'INFO';



                    // Determine Topic Color
                    const topicColor = (session.config.topics || []).find(t => t.path === log.topic)?.color || (isTX ? '#007acc' : '#4ec9b0');
                    // Slightly transparent versions for Topic Pill (not bubble background)
                    const bgTint = topicColor + '15';
                    const borderTint = topicColor + '50';

                    if (isError || isInfo || !log.topic) {
                        return (
                            <div key={`${i}-${log.timestamp}`} className="flex justify-center my-1">
                                <span className={`px-3 py-0.5 rounded-full text-[0.8em] font-medium border ${isError
                                    ? 'bg-red-900/20 text-red-400 border-red-500/10'
                                    : 'bg-[#1e1e1e] text-[#666] border-[#333]'
                                    }`}>
                                    {isInfo ? formatData(log.data, 'text') : (log.topic ? formatData(log.data, 'text') : `[${log.type}] ${formatData(log.data, 'text')}`)}
                                </span>
                            </div>
                        );
                    }

                    return (
                        <div key={`${i}-${log.timestamp}-${log.repeatCount || 0}`} className={`flex w-full group relative ${isTX ? 'justify-end' : 'justify-start'}`}>
                            {/* Message Bubble - Compact & Colored */}
                            <div
                                className={`relative max-w-[90%] rounded-lg px-3 py-2 border shadow-sm transition-all overflow-hidden
                                ${isTX
                                        ? 'rounded-br-sm'
                                        : 'rounded-bl-sm'
                                    } ${i >= initialLogCountRef.current ? 'animate-flash-new' : ''}`}
                                style={{
                                    backgroundColor: 'transparent', // Transparent background for all
                                    borderColor: topicColor + '80', // Full border in topic color with semi-transparency

                                    // CSS Vars for animation
                                    // @ts-ignore
                                    '--flash-color': topicColor + '40', // Flash glow color
                                    '--flash-border': topicColor,      // Flash border color (full opacity)
                                    '--final-bg': 'transparent',
                                    '--final-border': topicColor + '80' // Semi-transparent final border
                                }}
                            >

                                {/* Header: Timestamp & Topic */}
                                <div className={`flex items-baseline gap-2 mb-1 opacity-90 select-none relative z-10 ${isTX ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {/* Timestamp - brackets added */}
                                    {showTimestamp && (
                                        <span className="text-[#999] text-[0.9em] font-mono whitespace-nowrap leading-none">
                                            [{formatTimestamp(log.timestamp)}]
                                        </span>
                                    )}

                                    {/* Topic Pill */}
                                    {log.topic && (
                                        <span
                                            className="px-1.5 py-0.5 rounded-[3px] text-[0.9em] font-medium leading-none border border-current opacity-100 select-text max-w-[300px] truncate shadow-sm cursor-pointer hover:opacity-80"
                                            style={{
                                                color: topicColor,
                                                borderColor: borderTint,
                                                backgroundColor: bgTint
                                            }}
                                            title={log.topic}
                                        >
                                            {log.topic}
                                        </span>
                                    )}

                                    {/* Repeat Badge - Flash on change via key */}
                                    {log.repeatCount && log.repeatCount > 1 && (
                                        <span
                                            key={log.repeatCount} // Trigger animation on count change
                                            className="text-[0.9em] leading-none text-[#FFD700] font-bold font-mono bg-[#FFD700]/10 px-1.5 py-0.5 rounded-[3px] border border-[#FFD700]/40 min-w-[24px] text-center shadow-[0_0_8px_rgba(255,215,0,0.15)] animate-flash-gold"
                                        >
                                            x{log.repeatCount}
                                        </span>
                                    )}
                                </div>

                                {/* Body: Payload - JSON Rendering Support */}
                                <div className={`relative z-10 whitespace-pre-wrap break-all select-text font-mono text-[1.05em] leading-snug
                                    ${isTX ? 'text-[#e0e0e0]' : 'text-[#ce9178]'}`}>
                                    {renderPayload(log.data, viewMode)}
                                </div>

                                {/* Link Indicator/Footer */}
                                {showDataLength && (
                                    <div className={`mt-1 flex relative z-10 ${isTX ? 'justify-end' : 'justify-start'}`}>
                                        <span className="text-[0.75em] text-[#666] font-mono bg-black/20 px-1.5 rounded-[3px]">
                                            {getDataLengthText(log.data)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Rich Publish Area */}
            <div className="border-t border-[var(--vscode-border)] bg-[#252526] p-2 flex flex-col gap-2 shrink-0">
                {/* Top Row: Topic, QoS, Retain */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#3c3c3c] border border-[#3c3c3c] rounded-sm px-2 py-1 flex-1 relative">
                        <span className="text-[#969696] text-[11px]">Topic</span>
                        <input
                            className="bg-transparent border-none outline-none text-[#cccccc] text-[12px] flex-1 font-mono"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="topic/path"
                            list="mqtt-topics-list"
                        />
                        <datalist id="mqtt-topics-list">
                            {(session.config.topics || []).map(t => (
                                <option key={t.id} value={t.path}>{t.path}</option>
                            ))}
                        </datalist>
                    </div>

                    <div className="flex items-center gap-1">
                        <span className="text-[#969696] text-[11px]">QoS</span>
                        <select
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-[12px] p-1 rounded-sm outline-none"
                            value={qos}
                            onChange={(e) => setQos(Number(e.target.value) as 0 | 1 | 2)}
                        >
                            <option value={0}>0</option>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1 cursor-pointer">
                        <input
                            type="checkbox"
                            id="retain-check"
                            checked={retain}
                            onChange={(e) => setRetain(e.target.checked)}
                            className="bg-[#3c3c3c]"
                        />
                        <label htmlFor="retain-check" className="text-[#969696] text-[11px] select-none cursor-pointer">Retain</label>
                    </div>
                </div>

                {/* Middle Row: Format & Payload */}
                <div className="flex gap-2 h-20">
                    <div className="flex flex-col gap-1 w-24 shrink-0">
                        <div className="flex flex-col gap-0.5 bg-[#1e1e1e] rounded p-0.5 border border-[#3c3c3c]">
                            {['text', 'json', 'hex'].map((fmt) => (
                                <div
                                    key={fmt}
                                    className={`text-[10px] text-center cursor-pointer py-1 rounded-sm uppercase ${publishFormat === fmt ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:bg-[#333]'}`}
                                    onClick={() => setPublishFormat(fmt as any)}
                                >
                                    {fmt}
                                </div>
                            ))}
                        </div>
                    </div>

                    <textarea
                        className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc] p-2 text-[12px] font-mono outline-none focus:border-[var(--vscode-focusBorder)] resize-none"
                        value={payload}
                        onChange={(e) => setPayload(e.target.value)}
                        placeholder={`Enter ${publishFormat} payload...`}
                    />

                    <button
                        className={`w-16 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${session.isConnected ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white' : 'bg-[#2d2d2d] text-[#666] cursor-not-allowed'}`}
                        onClick={handleSend}
                        disabled={!session.isConnected}
                    >
                        <Send size={16} />
                        <span className="text-[10px]">Send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
