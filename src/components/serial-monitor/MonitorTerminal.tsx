import { useState, useRef, useEffect, useCallback } from 'react';
import { SessionState, MonitorSessionConfig } from '../../types/session';
import { ArrowRight, ArrowLeft, Monitor, Cpu, Trash2, Menu, X, Check, Download, Settings, Copy, FileText, ClipboardList, Filter } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCommandContext } from '../../context/CommandContext';
import { ContextMenu } from '../common/ContextMenu';
import { CommandEditorDialog } from '../commands/CommandEditorDialog';
import { SerialInput } from '../serial/SerialInput';
import { TokenConfigPopover } from '../serial/TokenConfigPopover';
import { motion, AnimatePresence } from 'framer-motion';

interface MonitorTerminalProps {
    session: SessionState;
    onShowSettings: () => void;
}

export const MonitorTerminal = ({ session, onShowSettings }: MonitorTerminalProps) => {
    const config = session.config as MonitorSessionConfig;
    const { virtualSerialPort, physicalSerialPort } = config;
    const sessionManager = useSession();
    const { config: themeConfig } = useSettings();
    const { showToast } = useToast();
    const { logs, isConnected } = session;

    // UI State
    const uiState = config.uiState || {};
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
    const [sendTarget, setSendTarget] = useState<'virtual' | 'physical'>('physical');

    const scrollRef = useRef<HTMLDivElement>(null);
    const mountTimeRef = useRef(Date.now());
    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);

    // Save UI state (Stable reference because sessionManager is from context)
    const saveUIState = useCallback((updates: any) => {
        sessionManager.updateSessionConfig(session.id, { uiState: { ...uiState, ...updates } });
    }, [session.id, sessionManager, uiState]);

    // Helpers
    const formatData = (data: string | Uint8Array, mode: 'text' | 'hex', encoding: string) => {
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
            const decoder = new TextDecoder(encoding);
            return decoder.decode(data);
        } catch (e) {
            return `[Decode Error: ${e}]`;
        }
    };

    // Auto scroll
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const handleSend = (data: string | Uint8Array, mode: 'text' | 'hex') => {
        if (!isConnected) {
            showToast('Please connect first', 'error');
            return;
        }
        sessionManager.writeToMonitor(session.id, sendTarget, data);
    };

    const handleInputStateChange = (state: any) => {
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens,
            inputMode: state.mode,
            lineEnding: state.lineEnding
        });
    };

    // Filter logs
    const filteredLogs = logs.filter(log => {
        if (filterMode === 'all') return true;
        if (filterMode === 'rx') return log.topic === 'physical';
        if (filterMode === 'tx') return log.topic === 'virtual';
        return true;
    });

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-bg)] text-[var(--vscode-fg)] font-sans select-none relative overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--vscode-border)] bg-[var(--vscode-header-bg)] shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => { setViewMode('text'); saveUIState({ viewMode: 'text' }); }}
                            className={`px-2 py-0.5 text-xs font-medium rounded sm ${viewMode === 'text' ? 'bg-[var(--vscode-active-bg)] text-[var(--vscode-active-fg)]' : 'hover:bg-[var(--vscode-hover-bg)]'}`}
                        >
                            Text
                        </button>
                        <button
                            onClick={() => { setViewMode('hex'); saveUIState({ viewMode: 'hex' }); }}
                            className={`px-2 py-0.5 text-xs font-medium rounded sm ${viewMode === 'hex' ? 'bg-[var(--vscode-active-bg)] text-[var(--vscode-active-fg)]' : 'hover:bg-[var(--vscode-hover-bg)]'}`}
                        >
                            Hex
                        </button>
                    </div>

                    <div className="h-4 w-px bg-[var(--vscode-border)]" />

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => { setFilterMode('all'); saveUIState({ filterMode: 'all' }); }}
                            className={`px-2 py-0.5 text-xs font-medium rounded sm ${filterMode === 'all' ? 'bg-[var(--vscode-active-bg)] text-[var(--vscode-active-fg)]' : 'hover:bg-[var(--vscode-hover-bg)]'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => { setFilterMode('rx'); saveUIState({ filterMode: 'rx' }); }}
                            className={`px-2 py-0.5 text-xs font-medium rounded sm ${filterMode === 'rx' ? 'bg-[var(--vscode-active-bg)] text-[var(--vscode-active-fg)]' : 'hover:bg-[var(--vscode-hover-bg)]'}`}
                        >
                            Device
                        </button>
                        <button
                            onClick={() => { setFilterMode('tx'); saveUIState({ filterMode: 'tx' }); }}
                            className={`px-2 py-0.5 text-xs font-medium rounded sm ${filterMode === 'tx' ? 'bg-[var(--vscode-active-bg)] text-[var(--vscode-active-fg)]' : 'hover:bg-[var(--vscode-hover-bg)]'}`}
                        >
                            App
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => sessionManager.clearLogs(session.id)}
                        className="p-1 rounded hover:bg-[var(--vscode-hover-bg)] text-[var(--vscode-icon-fg)]"
                        title="Clear Logs"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        onClick={onShowSettings}
                        className="p-1 rounded hover:bg-[var(--vscode-hover-bg)] text-[var(--vscode-icon-fg)]"
                        title="Monitor Settings"
                    >
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            {/* Logs Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-2 font-mono"
                style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' : fontFamily }}
            >
                {filteredLogs.map((log, i) => {
                    const isApp = log.topic === 'virtual';
                    const colorClass = isApp ? 'text-blue-400' : 'text-green-400';
                    const prefix = isApp ? 'APP' : 'DEV';

                    return (
                        <div key={log.id} className="group relative py-0.5 flex items-start gap-3 hover:bg-[var(--vscode-hover-bg)] rounded px-1 -mx-1 transition-colors">
                            {showTimestamp && (
                                <span className="opacity-40 shrink-0 w-[80px] text-[0.85em] pt-0.5">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            )}
                            <span className={`shrink-0 w-8 font-bold font-mono text-center flex items-center justify-center rounded border border-current scale-90 ${colorClass} opacity-80`} style={{ fontSize: '10px', height: '16px' }}>
                                {prefix}
                            </span>
                            <div className="flex-1 overflow-hidden">
                                <span className={`whitespace-pre-wrap ${viewMode === 'hex' ? 'break-all' : ''}`}>
                                    {formatData(log.data, viewMode, encoding)}
                                </span>
                                {log.repeatCount && log.repeatCount > 1 && (
                                    <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-[var(--vscode-active-bg)] text-[var(--vscode-active-fg)] rounded-full opacity-80">
                                        x{log.repeatCount}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Input Area */}
            <div className="border-t border-[var(--vscode-border)] bg-[var(--vscode-bg)] shrink-0 p-2">
                <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex items-center gap-1 bg-[#2d2d2e] rounded-sm px-1 py-0.5 select-none shrink-0 border border-white/5">
                        <button
                            onClick={() => setSendTarget('physical')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-all duration-200 ${sendTarget === 'physical' ? 'bg-[#007acc] text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            To Device
                        </button>
                        <button
                            onClick={() => setSendTarget('virtual')}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-all duration-200 ${sendTarget === 'virtual' ? 'bg-[#007acc] text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            To App
                        </button>
                    </div>
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
                    onConnectRequest={() => { }}
                />
            </div>
        </div>
    );
};
