/**
 * SerialMonitor.tsx
 * 串口监视器主组件。
 * 职责：组装工具栏、日志列表、搜索框、输入区域和上下文菜单。
 * 显示状态管理委托给 useSerialMonitorState，工具栏 UI 委托给 SerialMonitorToolbar。
 */
import { useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { SessionState, SessionConfig, LogEntry } from '../../types/session';
import { SerialInput } from './SerialInput';
import { Copy, FileText } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { ContextMenu } from '../common/ContextMenu';
import { CommandEditorDialog } from '../commands/CommandEditorDialog';
import { formatTimestamp } from '../../utils/format';
import { LogSearch, useLogSearch } from '../common/LogSearch';
import { useState } from 'react';
import { CommandEntity } from '../../types/command';
import { Token } from '../../types/token';
import { LogItem, SearchMatch } from './LogItem';
import { useSerialMonitorActions } from './useSerialMonitorActions';
import { useSerialMonitorState } from './useSerialMonitorState';
import { SerialMonitorToolbar } from './SerialMonitorToolbar';

interface SerialMonitorProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onSend?: (data: string | Uint8Array) => void;
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void;
    onInputStateChange?: (inputState: Record<string, unknown>) => void;
    onClearLogs?: () => void;
    onConnectRequest?: () => Promise<boolean | void> | void;
}

const scrollPositions = new Map<string, number>();

