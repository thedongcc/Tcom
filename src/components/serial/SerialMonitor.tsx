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
import { AnimatePresence, motion } from 'framer-motion';
import { formatPortInfo, formatTimestamp } from '../../utils/format';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { LogSearch, useLogSearch } from '../common/LogSearch';
import { useI18n } from '../../context/I18nContext';


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
    const { t } = useI18n();
    const { logs, isConnected, config } = session;
    const currentPort = config.type === 'serial' ? config.connection.path : '';
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length); // Track log count at mount to skip flash on tab switch
    const mountTimeRef = useRef(Date.now()); // Track mount time for animation logic

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
    const [smoothScroll, setSmoothScroll] = useState(uiState.smoothScroll !== undefined ? uiState.smoothScroll : true);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showCRCPanel, setShowCRCPanel] = useState(false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    // Search State
    const [searchOpen, setSearchOpen] = useState(uiState.searchOpen || false);

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

    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex', enc: string) => {
        if (mode === 'hex') {
            if (typeof data === 'string') {
                const encoder = new TextEncoder();
                const bytes = encoder.encode(data);
                return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            }
            return Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }

        if (typeof data === 'string') return data;
        try {
            return new TextDecoder(enc).decode(data);
        } catch (e) {
            return new TextDecoder().decode(data);
        }
    }, []);

    // Search Logic
    const {
        query, setQuery, isRegex, setIsRegex, matches, currentIndex, nextMatch, prevMatch
    } = useLogSearch(logs, uiState.searchQuery || '', uiState.searchRegex || false, viewMode, formatData, encoding);

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        // Debounce saving to uiState if needed, but for now direct save is okay or use a ref + blur/unmount save
        // For simple text input, saving on every char might be heavy if config update triggers re-renders.
        // But saveUIState implementation merges with current config.
        // Let's safe-guard:
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

    const activeMatch = matches[currentIndex];

    // Auto-scroll to active search match
    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeMatch]);

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
            requestAnimationFrame(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            });
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
        if (log.type === 'INFO' || log.type === 'ERROR') return true;
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
        showToast(t('toast.copied'), 'success', 1500);
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
                                <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                            </button>
                            {showOptionsMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 bg-[#2b2d2e] border border-[#3c3c3c] rounded-[3px] shadow-2xl p-3 z-50 min-w-[260px]">
                                        <div className="flex items-center justify-between mb-4 pb-1 border-b border-[#3c3c3c]">
                                            <div className="text-[12px] text-[#cccccc] font-bold">{t('monitor.logSettings')}</div>
                                            <X size={14} className="cursor-pointer text-[#969696] hover:text-white" onClick={() => setShowOptionsMenu(false)} />
                                        </div>

                                        {/* Encoding Section */}
                                        <div className="mb-4 px-1">
                                            <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                                                <span>{t('monitor.encoding')}</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1" />
                                            </div>
                                            <CustomSelect
                                                items={[
                                                    { label: 'UTF-8', value: 'utf-8' },
                                                    { label: 'GBK', value: 'gbk' },
                                                    { label: 'ASCII', value: 'ascii' }
                                                ]}
                                                value={encoding}
                                                onChange={(val) => { setEncoding(val as any); saveUIState({ encoding: val }); }}
                                            />
                                        </div>

                                        {/* Features Section */}
                                        <div className="mb-4 px-1">
                                            <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                                                <span>{t('monitor.logFeatures')}</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1" />
                                            </div>
                                            <div className="space-y-2.5">
                                                <Switch
                                                    label={t('monitor.timestamp')}
                                                    checked={showTimestamp}
                                                    onChange={(checked) => { setShowTimestamp(checked); saveUIState({ showTimestamp: checked }); }}
                                                />

                                                <Switch
                                                    label={t('monitor.packetType')}
                                                    checked={showPacketType}
                                                    onChange={(checked) => { setShowPacketType(checked); saveUIState({ showPacketType: checked }); }}
                                                />

                                                <Switch
                                                    label={t('monitor.dataLength')}
                                                    checked={showDataLength}
                                                    onChange={(checked) => { setShowDataLength(checked); saveUIState({ showDataLength: checked }); }}
                                                />

                                                <Switch
                                                    label={t('monitor.mergeRepeats')}
                                                    checked={mergeRepeats}
                                                    onChange={(checked) => { setMergeRepeats(checked); saveUIState({ mergeRepeats: checked }); }}
                                                />

                                                <Switch
                                                    label={t('monitor.smoothAnimation')}
                                                    checked={smoothScroll}
                                                    onChange={(checked) => { setSmoothScroll(checked); saveUIState({ smoothScroll: checked }); }}
                                                />

                                                {/* CRC */}
                                                <div className="space-y-2 pt-1 border-t border-[#3c3c3c]/50 mt-1">
                                                    <div className="flex items-center gap-2 group/crc">
                                                        <Switch
                                                            label={t('monitor.crcCheck')}
                                                            checked={crcEnabled}
                                                            onChange={toggleCRC}
                                                            className="flex-1"
                                                        />
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setShowCRCPanel(!showCRCPanel); }}
                                                            className={`p-1 rounded hover:bg-[#3c3c3c] text-[#969696] hover:text-white transition-colors flex-shrink-0 ${showCRCPanel ? 'bg-[#3c3c3c] text-white' : ''}`}
                                                            title="CRC Configuration"
                                                        >
                                                            <Settings size={12} />
                                                        </button>
                                                    </div>

                                                    {showCRCPanel && (
                                                        <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded p-2.5 space-y-3 mt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="text-[10px] text-[#888888] font-medium">{t('monitor.algorithm')}:</span>
                                                                <CustomSelect
                                                                    items={[
                                                                        { label: 'Modbus CRC16', value: 'modbus-crc16' },
                                                                        { label: 'CCITT CRC16', value: 'ccitt-crc16' },
                                                                        { label: 'CRC32', value: 'crc32' },
                                                                        { label: 'None', value: 'none' }
                                                                    ]}
                                                                    value={rxCRC.algorithm}
                                                                    onChange={(val) => updateRxCRC({ algorithm: val as any })}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="text-[10px] text-[#888888] font-medium">{t('monitor.startOffset')}:</span>
                                                                <input
                                                                    type="number"
                                                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-2 py-1 focus:border-[var(--vscode-focusBorder)]"
                                                                    value={rxCRC.startIndex}
                                                                    onChange={(e) => updateRxCRC({ startIndex: parseInt(e.target.value) || 0 })}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="text-[10px] text-[#888888] font-medium">{t('monitor.endPosition')}:</span>
                                                                <CustomSelect
                                                                    items={[
                                                                        { label: 'End of Packet', value: '0' },
                                                                        { label: '-1 (Exclude last 1)', value: '-1' },
                                                                        { label: '-2 (Exclude last 2)', value: '-2' },
                                                                        { label: '-3 (Exclude last 3)', value: '-3' }
                                                                    ]}
                                                                    value={(rxCRC.endIndex ?? 0).toString()}
                                                                    onChange={(val) => updateRxCRC({ endIndex: parseInt(val) })}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Display Settings Section */}
                                        <div className="mb-6 px-1">
                                            <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                                                <span>{t('monitor.typography')}</span>
                                                <div className="h-[1px] bg-[#3c3c3c] flex-1" />
                                            </div>
                                            <div className="space-y-4">
                                                {/* Font Size */}
                                                <div className="flex flex-col gap-2">
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

                                                {/* Font Family */}
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
                                                        onChange={(val) => { setFontFamily(val as any); saveUIState({ fontFamily: val as any }); }}
                                                    />
                                                </div>

                                                {/* Chunk Timeout */}
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[11px] text-[#aaaaaa]">{t('monitor.packetTimeout')}:</span>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-2 py-1.5 focus:border-[var(--vscode-focusBorder)] transition-colors"
                                                        value={uiState.chunkTimeout || 0}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value);
                                                            const newTimeout = isNaN(val) ? 0 : Math.max(0, val);
                                                            if (onUpdateConfig) {
                                                                const currentUIState = (config as any).uiState || {};
                                                                onUpdateConfig({ uiState: { ...currentUIState, chunkTimeout: newTimeout } } as any);
                                                            }
                                                        }}
                                                        placeholder="0 (Disabled)"
                                                    />
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
                                                <span>{t('monitor.exportLog')}</span>
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
                        encoding={encoding}
                    />
                </div>
                <div
                    className="absolute inset-0 overflow-auto p-4"
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
                    {filteredLogs.length > 100 && (
                        <div className="text-center text-[10px] text-[#666] py-1 select-none">
                            ... {filteredLogs.length - 100} earlier messages hidden for performance ...
                        </div>
                    )}
                    <AnimatePresence initial={false}>
                        {filteredLogs.slice(-100).map((log) => {
                            // Animation Logic
                            const isNewLog = log.timestamp > mountTimeRef.current;

                            // System/Info Messages - Centered Notification Style
                            if (log.type === 'INFO' || log.type === 'ERROR') {
                                const content = formatData(log.data, 'text', encoding);

                                // Determine style based on content/type
                                let styleClass = "bg-[#1e1e1e] text-[#666] border-[#333]";
                                if (log.type === 'ERROR') {
                                    styleClass = "bg-red-900/20 text-red-400 border-red-500/30";
                                } else if (content.includes('Open') || content.includes('Connected') || content.includes('Restored')) {
                                    styleClass = "bg-green-900/20 text-green-400 border-green-500/30 font-bold";
                                } else if (content.includes('Close') || content.includes('Disconnected') || content.includes('Error')) {
                                    styleClass = "bg-red-900/20 text-red-400 border-red-500/30";
                                } else {
                                    styleClass = "bg-gray-800/40 text-gray-400 border-gray-600/30";
                                }

                                return (
                                    <div key={log.id} className="flex justify-center my-2">
                                        <span className={`px-4 py-1 rounded-full text-xs font-medium border shadow-sm ${styleClass}`}>
                                            {content}
                                        </span>
                                    </div>
                                );
                            }

                            // Standard Data Logs (TX/RX)
                            const variants = {
                                hidden: { opacity: 0, x: -20 },
                                visible: {
                                    opacity: 1,
                                    x: 0,
                                    transition: { duration: 0.15, ease: "easeOut" as any }
                                }
                            };

                            return (
                                <motion.div
                                    key={log.id}
                                    layout={smoothScroll ? "position" : undefined}
                                    initial={smoothScroll && isNewLog ? "hidden" : false}
                                    animate={smoothScroll ? "visible" : undefined}
                                    variants={variants}
                                    transition={{
                                        // Layout transition: fast and smooth, no bounce to prevent "jelly" effect on fast streams
                                        layout: { duration: 0.15, ease: "circOut" as any },
                                        // Opacity/Transform transition
                                        default: { duration: 0.15, ease: "easeOut" as any }
                                    }}
                                    id={`log-${log.id}`}
                                    className={`flex items-start gap-1.5 mb-1 hover:bg-[#2a2d2e] rounded-sm px-1.5 py-0.5 group relative ${isNewLog ? 'animate-flash-new' : ''} ${log.crcStatus === 'error' ? 'bg-[#4b1818]/20 border border-[#f48771]' : 'border border-transparent'} ${contextMenu?.log === log ? 'bg-[#04395e]/40 ring-1 ring-[#04395e]' : ''} ${activeMatch?.logId === log.id ? 'bg-[#623315]/40 ring-1 ring-[#623315]' : ''}`}
                                    style={{
                                        fontSize: 'inherit',
                                        fontFamily: 'inherit',
                                        // @ts-ignore - CSS variables for animation
                                        '--flash-color': 'rgba(0, 122, 204, 0.25)'
                                    }}
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
                                                {log.type === 'TX' ? 'TX' : log.type === 'RX' ? 'RX' : 'SYS'}
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
                                        {(() => {
                                            const text = formatData(log.data, viewMode, encoding);
                                            const logMatches = matches.filter(m => m.logId === log.id);
                                            if (logMatches.length === 0) return text;

                                            // Sort matches to process from start to end
                                            const sortedMatches = [...logMatches].sort((a, b) => a.startIndex - b.startIndex);

                                            const result: React.ReactNode[] = [];
                                            let lastIndex = 0;

                                            sortedMatches.forEach((match, i) => {
                                                // Add text before match
                                                if (match.startIndex > lastIndex) {
                                                    result.push(text.substring(lastIndex, match.startIndex));
                                                }
                                                // Add highlighted text
                                                const isActive = activeMatch === match;
                                                result.push(
                                                    <span
                                                        key={`${log.id}-match-${i}`}
                                                        className={isActive ? 'bg-[#ff9632] text-black' : 'bg-[#623315]'}
                                                    >
                                                        {text.substring(match.startIndex, match.endIndex)}
                                                    </span>
                                                );
                                                lastIndex = match.endIndex;
                                            });

                                            // Add remaining text
                                            if (lastIndex < text.length) {
                                                result.push(text.substring(lastIndex));
                                            }

                                            return result;
                                        })()}
                                    </span>
                                    {log.crcStatus === 'error' && (
                                        <span className="ml-2 text-[10px] text-[#f48771] bg-[#4b1818] px-1.5 rounded border border-[#f48771]/30">
                                            CRC Error
                                        </span>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                    {/* Anchor for auto-scroll */}
                    <div ref={(el) => {
                        if (el && autoScroll) {
                            el.scrollIntoView({ behavior: 'auto' });
                        }
                    }} />

                </div>
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
            {
                contextMenu && (
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
                )
            }

            {
                showCommandEditor && (
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
                )
            }
        </div >
    );
};
