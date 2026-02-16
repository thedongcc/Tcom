
// No changes yet, need to view SerialInput.tsx
// Placeholder to allow tool execution sequence
import { useRef, useState, useEffect, useCallback } from 'react';
import { SessionState, SessionConfig } from '../../types/session';
import { SerialInput } from './SerialInput';
import { Trash2, ArrowDownToLine, Menu, X, ChevronDown, Check, Download, Settings, Copy, FileText, ClipboardList, Filter } from 'lucide-react';
import { CRCConfig } from '../../utils/crc';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCommandContext } from '../../context/CommandContext';
import { ContextMenu } from '../common/ContextMenu';
import { CommandEditorDialog } from '../commands/CommandEditorDialog';
import { generateUniqueName } from '../../utils/commandUtils';

const formatTimestamp = (ts: number, fmt: string) => {
    const date = new Date(ts);
    const pad = (n: number, w: number = 2) => n.toString().padStart(w, '0');

    // Simple Replacer
    return fmt
        .replace('HH', pad(date.getHours()))
        .replace('mm', pad(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()))
        .replace('SSS', pad(date.getMilliseconds(), 3));
};


interface SerialMonitorProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onSend?: (data: string | Uint8Array) => void;
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void;
    onInputStateChange?: (inputState: any) => void;
    onClearLogs?: () => void;
    onConnectRequest?: () => Promise<boolean | void> | void;
}