export const SerialMonitor = ({ session, onShowSettings, onSend, onUpdateConfig, onInputStateChange, onClearLogs, onConnectRequest }: SerialMonitorProps) => {
    const { config: themeConfig } = useSettings();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length);
    const mountTimeRef = useRef(Date.now());

    // ── 显示状态管理（委托给 Hook） ──
    const displayState = useSerialMonitorState(config, onUpdateConfig);
    const {
        viewMode, encoding, filterMode,
        autoScroll, flashNewMessage,
        fontSize, fontFamily,
        searchOpen, setSearchOpen,
        uiState, saveUIState,
    } = displayState;

    console.log('SerialMonitor: uiState loaded', { sessionId: session.id, inputHTML: uiState.inputHTML, inputContent: uiState.inputContent });

    // ── 数据格式化 ──
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

    // ── 操作函数 ──
    const {
        crcEnabled, rxCRC, commands,
        handleClearLogs: doClearLogs,
        handleSaveLogs, handleSend, handleCopyLog, handleAddToCommand, handleSaveCommand,
        getDataLengthText, toggleCRC, updateRxCRC,
    } = useSerialMonitorActions({
        onSend, onUpdateConfig, onClearLogs, config, logs, viewMode, encoding, formatData,
    });

    // ── 搜索逻辑 ──
    const {
        query, setQuery, isRegex, setIsRegex, matchCase, setMatchCase, matches, currentIndex, nextMatch, prevMatch, regexError, activeMatchRev
    } = useLogSearch(logs, uiState.searchOpen ? (uiState.searchQuery || '') : '', uiState.searchRegex || false, uiState.searchMatchCase || false, viewMode, formatData, encoding);

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
        const next = !searchOpen;
        setSearchOpen(next);
        saveUIState({ searchOpen: next });
    }, [saveUIState, setSearchOpen, searchOpen]);

    // Ctrl+F 快捷键
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

    // 导航到活跃搜索匹配项
    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }, [activeMatchRev, activeMatch]);

    // ── 自动滚动 ──
    useLayoutEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            scrollPositions.set(session.id, scrollRef.current.scrollHeight);
        }
    }, [logs, autoScroll, session.id]);

    useLayoutEffect(() => {
        if (scrollRef.current && scrollPositions.has(session.id)) {
            scrollRef.current.scrollTop = scrollPositions.get(session.id) as number;
        }
    }, [session.id]);

    useEffect(() => {
        if (!scrollRef.current || !autoScroll) return;
        const observer = new ResizeObserver(() => {
            if (scrollRef.current && scrollRef.current.clientHeight > 0) {
                if (scrollPositions.has(session.id)) {
                    scrollRef.current.scrollTop = scrollPositions.get(session.id) as number;
                }
            }
        });
        observer.observe(scrollRef.current);
        return () => observer.disconnect();
    }, [session.id, autoScroll]);

    // ── 日志过滤 ──
    const filteredLogs = logs.filter(log => {
        if (log.type === 'INFO' || log.type === 'ERROR') return true;
        if (filterMode === 'rx') return log.type === 'RX';
        if (filterMode === 'tx') return log.type === 'TX';
        return true;
    });

    // ── 输入状态变更回调 ──
    const handleInputStateChange = useCallback((state: { content: string, html: string, tokens: Record<string, Token>, mode: 'text' | 'hex', lineEnding: string, timerInterval: number }) => {
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens as any,
            inputMode: state.mode,
            lineEnding: state.lineEnding,
            inputTimerInterval: state.timerInterval
        });
    }, [saveUIState]);

    // ── 上下文菜单 ──
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, log: LogEntry } | null>(null);
    const [showCommandEditor, setShowCommandEditor] = useState<Record<string, unknown> | null>(null);

    const handleLogContextMenu = (e: React.MouseEvent, log: LogEntry) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, log });
    };

    const doHandleCopyLog = (log: LogEntry | null) => {
        handleCopyLog(log);
        setContextMenu(null);
    };

    const doHandleAddToCommand = (log: LogEntry | null) => {
        const result = handleAddToCommand(log);
        if (result) setShowCommandEditor(result);
        setContextMenu(null);
    };

    const doHandleSaveCommand = (updates: Record<string, unknown>) => {
        handleSaveCommand(updates);
        setShowCommandEditor(null);
    };

    // ── 统计数据 ──
    const txBytes = session.txBytes || 0;
    const rxBytes = session.rxBytes || 0;

    return (
        <div
            className="absolute inset-0 flex flex-col bg-[var(--st-monitor-rx-bg)] bg-cover bg-center"
            style={{ backgroundImage: 'var(--st-rx-bg-img)' }}
            onClick={() => setContextMenu(null)}
            data-component="serial-monitor"
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
                `}
            </style>

            {/* 工具栏 */}
            <SerialMonitorToolbar
                displayState={displayState}
                isConnected={isConnected}
                config={config}
                txBytes={txBytes}
                rxBytes={rxBytes}
                crcEnabled={crcEnabled}
                toggleCRC={toggleCRC}
                rxCRC={rxCRC}
                updateRxCRC={updateRxCRC}
                onClearLogs={doClearLogs}
                onSaveLogs={handleSaveLogs}
                scrollRef={scrollRef}
            />

            {/* 日志区域 */}
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
                        <div className="flex flex-col items-center justify-center h-full text-[var(--st-monitor-empty-text)]">
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
                                showTimestamp={displayState.showTimestamp}
                                showPacketType={displayState.showPacketType}
                                showDataLength={displayState.showDataLength}
                                onContextMenu={handleLogContextMenu}
                                formatData={formatData}
                                formatTimestamp={formatTimestamp}
                                getDataLengthText={getDataLengthText}
                                timestampFormat={themeConfig.timestampFormat}
                                matches={matches}
                                activeMatch={activeMatch}
                                mergeRepeats={displayState.mergeRepeats}
                                flashNewMessage={flashNewMessage}
                                fontSize={fontSize}
                                showControlChars={displayState.showControlChars}
                                rxCRC={rxCRC}
                                crcEnabled={crcEnabled}
                            />
                        );
                    })}
                </div>
            </div>

            {/* 串口输入区域 */}
            <SerialInput
                key={session.id}
                sessionId={session.id}
                onSend={handleSend}
                initialContent={uiState.inputContent || ''}
                initialHTML={uiState.inputHTML || ''}
                initialTokens={uiState.inputTokens as Record<string, Token> || {}}
                initialMode={uiState.inputMode || 'hex'}
                initialLineEnding={uiState.lineEnding ?? ''}
                initialTimerInterval={(uiState.inputTimerInterval as number) || 1000}
                onStateChange={handleInputStateChange}
                isConnected={isConnected}
                fontSize={fontSize}
                fontFamily={fontFamily}
                onConnectRequest={async () => {
                    const path = config.type === 'serial' ? config.connection.path : undefined;
                    if (path && onConnectRequest) {
                        const result = await onConnectRequest();
                        if (result === false) {
                            if (onShowSettings) onShowSettings('serial');
                            if (onInputStateChange) onInputStateChange({ highlightConnect: Date.now() });
                        }
                    } else {
                        if (onShowSettings) onShowSettings('serial');
                        if (onInputStateChange) onInputStateChange({ highlightConnect: Date.now() });
                    }
                }}
            />

            {/* 上下文菜单 */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={[
                        {
                            label: 'Copy',
                            icon: <Copy size={13} />,
                            onClick: () => doHandleCopyLog(contextMenu.log)
                        },
                        {
                            label: 'Add to Command',
                            icon: <FileText size={13} />,
                            onClick: () => doHandleAddToCommand(contextMenu.log)
                        }
                    ]}
                />
            )}

            {/* 命令编辑器对话框 */}
            {showCommandEditor && (
                <CommandEditorDialog
                    item={{
                        ...(showCommandEditor as any),
                        id: 'new',
                        type: 'command',
                        name: '',
                        payload: typeof (showCommandEditor as any).data === 'string' ? (showCommandEditor as any).data : '',
                        mode: (showCommandEditor as any).type === 'TX' ? (uiState.inputMode as any || 'text') : (uiState.viewMode as any || 'text'),
                        tokens: {},
                        parentId: null
                    } as CommandEntity}
                    onClose={() => setShowCommandEditor(null)}
                    onSave={doHandleSaveCommand}
                    existingNames={commands.filter((c: CommandEntity) => !c.parentId).map((c: CommandEntity) => c.name)}
                />
            )}
        </div>
    );
};
