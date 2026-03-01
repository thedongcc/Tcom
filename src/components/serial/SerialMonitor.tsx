import { useRef, useState, useEffect, useCallback, useLayoutEffect, memo } from 'react';
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
import { useSystemMessage } from '../../hooks/useSystemMessage';
import { Tooltip } from '../common/Tooltip';

interface SerialMonitorProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onSend?: (data: string | Uint8Array) => void;
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void;
    onInputStateChange?: (inputState: any) => void;
    onClearLogs?: () => void;
    onConnectRequest?: () => Promise<boolean | void> | void;
}

// Memoized Log Item Component
const LogItem = memo(({
    log,
    isNewLog,
    viewMode,
    encoding,
    showTimestamp,
    showPacketType,
    showDataLength,
    onContextMenu,
    formatData,
    formatTimestamp,
    getDataLengthText,
    timestampFormat,
    matches = [],
    activeMatch = null,
    mergeRepeats = true,
    flashNewMessage,
    fontSize = 15,
    rxCRC,
    crcEnabled
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
                    className={isActive ? 'bg-[#ff9632] text-black shadow-sm' : 'bg-[#623315] text-[var(--app-foreground)]'}
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
            id={`log-${log.id}`}
            className={`flex items-start gap-1.5 mb-1 hover:bg-[var(--list-hover-background)] rounded-sm px-1.5 py-0.5 group relative ${(isNewLog && flashNewMessage && log.crcStatus !== 'error') ? 'animate-flash-new' : ''
                } ${log.crcStatus === 'error' ? 'bg-[var(--st-error-text)]/10 border border-[var(--st-error-text)]/30 dark:bg-[var(--st-error-text)]/10 dark:border-[var(--st-error-text)]/50' : 'border border-transparent'
                }`}
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
                        <span className="text-[#999] font-mono opacity-90 tabular-nums tracking-tight">
                            [{formatTimestamp(log.timestamp, timestampFormat || 'HH:mm:ss.SSS').trim()}]
                        </span>
                    )}
                </div>
            )}
            <div className="flex items-center gap-1.5 shrink-0" style={{ height: `${lineHeightPx}px` }}>
                {showPacketType && (
                    <span className={`flex items-center justify-center font-bold font-mono select-none px-[0.4em] rounded-[0.2em] min-w-[2.8em] text-[0.8em] leading-none shadow-sm tracking-wide pt-[1px]
                    ${log.type === 'TX' ? 'bg-[var(--button-background)]/30 text-[var(--app-foreground)] border border-[var(--button-background)]/40' :
                            log.type === 'RX' ? 'bg-[var(--st-rx-label)]/30 text-[var(--app-foreground)] border border-[var(--st-rx-label)]/40' :
                                'bg-white/5 text-[#cccccc] border border-white/10'
                        }`}
                        style={{ height: `${itemHeightPx}px` }}
                    >
                        {log.type === 'TX' ? 'TX' : log.type === 'RX' ? 'RX' : 'SYS'}
                    </span>
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
            <span className={`whitespace-pre-wrap break-all select-text cursor-text flex-1 ${log.type === 'TX' ? 'text-[var(--st-tx-text)]' :
                log.type === 'RX' ? 'text-[var(--st-rx-text)]' :
                    log.type === 'ERROR' ? 'text-[var(--st-error-text)]' :
                        'text-[var(--st-info-text)]'
                }`}>
                {renderHighlightedText(log, formatData(log.data, viewMode, encoding))}
            </span>
            {log.crcStatus === 'error' && (
                <span
                    className="ml-2 text-[10px] text-red-600 bg-red-900 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-900/50 px-1.5 rounded border flex items-center shrink-0 font-bold"
                    style={{ height: `${itemHeightPx}px` }}
                >
                    CRC Error
                </span>
            )}
            {log.commandName && (() => {
                const parts = log.commandName.split('::::');
                const cmdName = parts[0];
                const cmdGroup = parts[1];
                const titleStr = cmdGroup ? `${cmdGroup}:${cmdName}` : cmdName;
                return (
                    <Tooltip content={titleStr} position="top" wrapperClassName="ml-2 flex items-center shrink-0">
                        <span
                            className="text-[11px] text-[var(--app-foreground)] max-w-[200px] truncate select-none bg-[rgba(128,128,128,0.1)] px-1.5 rounded-[3px] cursor-default"
                            style={{ height: `${itemHeightPx}px` }}
                        >
                            {cmdName}
                        </span>
                    </Tooltip>
                );
            })()}
        </div>
    );
});