export const SerialMonitor = ({ session, onShowSettings, onSend, onUpdateConfig, onInputStateChange, onClearLogs, onConnectRequest }: SerialMonitorProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { logs, isConnected, config } = session;
    const currentPort = config.type === 'serial' ? config.connection.path : '';
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length); // Track log count at mount to skip flash on tab switch

    const uiState = (config as any).uiState || {};
    console.log('SerialMonitor: uiState loaded', { sessionId: session.id, inputHTML: uiState.inputHTML, inputContent: uiState.inputContent });

    // Display Settings State - Initialize from uiState
    const [viewMode, setViewMode] = useState<'text' | 'hex'>(uiState.viewMode || 'hex');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showPacketType, setShowPacketType] = useState(uiState.showPacketType !== undefined ? uiState.showPacketType : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>(uiState.encoding || 'utf-8');
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || 13);
    const [fontFamily, setFontFamily] = useState<'mono' | 'consolas' | 'courier'>(uiState.fontFamily || 'mono');
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showCRCPanel, setShowCRCPanel] = useState(false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);

    // Font Selection Logic
    const [showAllFonts, setShowAllFonts] = useState(uiState.showAllFonts || false);
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);

    const defaultFonts = [
        { label: 'Monospace (Default)', value: 'mono' },
        { label: 'JetBrains Mono (Built-in)', value: 'JetBrains Mono' },
        { label: 'Consolas', value: 'consolas' },
        { label: 'Courier New', value: 'Courier New' },
        { label: 'Microsoft YaHei UI', value: 'Microsoft YaHei UI' },
        { label: 'Segoe UI', value: 'Segoe UI' },
        { label: 'Inter', value: 'Inter' },
    ];

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

    // CRC is in session.config.rxCRC.enabled
    const crcEnabled = (config as any).rxCRC?.enabled || false;
    const rxCRC = (config as any).rxCRC || { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };

    // Use a ref to store the latest config to break dependency cycle
    // Use a ref to store the latest config to break dependency cycle
    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);

    // Debounce timer
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Clean up timer on unmount to prevent zombie updates
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Save UI state when it changes (Immediate - no debounce to prevent data loss on close)
    const saveUIState = useCallback((updates: any) => {
        if (!onUpdateConfig) return;

        const currentUIState = (configRef.current as any).uiState || {};

        // Field-by-field comparison to prevent useless updates
        const hasChanges = Object.keys(updates).some(k =>
            JSON.stringify(updates[k]) !== JSON.stringify(currentUIState[k])
        );

        if (!hasChanges) return;

        onUpdateConfig({ uiState: { ...currentUIState, ...updates } } as any);
    }, [onUpdateConfig]);

    // Calculate statistics
    const txBytes = logs.filter(log => log.type === 'TX').reduce((sum, log) => {
        const count = log.repeatCount || 1;
        if (typeof log.data === 'string') {
            return sum + (new TextEncoder().encode(log.data).length * count);
        }
        return sum + (log.data.length * count);
    }, 0);

    const rxBytes = logs.filter(log => log.type === 'RX').reduce((sum, log) => {
        const count = log.repeatCount || 1;
        if (typeof log.data === 'string') {
            return sum + (new TextEncoder().encode(log.data).length * count);
        }
        return sum + (log.data.length * count);
    }, 0);

    // Clear logs
    const handleClearLogs = () => {
        if (onClearLogs) {
            onClearLogs();
        }
    };

    // Save logs to file
    const handleSaveLogs = () => {
        const content = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const data = formatData(log.data, viewMode, encoding);
            return `[${timestamp}][${log.type}] ${data} `;
        }).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial_log_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatData = (data: string | Uint8Array, mode: 'text' | 'hex', encoding: string) => {
        if (mode === 'hex') {
            if (typeof data === 'string') {
                // Convert string to hex bytes
                const encoder = new TextEncoder();
                const bytes = encoder.encode(data);
                return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            }
            return Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }

        // Text mode
        if (typeof data === 'string') return data;

        try {
            if (encoding === 'gbk') {
                // TextDecoder in browsers may not support GBK directly
                // For now, fallback to utf-8 or use a polyfill
                return new TextDecoder('utf-8').decode(data);
            } else if (encoding === 'ascii') {
                return new TextDecoder('ascii').decode(data);
            } else {
                return new TextDecoder('utf-8').decode(data);
            }
        } catch (e) {
            return new TextDecoder().decode(data);
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

    useEffect(() => {
        if (scrollRef.current && autoScroll) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // Auto-connect on mount if configured


    const handleSend = (data: string | Uint8Array, mode: 'text' | 'hex') => {
        if (!onSend) return;

        if (data instanceof Uint8Array) {
            onSend(data);
            return;
        }

        const textData = data as string;

        if (mode === 'hex') {
            // Parse hex string "AA BB CC" -> Uint8Array
            const cleanHex = textData.replace(/\s+/g, '');
            if (cleanHex.length % 2 !== 0) {
                console.warn("Invalid hex length");
                return;
            }
            const byteArray = new Uint8Array(cleanHex.length / 2);
            for (let i = 0; i < cleanHex.length; i += 2) {
                byteArray[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
            }
            onSend(byteArray);
        } else {
            onSend(textData);
        }
    };

    const toggleCRC = () => {
        if (!onUpdateConfig) return;
        const currentRxCRC = (config as any).rxCRC || { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
        onUpdateConfig({ rxCRC: { ...currentRxCRC, enabled: !crcEnabled } } as any);
    };

    const updateRxCRC = (updates: Partial<CRCConfig>) => {
        if (!onUpdateConfig) return;
        onUpdateConfig({ rxCRC: { ...rxCRC, ...updates } } as any);
    };

    // Filter logs
    const filteredLogs = logs.filter(log => {
        if (filterMode === 'rx') return log.type === 'RX';
        if (filterMode === 'tx') return log.type === 'TX';
        return true; // 'all'
    });

    const toggleFilter = (mode: 'tx' | 'rx') => {
        const newMode = filterMode === mode ? 'all' : mode;
        setFilterMode(newMode);
        saveUIState({ filterMode: newMode });
    };

    const fontFamilyClass = fontFamily === 'consolas' ? 'font-[Consolas]' : fontFamily === 'courier' ? 'font-[Courier]' : 'font-mono';

    const handleInputStateChange = useCallback((state: { content: string, html: string, tokens: any, mode: 'text' | 'hex', lineEnding: string }) => {
        // Prevent update if content hasn't changed (simple check)
        // Note: tokens might be complex object, deep comparison might be heavy. 'inputHTML' usually changes if visual changes.
        // We will trust the callback for now but stabilization helps.
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens,
            inputMode: state.mode,
            lineEnding: state.lineEnding
        });
    }, []); // Empty deps because saveUIState is stable (if defined properly) or we use function update form in saveUIState if needed.
    // However, saveUIState depends on 'onUpdateConfig'.
    // 'onUpdateConfig' is from props.
    // If 'onUpdateConfig' changes, we re-create this.
    // Let's add 'saveUIState' to deps (it's defined in component but wrapper around prop).
    // Actually, saveUIState uses 'onUpdateConfig'. We should wrap saveUIState in useCallback too or just put deps here.

    // Command Context
    const { addCommand, commands } = useCommandContext();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, log: any } | null>(null);
    const [showCommandEditor, setShowCommandEditor] = useState<any | null>(null);

    const handleLogContextMenu = (e: React.MouseEvent, log: any) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            log
        });
    };

    const handleCopyLog = (log: any) => {
        if (!log) return;
        const text = formatData(log.data, viewMode, encoding);
        navigator.clipboard.writeText(text);
        showToast('已复制到剪贴板', 'success', 1500);
        setContextMenu(null);
    };

    const handleAddToCommand = (log: any) => {
        if (!log) return;
        const payload = formatData(log.data, viewMode, encoding);
        // Open Editor Dialog
        setShowCommandEditor({
            name: generateUniqueName(commands, 'command', undefined),
            payload: payload,
            mode: viewMode === 'hex' ? 'hex' : 'text',
            tokens: {},
            lineEnding: '' // Default or detect?
        });
        setContextMenu(null);
    };

    const handleSaveCommand = (updates: any) => {
        addCommand({
            ...updates,
            parentId: undefined // Add to root by default, or maybe prompt? User said "doesn't belong to any group"
        });
        setShowCommandEditor(null);
    };

    return (
        <div
            className="absolute inset-0 flex flex-col bg-[var(--st-rx-bg)] bg-cover bg-center select-none"
            style={{ backgroundImage: 'var(--st-rx-bg-img)' }}
            onClick={() => setContextMenu(null)}
        >
            {/* ... styles ... */}
            <style>
                {`
                    input[type=number]::-webkit-inner-spin-button,
                    input[type=number]::-webkit-outer-spin-button {
                        -webkit-appearance: none;
                        margin: 0;
                    }
                    input[type=number] {
                        -moz-appearance: textfield;
                    }
                `}
            </style>

            {/* ... Toolbar ... */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2b2b2b] bg-[#252526] shrink-0">
                {/* ... existing toolbar code ... */}
                <div className="text-sm font-medium text-[#cccccc] flex items-center gap-2">
                    {isConnected ? (
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                    )}

                    {config.type === 'serial' ?
                        `${config.connection.path || 'No Port'}-${config.connection.baudRate}-${config.connection.dataBits}${config.connection.parity === 'none' ? 'N' : config.connection.parity.toUpperCase()}${config.connection.stopBits}`
                        : config.type === 'mqtt' ?
                            `${config.host}:${config.port} ` : 'Connected'}
                </div>

                <div className="flex items-center gap-4">
                    {/* Stats Display - Refined JetBrains Style */}
                    <div className="flex items-center bg-[#1e1e1e]/80 border border-[#3c3c3c] rounded-sm divide-x divide-[#3c3c3c] overflow-hidden shadow-inner">
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[#007acc] text-white hover:bg-[#0062a3]' : 'hover:bg-[#2a2d2e] bg-transparent'}`}
                            title="Click to filter TX only"
                            onClick={() => toggleFilter('tx')}
                        >
                            <span className={`text-[11px] font-semibold font-mono ${filterMode === 'tx' ? 'text-white' : 'text-[#aaaaaa]'}`}>T:</span>
                            <span className={`text-[11px] font-semibold font-mono tabular-nums leading-none ${filterMode === 'tx' ? 'text-white' : 'text-[#cccccc]'}`}>{txBytes.toLocaleString()}</span>
                        </div>
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-[#4ec9b0] text-[#1e1e1e] hover:bg-[#3da892]' : 'hover:bg-[#2a2d2e] bg-transparent'}`}
                            title="Click to filter RX only"
                            onClick={() => toggleFilter('rx')}
                        >
                            <span className={`text-[11px] font-semibold font-mono ${filterMode === 'rx' ? 'text-[#1e1e1e]' : 'text-[#aaaaaa]'}`}>R:</span>
                            <span className={`text-[11px] font-semibold font-mono tabular-nums leading-none ${filterMode === 'rx' ? 'text-[#1e1e1e]' : 'text-[#cccccc]'}`}>{rxBytes.toLocaleString()}</span>
                        </div>
                    </div>
                    {/* Mode Toggle & Options Group */}
                    <div className="flex items-center gap-1.5">
                        {/* Hex/Text Display Mode */}
                        {/* Hex/Text Display Mode */}
                        <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded border border-[#3c3c3c] h-[26px]">
                            <button
                                className={`px-2.5 h-full text-[10px] font-medium leading-none rounded-[2px] ${viewMode === 'text' ? 'bg-[#007acc] text-white shadow-sm' : 'text-[#969696] hover:text-[#cccccc]'}`}
                                onClick={() => { setViewMode('text'); saveUIState({ viewMode: 'text' }); }}
                            >
                                TXT
                            </button>
                            <button
                                className={`px-2.5 h-full text-[10px] font-medium leading-none rounded-[2px] ${viewMode === 'hex' ? 'bg-[#007acc] text-white shadow-sm' : 'text-[#969696] hover:text-[#cccccc]'}`}
                                onClick={() => { setViewMode('hex'); saveUIState({ viewMode: 'hex' }); }}
                            >
                                HEX
                            </button>
                        </div>


                        {/* Options Menu Button and Panel */}
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
                                    <div className="absolute right-0 top-full mt-1 bg-[#2b2d2e] border border-[#3c3c3c] rounded-[3px] shadow-2xl p-3 z-50 min-w-[260px]">
                                        <div className="flex items-center justify-between mb-4 pb-1 border-b border-[#3c3c3c]">
                                            <div className="text-[12px] text-[#cccccc] font-bold">Log Settings</div>
                                            <X size={14} className="cursor-pointer text-[#969696] hover:text-white" onClick={() => setShowOptionsMenu(false)} />
                                        </div>

                                        {/* Encoding Section */}
                                        <div className="mb-5 px-1 pt-2">
                                            <div className="flex items-center gap-2 mb-2 text-[11px] font-bold text-[#bbbbbb] whitespace-nowrap">
                                                <span>Encoding</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                                            </div>
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-[2px] outline-none px-2 py-1.5 hover:bg-[#454545] transition-colors appearance-none pr-8"
                                                    value={encoding}
                                                    onChange={(e) => { setEncoding(e.target.value as any); saveUIState({ encoding: e.target.value as any }); }}
                                                >
                                                    <option value="utf-8">UTF-8</option>
                                                    <option value="gbk">GBK</option>
                                                    <option value="ascii">ASCII</option>
                                                </select>
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                                    <ChevronDown size={12} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Features Section */}
                                        <div className="mb-5 px-1 pt-2">
                                            <div className="flex items-center gap-2 mb-3 text-[11px] font-bold text-[#bbbbbb] whitespace-nowrap">
                                                <span>Features</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                                            </div>
                                            <div className="space-y-3">
                                                {/* Timestamp */}
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <span className="text-[11px] text-[#cccccc] group-hover:text-[#ffffff] transition-colors">Timestamp</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={showTimestamp}
                                                        onChange={(e) => { setShowTimestamp(e.target.checked); saveUIState({ showTimestamp: e.target.checked }); }}
                                                        className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0 focus:ring-offset-0"
                                                    />
                                                </label>

                                                {/* Packet Type */}
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <span className="text-[11px] text-[#cccccc] group-hover:text-[#ffffff] transition-colors">Packet Type</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={showPacketType}
                                                        onChange={(e) => { setShowPacketType(e.target.checked); saveUIState({ showPacketType: e.target.checked }); }}
                                                        className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0 focus:ring-offset-0"
                                                    />
                                                </label>

                                                {/* Data Length */}
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <span className="text-[11px] text-[#cccccc] group-hover:text-[#ffffff] transition-colors">Data Length</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={showDataLength}
                                                        onChange={(e) => { setShowDataLength(e.target.checked); saveUIState({ showDataLength: e.target.checked }); }}
                                                        className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0 focus:ring-offset-0"
                                                    />
                                                </label>

                                                {/* Merge Repeats */}
                                                <label className="flex items-center justify-between cursor-pointer group">
                                                    <span className="text-[11px] text-[#cccccc] group-hover:text-[#ffffff] transition-colors">Merge Repeats</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={mergeRepeats}
                                                        onChange={(e) => { setMergeRepeats(e.target.checked); saveUIState({ mergeRepeats: e.target.checked }); }}
                                                        className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0 focus:ring-offset-0"
                                                    />
                                                </label>

                                                {/* CRC */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                checked={crcEnabled}
                                                                onChange={toggleCRC}
                                                                className="w-3.5 h-3.5 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0 focus:ring-offset-0"
                                                            />
                                                            <span className="text-[11px] text-[#cccccc] group-hover:text-white transition-colors">CRC Check</span>
                                                        </label>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setShowCRCPanel(!showCRCPanel); }}
                                                            className={`p-1 rounded hover:bg-[#3c3c3c] text-[#969696] hover:text-white transition-colors ${showCRCPanel ? 'bg-[#3c3c3c] text-white' : ''}`}
                                                            title="CRC Configuration"
                                                        >
                                                            <Settings size={12} />
                                                        </button>
                                                    </div>

                                                    {showCRCPanel && (
                                                        <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded p-2 space-y-2 mt-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] text-[#cccccc]">Algorithm:</span>
                                                                <select
                                                                    className="bg-[#3c3c3c] border border-[#3c3c3c] text-[10px] text-[#cccccc] rounded-sm outline-none px-1 py-0.5"
                                                                    value={rxCRC.algorithm}
                                                                    onChange={(e) => updateRxCRC({ algorithm: e.target.value as any })}
                                                                >
                                                                    <option value="modbus-crc16">Modbus CRC16</option>
                                                                    <option value="ccitt-crc16">CCITT CRC16</option>
                                                                    <option value="crc32">CRC32</option>
                                                                    <option value="none">None</option>
                                                                </select>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] text-[#cccccc]">Start Offset:</span>
                                                                <input
                                                                    type="number"
                                                                    className="bg-[#3c3c3c] border border-[#3c3c3c] text-[10px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5 w-24"
                                                                    value={rxCRC.startIndex}
                                                                    onChange={(e) => updateRxCRC({ startIndex: parseInt(e.target.value) || 0 })}
                                                                />
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] text-[#cccccc]">End Position:</span>
                                                                <div className="relative">
                                                                    <select
                                                                        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[10px] text-[#cccccc] rounded-sm outline-none px-1 py-0.5 w-24 appearance-none pr-5 hover:bg-[#454545] transition-colors"
                                                                        value={rxCRC.endIndex}
                                                                        onChange={(e) => updateRxCRC({ endIndex: parseInt(e.target.value) })}
                                                                    >
                                                                        <option value="0">End</option>
                                                                        <option value="-1">-1</option>
                                                                        <option value="-2">-2</option>
                                                                        <option value="-3">-3</option>
                                                                    </select>
                                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                                                        <ChevronDown size={10} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Display Settings Section */}
                                        <div className="mb-6 px-1 pt-2">
                                            <div className="flex items-center gap-2 mb-3 text-[11px] font-bold text-[#bbbbbb] whitespace-nowrap">
                                                <span>UI Settings</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                                            </div>
                                            <div className="space-y-4">
                                                {/* Font Size */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] text-[#cccccc]">Font Size:</span>
                                                    <div className="relative">
                                                        <select
                                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-[2px] outline-none px-2 py-1 w-24 appearance-none hover:bg-[#454545] transition-colors pr-6"
                                                            value={fontSize}
                                                            onChange={(e) => { const val = Number(e.target.value); setFontSize(val); saveUIState({ fontSize: val }); }}
                                                        >
                                                            {[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map(size => (
                                                                <option key={size} value={size}>{size}px</option>
                                                            ))}
                                                        </select>
                                                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                                            <ChevronDown size={11} />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Font Family */}
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[#cccccc]">Font Family:</span>
                                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                className="w-3 h-3 rounded border-[#3c3c3c] bg-[#1e1e1e] text-[#007acc] focus:ring-0 focus:ring-offset-0"
                                                                checked={showAllFonts}
                                                                onChange={(e) => { setShowAllFonts(e.target.checked); saveUIState({ showAllFonts: e.target.checked }); }}
                                                            />
                                                            <span className="text-[10px] text-[#888888] group-hover:text-[#cccccc] transition-colors">Show All System Fonts</span>
                                                        </label>
                                                    </div>
                                                    <div className="relative text-wrap">
                                                        <select
                                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-[2px] outline-none px-2 py-1.5 w-full appearance-none hover:bg-[#454545] transition-colors pr-8"
                                                            value={fontFamily}
                                                            onChange={(e) => { setFontFamily(e.target.value as any); saveUIState({ fontFamily: e.target.value as any }); }}
                                                        >
                                                            <optgroup label="Built-in / Recommended">
                                                                {defaultFonts.map(f => (
                                                                    <option key={f.value} value={f.value}>{f.label}</option>
                                                                ))}
                                                            </optgroup>
                                                            {showAllFonts && availableFonts.length > 0 && (
                                                                <optgroup label="System Fonts">
                                                                    {availableFonts.map(f => (
                                                                        <option key={f.postscriptName || f.fullName} value={f.fullName}>{f.fullName}</option>
                                                                    ))}
                                                                </optgroup>
                                                            )}
                                                        </select>
                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                                            <ChevronDown size={12} />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Chunk Timeout */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] text-[#cccccc]">Packet Timeout:</span>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-[2px] outline-none px-2 py-1 w-24 focus:border-[#007acc] transition-colors"
                                                            value={uiState.chunkTimeout || 0}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value);
                                                                const newTimeout = isNaN(val) ? 0 : Math.max(0, val);
                                                                if (onUpdateConfig) {
                                                                    const currentUIState = (config as any).uiState || {};
                                                                    onUpdateConfig({ uiState: { ...currentUIState, chunkTimeout: newTimeout } } as any);
                                                                }
                                                            }}
                                                            placeholder="0"
                                                        />
                                                        <span className="text-[10px] text-[#666666]">ms</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Items */}
                                        <div className="pt-2 border-t border-[#3c3c3c]">
                                            <button
                                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#007acc] hover:bg-[#0062a3] text-white text-[11px] rounded transition-colors"
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
                                </>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <button
                            className={`p-1 rounded transition-colors ${autoScroll ? 'text-[#4ec9b0] bg-[#1e1e1e]' : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3c3c3c]'}`}
                            onClick={() => {
                                const newState = !autoScroll;
                                setAutoScroll(newState);
                                saveUIState({ autoScroll: newState });
                                // If enabling, scroll to bottom immediately
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

            {/* Log Area */}
            <div
                className="flex-1 overflow-auto p-4"
                style={{
                    fontSize: `${fontSize}px`,
                    fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : `"${fontFamily}", sans-serif`,
                    lineHeight: '1.6'
                }}
                ref={scrollRef}
            >
                {filteredLogs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-[#666]">
                        <p>No data</p>
                    </div>
                )}
                {filteredLogs.map((log, index) => (
                    <div
                        key={index}
                        className={`flex items-start gap-1.5 mb-1 hover:bg-[#2a2d2e] rounded-sm px-1.5 py-0.5 group relative border-l-2 leading-relaxed ${index >= initialLogCountRef.current ? 'animate-flash-new' : ''} ${log.crcStatus === 'error' ? 'bg-[#4b1818]/20 border-[#f48771]' : 'border-transparent'} ${contextMenu?.log === log ? 'bg-[#04395e]/40 ring-1 ring-[#04395e]' : ''}`}
                        style={{ fontSize: 'inherit', fontFamily: 'inherit' }}
                        onContextMenu={(e) => handleLogContextMenu(e, log)}
                    >
                        {/* Timestamp & Repeat Count Container */}
                        {(showTimestamp || (log.repeatCount && log.repeatCount > 1)) && (
                            <div className="shrink-0 flex items-center h-[1.6em] select-none gap-1.5">
                                {showTimestamp && (
                                    <span className="text-[#999] font-mono opacity-90">
                                        [{formatTimestamp(log.timestamp, themeConfig.timestampFormat || 'HH:mm:ss.SSS').trim()}]
                                    </span>
                                )}
                                {log.repeatCount && log.repeatCount > 1 && (
                                    <span
                                        key={log.repeatCount}
                                        className="h-[18px] flex items-center justify-center text-[11px] leading-none text-[#FFD700] font-bold font-mono bg-[#FFD700]/10 px-1.5 rounded-[3px] border border-[#FFD700]/30 min-w-[24px] shadow-sm backdrop-blur-[1px] animate-flash-gold pt-[1px]"
                                    >
                                        x{log.repeatCount}
                                    </span>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0 h-[1.6em]">
                            {showPacketType && (
                                <span className={`h-[18px] flex items-center justify-center font-bold font-mono select-none px-1 rounded-[3px] w-[36px] text-[11px] leading-none shadow-sm border border-white/10 tracking-wide pt-[1px]
                                    ${log.type === 'TX' ? 'bg-[#007acc] text-white' :
                                        log.type === 'RX' ? 'bg-[#4ec9b0] text-[#1e1e1e]' :
                                            'bg-[#454545] text-[#cccccc]'
                                    }`}>
                                    {log.type === 'TX' ? 'TX' : log.type === 'RX' ? 'RX' : 'INFO'}
                                </span>
                            )}
                            {showDataLength && (
                                <span className="h-[18px] flex items-center justify-center font-mono select-none px-1.5 rounded-[3px] min-w-[32px] text-[11px] leading-none shadow-sm border border-white/10 bg-white/5 text-[#aaaaaa] pt-[1px]">
                                    {getDataLengthText(log.data)}
                                </span>
                            )}
                        </div>
                        <span className={`whitespace-pre-wrap break-all select-text cursor-text flex-1 ${log.type === 'TX' ? 'text-[var(--st-tx-text)]' :
                            log.type === 'RX' ? 'text-[var(--st-rx-text)]' :
                                log.type === 'ERROR' ? 'text-[var(--st-error-text)]' :
                                    'text-[var(--st-info-text)]'
                            }`}>
                            {formatData(log.data, viewMode, encoding)}
                        </span>
                        {log.crcStatus === 'error' && (
                            <span className="ml-2 text-[10px] text-[#f48771] bg-[#4b1818] px-1.5 rounded border border-[#f48771]/30">
                                CRC Error
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Serial Input Area */}
            <SerialInput
                key={session.id}
                onSend={handleSend}
                initialContent={uiState.inputContent || ''}
                initialHTML={uiState.inputHTML || ''}
                initialTokens={uiState.inputTokens as any || {}}
                initialMode={uiState.inputMode || 'hex'}
                initialLineEnding={uiState.lineEnding || '\r\n'}
                onStateChange={handleInputStateChange}
                isConnected={isConnected}
                fontSize={fontSize}
                fontFamily={fontFamily}
                onConnectRequest={async () => {
                    // Try to connect if a port is configured
                    const path = config.type === 'serial' ? config.connection.path : undefined;
                    if (path && onConnectRequest) {
                        const result = await onConnectRequest();
                        // If result is explicitly false (connection failed), open settings
                        if (result === false) {
                            if (onShowSettings) onShowSettings('serial');
                            if (onInputStateChange) onInputStateChange({ highlightConnect: Date.now() });
                        }
                    } else {
                        // No port configured, open settings directly
                        if (onShowSettings) onShowSettings('serial');
                        if (onInputStateChange) onInputStateChange({ highlightConnect: Date.now() });
                    }
                }}
            />
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={[
                        {
                            label: 'Copy',
                            icon: <Copy size={13} />,
                            onClick: () => handleCopyLog(contextMenu.log)
                        },
                        {
                            label: 'Add to Command',
                            icon: <FileText size={13} />,
                            onClick: () => handleAddToCommand(contextMenu.log)
                        }
                    ]}
                />
            )}

            {showCommandEditor && (
                <CommandEditorDialog
                    item={{
                        id: 'new',
                        type: 'command',
                        ...showCommandEditor
                    }}
                    onClose={() => setShowCommandEditor(null)}
                    onSave={handleSaveCommand}
                    existingNames={commands.filter(c => !c.parentId).map(c => c.name)}
                />
            )}
        </div>
    );
};
