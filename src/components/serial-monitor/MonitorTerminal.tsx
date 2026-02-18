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
    FileText
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
import { SessionState, MonitorSessionConfig } from '../../types/session';

interface MonitorTerminalProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onConnectRequest?: () => Promise<boolean>;
}

// Memoized Log Item Component - Defined OUTSIDE to maintain stable component identity
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
    timestampFormat
}: any) => {
    if (log.type === 'INFO' || log.type === 'ERROR') {
        const content = formatData(log.data, 'text', encoding).trim();
        let style = "bg-gray-800/40 text-gray-400 border-gray-600/30";
        if (log.type === 'ERROR') {
            style = "bg-red-900/40 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]";
        } else if (content.includes('Internal Bridge Port')) {
            // 蓝色系用于内部桥接端口
            style = "bg-blue-600/20 text-blue-400 border-blue-500/30 font-semibold";
        } else if (content.includes('Physical Device')) {
            // 青色系用于物理设备
            style = "bg-emerald-600/20 text-emerald-400 border-emerald-500/30 font-semibold";
        } else if (content.includes('Started') || content.includes('Restored') || content.includes('Monitor started')) {
            style = "bg-green-600/20 text-green-400 border-green-500/30 font-bold";
        }
        return (
            <div className="flex justify-center my-2 gap-2 items-center">
                <span className={`px-4 py-1 rounded-full text-xs font-medium border shadow-sm transition-all duration-300 ${style}`}>
                    {content}
                </span>
                {log.repeatCount && log.repeatCount > 1 && (
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
                    {log.repeatCount && log.repeatCount > 1 && (
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
                {formatData(log.data, viewMode, encoding)}
            </span>
        </motion.div>
    );
});

export const MonitorTerminal = ({ session, onShowSettings, onConnectRequest }: MonitorTerminalProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const sessionManager = useSession();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const mountTimeRef = useRef(Date.now());

    const uiState = (config as any).uiState || {};

    // UI State initialization
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
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    const [sendTarget, setSendTarget] = useState<'virtual' | 'physical'>(uiState.sendTarget || 'physical');

    // Font Selection Logic
    const [showAllFonts, setShowAllFonts] = useState(uiState.showAllFonts || false);
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);
    const [partnerConnected, setPartnerConnected] = useState(true);

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
        if (!isConnected || !(window as any).monitorAPI) return;
        const cleanup = (window as any).monitorAPI.onPartnerStatus(session.id, (connected: boolean) => {
            setPartnerConnected(connected);
        });
        return cleanup;
    }, [isConnected, session.id]);

    useEffect(() => {
        if (showAllFonts) {
            if ((window as any).queryLocalFonts) {
                (window as any).queryLocalFonts().then((fonts: any[]) => {
                    const uniqueFonts = Array.from(new Set(fonts.map((f: any) => f.fullName)))
                        .map(name => fonts.find((f: any) => f.fullName === name))
                        .sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));
                    setAvailableFonts(uniqueFonts);
                }).catch((e: any) => console.error('Failed to query local fonts:', e));
            }
        }
    }, [showAllFonts]);

    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);

    const saveUIState = useCallback((updates: any) => {
        const currentUIState = (configRef.current as any).uiState || {};
        const hasChanges = Object.keys(updates).some(k =>
            JSON.stringify(updates[k]) !== JSON.stringify(currentUIState[k])
        );
        if (!hasChanges) return;
        sessionManager.updateSessionConfig(session.id, { uiState: { ...currentUIState, ...updates } } as any);
    }, [session.id, sessionManager]);

    // Performance: Rate detection for adaptive animation
    const [isHighRate, setIsHighRate] = useState(false);
    const lastRateCheckRef = useRef({ time: Date.now(), count: logs.length });

    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            const currentCount = logs.length;
            const deltaCount = currentCount - lastRateCheckRef.current.count;
            const deltaTime = (now - lastRateCheckRef.current.time) / 1000;

            if (deltaTime > 0) {
                const rate = deltaCount / deltaTime;
                setIsHighRate(rate > 20);
            }

            lastRateCheckRef.current = { time: now, count: currentCount };
        }, 1000);
        return () => clearInterval(timer);
    }, [logs.length]);

    const effectiveSmooth = smoothScroll && !isHighRate;

    // Memoized filters and stats
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (filterMode === 'rx') return log.topic === 'physical';
            if (filterMode === 'tx') return log.topic === 'virtual';
            return true;
        });
    }, [logs, filterMode]);

    const txBytes = useMemo(() => {
        return logs.reduce((acc, log) => {
            const count = log.repeatCount || 1;
            // 虚拟串口统计：数据由虚拟侧（App）发出进入 Tcom
            // 标记为 type: 'TX', topic: 'virtual', crcStatus: 'ok'
            const isFromVirtual = log.type === 'TX' && log.topic === 'virtual' && log.crcStatus === 'ok';

            if (isFromVirtual) {
                const bytes = typeof log.data === 'string' ? new TextEncoder().encode(log.data).length : log.data.length;
                return acc + (bytes * count);
            }
            return acc;
        }, 0);
    }, [logs]);

    const rxBytes = useMemo(() => {
        return logs.reduce((acc, log) => {
            const count = log.repeatCount || 1;
            // 物理串口统计：数据由物理侧（设备）发出进入 Tcom
            // 标记为 type: 'RX', topic: 'physical', crcStatus: 'ok'
            const isFromPhysical = log.type === 'RX' && log.topic === 'physical' && log.crcStatus === 'ok';

            if (isFromPhysical) {
                const bytes = typeof log.data === 'string' ? new TextEncoder().encode(log.data).length : log.data.length;
                return acc + (bytes * count);
            }
            return acc;
        }, 0);
    }, [logs]);

    const handleClearLogs = () => sessionManager.clearLogs(session.id);

    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex', encoding: string) => {
        if (mode === 'hex') {
            if (typeof data === 'string') {
                const bytes = new TextEncoder().encode(data);
                return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            }
            return Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }
        if (typeof data === 'string') return data;
        try {
            return new TextDecoder(encoding).decode(data);
        } catch (e) {
            return new TextDecoder().decode(data);
        }
    }, []);

    const getDataLengthText = useCallback((data: string | Uint8Array) => {
        let length = (typeof data === 'string') ? new TextEncoder().encode(data).length : data.length;
        return `[${length}B]`;
    }, []);

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

    useEffect(() => {
        if (scrollRef.current && autoScroll) {
            requestAnimationFrame(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            });
        }
    }, [logs, autoScroll]);

    const handleSend = (data: string | Uint8Array, mode: 'text' | 'hex') => {
        if (!isConnected) {
            showToast('Please connect first', 'error');
            return;
        }
        let finalData: string | Uint8Array = data;
        if (mode === 'hex' && typeof data === 'string') {
            const cleanHex = data.replace(/\s+/g, '');
            if (cleanHex.length % 2 === 0) {
                const byteArray = new Uint8Array(cleanHex.length / 2);
                for (let i = 0; i < cleanHex.length; i += 2) {
                    byteArray[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
                }
                finalData = byteArray;
            }
        }
        sessionManager.writeToMonitor(session.id, sendTarget, finalData);
    };

    const toggleFilter = (mode: 'tx' | 'rx') => {
        const newMode = filterMode === mode ? 'all' : mode;
        setFilterMode(newMode);
        saveUIState({ filterMode: newMode });
    };

    const handleInputStateChange = useCallback((state: any) => {
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens,
            inputMode: state.mode,
            lineEnding: state.lineEnding
        });
    }, [saveUIState]);

    const { addCommand, commands } = useCommandContext();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, log: any } | null>(null);
    const [showCommandEditor, setShowCommandEditor] = useState<any | null>(null);

    const handleLogContextMenu = useCallback((e: React.MouseEvent, log: any) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, log });
    }, []);

    const handleCopyLog = (log: any) => {
        const text = formatData(log.data, viewMode, encoding);
        navigator.clipboard.writeText(text);
        showToast('已复制到剪贴板', 'success', 1500);
        setContextMenu(null);
    };

    const handleAddToCommand = (log: any) => {
        const payload = formatData(log.data, viewMode, encoding);
        setShowCommandEditor({
            name: generateUniqueName(commands, 'command', undefined),
            payload: payload,
            mode: viewMode === 'hex' ? 'hex' : 'text',
            tokens: {},
            lineEnding: ''
        });
        setContextMenu(null);
    };

    const handleSaveCommand = (updates: any) => {
        addCommand({ ...updates, parentId: undefined });
        setShowCommandEditor(null);
    };

    return (
        <div
            className="absolute inset-0 flex flex-col bg-[var(--st-rx-bg)] bg-cover bg-center select-none"
            style={{ backgroundImage: 'var(--st-rx-bg-img)' }}
            onClick={() => setContextMenu(null)}
        >
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
                    @keyframes flash-new {
                        0% { background-color: var(--flash-color); }
                        100% { background-color: transparent; }
                    }
                    .animate-flash-new {
                        animation: flash-new 1s ease-out forwards;
                    }
                `}
            </style>

            {/* Toolbar - Clone of SerialMonitor */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2b2b2b] bg-[#252526] shrink-0">
                <div className="text-sm font-medium text-[#cccccc] flex items-center gap-2">
                    {isConnected ? (
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                    )}
                    <span className="opacity-80">Monitor: </span>
                    <span className="text-[#4daafc] font-bold">{(config as MonitorSessionConfig).virtualSerialPort}</span>
                    <span className="text-gray-600 px-1">⟷</span>
                    <span className="text-[#4ec9b0] font-bold">{(config as MonitorSessionConfig).connection?.path || 'No Device'}</span>
                    {isHighRate && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[9px] font-bold border border-orange-500/30 animate-pulse">
                            HIGH LOAD: AUTO-OPTIMIZING
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {/* Stats Display */}
                    <div className="flex items-center bg-[#1e1e1e]/80 border border-[#3c3c3c] rounded-sm divide-x divide-[#3c3c3c] overflow-hidden shadow-inner">
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[#007acc] text-white hover:bg-[#0062a3]' : 'hover:bg-[#2a2d2e] bg-transparent'}`}
                            title="Click to filter APP only"
                            onClick={() => toggleFilter('tx')}
                        >
                            <span className={`text-[9px] font-bold font-mono tracking-tighter ${filterMode === 'tx' ? 'text-white/80' : 'text-[#aaaaaa]'}`}>{(config as MonitorSessionConfig).virtualSerialPort}:</span>
                            <span className={`text-[11px] font-bold font-mono tabular-nums leading-none ${filterMode === 'tx' ? 'text-white' : 'text-[#cccccc]'}`}>{txBytes.toLocaleString()}</span>
                        </div>
                        <div
                            className={`flex items-center gap-1.5 px-3 py-1 transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-[#4ec9b0] text-[#1e1e1e] hover:bg-[#3da892]' : 'hover:bg-[#2a2d2e] bg-transparent'}`}
                            title="Click to filter DEV only"
                            onClick={() => toggleFilter('rx')}
                        >
                            <span className={`text-[9px] font-bold font-mono tracking-tighter ${filterMode === 'rx' ? 'text-[#1e1e1e]/60' : 'text-[#aaaaaa]'}`}>{(config as MonitorSessionConfig).connection?.path || 'DEV'}:</span>
                            <span className={`text-[11px] font-bold font-mono tabular-nums leading-none ${filterMode === 'rx' ? 'text-[#1e1e1e]' : 'text-[#cccccc]'}`}>{rxBytes.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Mode Toggle & Options */}
                    <div className="flex items-center gap-1.5">
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

                        <div className="relative">
                            <button
                                className={`h-8 px-2 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-[#cccccc] transition-colors flex items-center gap-1.5 border border-transparent ${showOptionsMenu ? 'bg-[#3c3c3c] text-white' : ''}`}
                                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                            >
                                <Menu size={16} />
                                <span className="text-[11px] font-medium">Options</span>
                            </button>
                            {showOptionsMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                    <div className="absolute right-0 top-full mt-1 bg-[#2b2d2e] border border-[#3c3c3c] rounded-[3px] shadow-2xl p-3 z-50 min-w-[260px]">
                                        <div className="flex items-center justify-between mb-4 pb-1 border-b border-[#3c3c3c]">
                                            <div className="text-[12px] text-[#cccccc] font-bold">Monitor Settings</div>
                                            <X size={14} className="cursor-pointer text-[#969696] hover:text-white" onClick={() => setShowOptionsMenu(false)} />
                                        </div>

                                        <div className="space-y-4 px-1">
                                            {/* Encoding Section */}
                                            <div className="space-y-2.5">
                                                <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                                                    <span>Encoding</span>
                                                    <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
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
                                            <div className="space-y-2.5">
                                                <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                                                    <span>Log Features</span>
                                                    <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                                                </div>
                                                <Switch
                                                    label="Timestamp"
                                                    checked={showTimestamp}
                                                    onChange={(val) => { setShowTimestamp(val); saveUIState({ showTimestamp: val }); }}
                                                />
                                                <Switch
                                                    label="Packet Type"
                                                    checked={showPacketType}
                                                    onChange={(val) => { setShowPacketType(val); saveUIState({ showPacketType: val }); }}
                                                />
                                                <Switch
                                                    label="Data Length"
                                                    checked={showDataLength}
                                                    onChange={(val) => { setShowDataLength(val); saveUIState({ showDataLength: val }); }}
                                                />
                                                <Switch
                                                    label="Merge Repeats"
                                                    checked={mergeRepeats}
                                                    onChange={(val) => { setMergeRepeats(val); saveUIState({ mergeRepeats: val }); }}
                                                />
                                                <Switch
                                                    label="Smooth Animation"
                                                    checked={smoothScroll}
                                                    onChange={(val) => { setSmoothScroll(val); saveUIState({ smoothScroll: val }); }}
                                                />
                                            </div>

                                            {/* UI Settings Section */}
                                            <div className="space-y-2.5">
                                                <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-[#888888] uppercase tracking-wider">
                                                    <span>Appearance</span>
                                                    <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                                                </div>

                                                <div className="flex flex-col gap-1.5">
                                                    <span className="text-[11px] text-[#808080]">Font Size</span>
                                                    <CustomSelect
                                                        items={[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map(s => ({ label: `${s}px`, value: String(s) }))}
                                                        value={String(fontSize)}
                                                        onChange={(val) => { const v = Number(val); setFontSize(v); saveUIState({ fontSize: v }); }}
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1.5 pt-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[#808080]">Font Family</span>
                                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                checked={showAllFonts}
                                                                onChange={(e) => setShowAllFonts(e.target.checked)}
                                                                className="w-3 h-3 rounded border-[#3c3c3c] bg-[#1e1e1e] cursor-pointer"
                                                            />
                                                            <span className="text-[10px] text-[#666] group-hover:text-[#999] transition-colors">Show All</span>
                                                        </label>
                                                    </div>
                                                    <CustomSelect
                                                        items={[
                                                            ...defaultFonts,
                                                            ...(showAllFonts ? availableFonts.map(f => ({ label: f.fullName, value: f.fullName })) : [])
                                                        ]}
                                                        value={fontFamily}
                                                        onChange={(val) => { setFontFamily(val as any); saveUIState({ fontFamily: val }); }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="pt-2 border-t border-[#3c3c3c]">
                                                <button
                                                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[#007acc] hover:bg-[#0062a3] text-white text-[11px] rounded transition-colors shadow-sm"
                                                    onClick={() => { handleSaveLogs(); setShowOptionsMenu(false); }}
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
                    </div>

                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <button
                            className={`p-1 rounded ${autoScroll ? 'text-[#4ec9b0] bg-[#1e1e1e]' : 'text-[#969696] hover:text-[#cccccc]'}`}
                            onClick={() => { setAutoScroll(!autoScroll); saveUIState({ autoScroll: !autoScroll }); }}
                        >
                            <ArrowDownToLine size={14} />
                        </button>
                        <button className="p-1 hover:bg-[#3c3c3c] rounded text-[#969696]" onClick={handleClearLogs}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Partner Status Warning */}
            <AnimatePresence>
                {isConnected && !partnerConnected && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-amber-600/20 border-b border-amber-600/30 overflow-hidden shrink-0"
                    >
                        <div className="px-4 py-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-amber-400 text-xs">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span className="font-bold">Virtual Port Offline:</span>
                                <span className="opacity-90">对端程序尚未打开端口 <span className="text-white underline">{(config as MonitorSessionConfig).virtualSerialPort}</span>。发送的数据将积压在驱动中，并在对端打开后瞬间弹出。</span>
                            </div>
                            <button
                                className="px-2 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[10px] rounded transition-colors"
                                onClick={() => { setSendTarget('physical'); saveUIState({ sendTarget: 'physical' }); }}
                            >
                                Switch to Physical
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                    <div className="flex items-center justify-center h-full text-[#666]">
                        <p>No data</p>
                    </div>
                )}
                <AnimatePresence initial={false}>
                    {filteredLogs.slice(-400).map((log) => {
                        const isNewLog = log.timestamp > mountTimeRef.current;
                        return (
                            <LogItem
                                key={log.id}
                                log={log}
                                isNewLog={isNewLog}
                                effectiveSmooth={effectiveSmooth}
                                viewMode={viewMode}
                                encoding={encoding}
                                showTimestamp={showTimestamp}
                                showPacketType={showPacketType}
                                showDataLength={showDataLength}
                                virtualSerialPort={(config as MonitorSessionConfig).virtualSerialPort}
                                physicalPortPath={(config as MonitorSessionConfig).connection?.path || 'DEV'}
                                onContextMenu={handleLogContextMenu}
                                formatData={formatData}
                                formatTimestamp={formatTimestamp}
                                getDataLengthText={getDataLengthText}
                                timestampFormat={themeConfig.timestampFormat}
                            />
                        );
                    })}
                </AnimatePresence>
                <div ref={(el) => { if (el && autoScroll) el.scrollIntoView({ behavior: 'auto' }); }} />
            </div>

            {/* Input Area */}
            <div className="bg-[#1e1e1e] border-t border-[#2b2b2b]">
                <div className="flex items-center bg-[#2d2d2e]/30 px-3 py-1.5 border-y border-white/5 w-full gap-2">
                    <button
                        onClick={() => { setSendTarget('virtual'); saveUIState({ sendTarget: 'virtual' }); }}
                        className={`flex-1 py-1.5 text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-2 rounded-md ${sendTarget === 'virtual' ? 'bg-[#007acc] text-white shadow-[0_2px_8px_rgba(0,122,204,0.3)]' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                    >
                        <span className="text-[9px] opacity-70 font-black tracking-widest">[虚拟串口]</span>
                        <span>{(config as MonitorSessionConfig).virtualSerialPort}</span>
                    </button>
                    <button
                        onClick={() => { setSendTarget('physical'); saveUIState({ sendTarget: 'physical' }); }}
                        className={`flex-1 py-1.5 text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-2 rounded-md ${sendTarget === 'physical' ? 'bg-[#4ec9b0] text-[#0a2e26] shadow-[0_2px_8px_rgba(78,201,176,0.3)]' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                    >
                        <span className="text-[9px] opacity-70 font-black tracking-widest">[物理串口]</span>
                        <span>{(config as MonitorSessionConfig).connection?.path || '未连接'}</span>
                    </button>
                </div>
                <SerialInput
                    key={session.id}
                    onSend={handleSend}
                    initialContent={uiState.inputContent}
                    initialHTML={uiState.inputHTML}
                    initialTokens={uiState.inputTokens}
                    initialMode={uiState.inputMode || 'hex'}
                    initialLineEnding={uiState.lineEnding || '\r\n'}
                    onStateChange={handleInputStateChange}
                    isConnected={isConnected}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    onConnectRequest={async () => {
                        const success = await onConnectRequest?.();
                        if (success === false) {
                            onShowSettings?.('serial');
                        }
                    }}
                />
            </div>

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={[
                        { label: 'Copy', icon: <Copy size={13} />, onClick: () => handleCopyLog(contextMenu.log) },
                        { label: 'Add to Command', icon: <FileText size={13} />, onClick: () => handleAddToCommand(contextMenu.log) }
                    ]}
                />
            )}
            {showCommandEditor && (
                <CommandEditorDialog
                    item={{ id: 'new', type: 'command', ...showCommandEditor }}
                    onClose={() => setShowCommandEditor(null)}
                    onSave={handleSaveCommand}
                    existingNames={commands.filter(c => !c.parentId).map(c => c.name)}
                />
            )}
        </div>
    );
};