const scrollPositions = new Map<string, number>();

export const SerialMonitor = ({ session, onShowSettings, onSend, onUpdateConfig, onInputStateChange, onClearLogs, onConnectRequest }: SerialMonitorProps) => {
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { t } = useI18n();
    const { parseSystemMessage } = useSystemMessage();
    const { logs, isConnected, config } = session;
    const currentPort = config.type === 'serial' ? config.connection.path : '';
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length); // Track log count at mount to skip flash on tab switch
    const mountTimeRef = useRef(Date.now()); // Track mount time for animation logic

    const uiState = (config as any).uiState || {};
    console.log('SerialMonitor: uiState loaded', { sessionId: session.id, inputHTML: uiState.inputHTML, inputContent: uiState.inputContent });

    // Display Settings State - Initialize from uiState
    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'both'>(uiState.viewMode || 'hex');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showPacketType, setShowPacketType] = useState(uiState.showPacketType !== undefined ? uiState.showPacketType : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>(uiState.encoding || 'utf-8');
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || 15);

    // Sync fontSize with global theme when not overridden locally
    /* useEffect(() => {
        if (uiState.fontSize === undefined) {
             // 由于系统设置已移除 fontSize，此处回退到硬编码 15
            setFontSize(15);
        }
    }, [uiState.fontSize]); */
    const [fontFamily, setFontFamily] = useState<'mono' | 'consolas' | 'courier' | 'AppCoreFont'>(uiState.fontFamily || 'AppCoreFont');
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [flashNewMessage, setFlashNewMessage] = useState(uiState.flashNewMessage !== false);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showCRCPanel, setShowCRCPanel] = useState(false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    // Search State
    const [searchOpen, setSearchOpen] = useState(uiState.searchOpen || false);

    const [availableFonts, setAvailableFonts] = useState<any[]>([]);
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
    const txBytes = session.txBytes || 0;
    const rxBytes = session.rxBytes || 0;

    const formatData = useCallback((data: string | Uint8Array, mode: 'text' | 'hex' | 'both', enc: string) => {
        let hexStr = '';
        let textStr = '';

        if (mode === 'hex' || mode === 'both') {
            if (typeof data === 'string') {
                const encoder = new TextEncoder();
                const bytes = encoder.encode(data);
                hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            } else {
                hexStr = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            }
        }

        if (mode === 'text' || mode === 'both') {
            if (typeof data === 'string') {
                textStr = data;
            } else {
                try {
                    textStr = new TextDecoder(enc).decode(data);
                } catch (e) {
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

    // Search Logic
    const {
        query, setQuery, isRegex, setIsRegex, matchCase, setMatchCase, matches, currentIndex, nextMatch, prevMatch, regexError, activeMatchRev
    } = useLogSearch(logs, uiState.searchOpen ? (uiState.searchQuery || '') : '', uiState.searchRegex || false, uiState.searchMatchCase || false, viewMode, formatData, encoding);

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

    const activeMatch = matches[currentIndex];

    // Scroll to active match when user explicitly navigates
    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }, [activeMatchRev]);

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
        return `${length}B`;
    };

    const prevLogsRef = useRef(logs);
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

    const fontFamilyClass = fontFamily === 'consolas' ? 'font-[Consolas]' : fontFamily === 'courier' ? 'font-[Courier]' : fontFamily === 'AppCoreFont' ? 'font-[AppCoreFont]' : 'font-mono';

    const handleInputStateChange = useCallback((state: { content: string, html: string, tokens: any, mode: 'text' | 'hex', lineEnding: string, timerInterval: number }) => {
        // Prevent update if content hasn't changed (simple check)
        // Note: tokens might be complex object, deep comparison might be heavy. 'inputHTML' usually changes if visual changes.
        // We will trust the callback for now but stabilization helps.
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens,
            inputMode: state.mode,
            lineEnding: state.lineEnding,
            inputTimerInterval: state.timerInterval
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
            mode: viewMode === 'text' ? 'text' : 'hex',
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
            className="absolute inset-0 flex flex-col bg-[var(--app-background)] bg-cover bg-center"
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
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--sidebar-background)] shrink-0">
                {/* ... existing toolbar code ... */}
                <div className="text-sm font-medium text-[var(--app-foreground)] flex items-center gap-2">
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
                    <div className="flex items-center border border-[var(--widget-border-color)] rounded-[3px] divide-x divide-[var(--widget-border-color)] overflow-hidden h-[26px] bg-[rgba(128,128,128,0.1)]">
                        <Tooltip content={filterMode === 'tx' ? t('monitor.cancelFilter') : t('monitor.filterTxOnly')} position="bottom">
                            <div
                                className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-sm' : 'hover:bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)] bg-transparent'}`}
                                onClick={() => toggleFilter('tx')}
                            >
                                <span className="text-[11px] font-bold font-mono opacity-70">T:</span>
                                <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{txBytes.toLocaleString()}</span>
                            </div>
                        </Tooltip>
                        <Tooltip content={filterMode === 'rx' ? t('monitor.cancelFilter') : t('monitor.filterRxOnly')} position="bottom">
                            <div
                                className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-emerald-500 text-white shadow-sm' : 'hover:bg-[var(--button-secondary-hover-background)] text-[var(--app-foreground)] bg-transparent'}`}
                                onClick={() => toggleFilter('rx')}
                            >
                                <span className="text-[11px] font-bold font-mono opacity-70">R:</span>
                                <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{rxBytes.toLocaleString()}</span>
                            </div>
                        </Tooltip>
                    </div>
                    {/* Mode Toggle & Options Group */}
                    <div className="flex items-center gap-1.5">
                        {/* Hex/Text Display Mode */}
                        <div className="flex items-center gap-0.5 p-0.5 rounded-[3px] border border-[var(--widget-border-color)] bg-[rgba(128,128,128,0.1)] h-[26px]">
                            <button
                                className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === 'hex' || viewMode === 'both' ? 'bg-[var(--button-background)] text-[var(--button-foreground)] shadow-sm' : 'text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)]'}`}
                                onClick={() => {
                                    if (viewMode === 'hex') return; // Cannot unselect the only active mode
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
                                    if (viewMode === 'text') return; // Cannot unselect the only active mode
                                    const newMode = viewMode === 'both' ? 'hex' : 'both';
                                    setViewMode(newMode);
                                    saveUIState({ viewMode: newMode });
                                }}
                            >
                                TXT
                            </button>
                        </div>


                        {/* Options Menu Button and Panel */}
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
                                    <div className="absolute right-0 top-full mt-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded-[3px] shadow-2xl p-3 z-50 min-w-[260px]">
                                        <div className="flex items-center justify-between mb-4 pb-1 border-b border-[var(--menu-border-color)]">
                                            <div className="text-[12px] text-[var(--app-foreground)] font-bold">{t('monitor.logSettings')}</div>
                                            <X size={14} className="cursor-pointer text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)]" onClick={() => setShowOptionsMenu(false)} />
                                        </div>

                                        {/* Encoding Section */}
                                        <div className="mb-4 px-1">
                                            <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider">
                                                <span>{t('monitor.encoding')}</span>
                                                <div className="h-[1px] bg-[var(--menu-border-color)] flex-1" />
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
                                            <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider">
                                                <span>{t('monitor.logFeatures')}</span>
                                                <div className="h-[1px] bg-[var(--menu-border-color)] flex-1" />
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
                                                    label={t('monitor.flashNewMessage')}
                                                    checked={flashNewMessage}
                                                    onChange={(checked) => { setFlashNewMessage(checked); saveUIState({ flashNewMessage: checked }); }}
                                                />

                                                {/* CRC */}
                                                <div className="space-y-2 pt-1 border-t border-[var(--menu-border-color)] mt-1">
                                                    <div className="flex items-center gap-2 group/crc">
                                                        <Switch
                                                            label={t('monitor.crcCheck')}
                                                            checked={crcEnabled}
                                                            onChange={toggleCRC}
                                                            className="flex-1"
                                                        />
                                                        <Tooltip content={t('monitor.crcConfig')} position="bottom">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setShowCRCPanel(!showCRCPanel); }}
                                                                className={`p-1 rounded hover:bg-[var(--list-hover-background)] text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors flex-shrink-0 ${showCRCPanel ? 'bg-[var(--button-background)] text-[var(--button-foreground)]' : ''}`}
                                                            >
                                                                <Settings size={12} />
                                                            </button>
                                                        </Tooltip>
                                                    </div>

                                                    {showCRCPanel && (
                                                        <div className="bg-[rgba(128,128,128,0.05)] border border-[var(--border-color)] rounded p-2.5 space-y-3 mt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="text-[10px] text-[var(--input-placeholder-color)] font-medium">{t('monitor.algorithm')}:</span>
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
                                                                <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] font-medium">{t('monitor.startOffset')}:</span>
                                                                <input
                                                                    type="number"
                                                                    className="w-full bg-[var(--input-background)] border border-[var(--input-border-color)] text-[11px] text-[var(--input-foreground)] rounded-sm outline-none px-2 py-1 focus:border-[var(--focus-border-color)]"
                                                                    value={rxCRC.startIndex}
                                                                    onChange={(e) => updateRxCRC({ startIndex: parseInt(e.target.value) || 0 })}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] font-medium">{t('monitor.endPosition')}:</span>
                                                                <CustomSelect
                                                                    items={[
                                                                        { label: t('monitor.crcEndPacket'), value: '0' },
                                                                        { label: t('monitor.crcExclude1'), value: '-1' },
                                                                        { label: t('monitor.crcExclude2'), value: '-2' },
                                                                        { label: t('monitor.crcExclude3'), value: '-3' }
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
                                            <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider">
                                                <span>{t('monitor.typography')}</span>
                                                <div className="h-[1px] bg-[var(--menu-border-color)] flex-1" />
                                            </div>
                                            <div className="space-y-4">
                                                {/* Font Size */}
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[11px] text-[var(--activitybar-inactive-foreground)]">{t('monitor.fontSize')}:</span>
                                                    <CustomSelect
                                                        items={[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map(size => ({
                                                            label: `${size}px`,
                                                            value: size.toString()
                                                        }))}
                                                        value={fontSize.toString()}
                                                        onChange={(val) => { const size = Number(val); setFontSize(size); saveUIState({ fontSize: size }); }}
                                                    />
                                                </div>

                                                {/* Font FontFamily */}

                                                {/* Font Family */}
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[11px] text-[var(--activitybar-inactive-foreground)]">{t('monitor.fontFamily')}:</span>
                                                    <CustomSelect
                                                        items={availableFonts}
                                                        value={fontFamily}
                                                        onChange={(val) => { setFontFamily(val as any); saveUIState({ fontFamily: val as any }); }}
                                                    />
                                                </div>

                                                {/* Chunk Timeout */}
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[11px] text-[var(--activitybar-inactive-foreground)]">{t('monitor.packetTimeout')}:</span>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-[var(--input-background)] border border-[var(--input-border-color)] text-[11px] text-[var(--input-foreground)] rounded-sm outline-none px-2 py-1.5 focus:border-[var(--focus-border-color)] transition-colors"
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
                        <Tooltip content={autoScroll ? t('monitor.autoScrollOn') : t('monitor.autoScrollOff')} position="bottom">
                            <button
                                className={`w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors ${autoScroll ? 'text-[var(--button-foreground)] bg-[var(--button-background)] shadow-sm' : 'text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)] bg-[rgba(128,128,128,0.1)] border border-[var(--widget-border-color)]'}`}
                                onClick={() => {
                                    const newState = !autoScroll;
                                    setAutoScroll(newState);
                                    saveUIState({ autoScroll: newState });
                                    if (newState && scrollRef.current) {
                                        requestAnimationFrame(() => {
                                            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                                        });
                                    }
                                }}
                            >
                                <ArrowDownToLine size={14} />
                            </button>
                        </Tooltip>
                        <Tooltip content={t('monitor.clearLogs')} position="bottom">
                            <button
                                className="w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors text-[var(--app-foreground)] hover:bg-[var(--button-secondary-hover-background)] bg-[rgba(128,128,128,0.1)] border border-[var(--widget-border-color)]"
                                onClick={handleClearLogs}
                            >
                                <Trash2 size={14} />
                            </button>
                        </Tooltip>
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
                        encoding={encoding}
                        regexError={regexError}
                    />
                </div>
                <div
                    className="absolute inset-0 overflow-auto p-4"
                    style={{
                        fontSize: `${fontSize}px`,
                        fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)'),
                        lineHeight: `${Math.floor(fontSize * 1.5)}px`
                    }}
                    ref={scrollRef}
                    onScroll={(e) => { if (!autoScroll) scrollPositions.set(session.id, e.currentTarget.scrollTop); }}
                >
                    {filteredLogs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-[#666]">
                            <p>No data</p>
                        </div>
                    )}
                    {filteredLogs.map((log, index) => {
                        const isNewLog = flashNewMessage && (index >= initialLogCountRef.current || log.timestamp > mountTimeRef.current);

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
                                rxCRC={rxCRC}
                                crcEnabled={crcEnabled}
                            />
                        );
                    })}

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
                initialLineEnding={uiState.lineEnding ?? ''}
                initialTimerInterval={uiState.inputTimerInterval}
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
