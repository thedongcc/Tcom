/**
 * SerialMonitor.tsx
 * 串口监视器主组件。
 * 职责：组装工具栏、日志列表、搜索框、输入区域和上下文菜单。
 *
 * 子模块：
 * - useSerialMonitorState.ts   — 显示状态管理（视图模式、字体、编码等）
 * - useSerialMonitorActions.ts — 操作函数（清除日志、保存、发送、CRC）
 * - useSerialMonitorSearch.ts  — 搜索/滚动/过滤/格式化/输入状态
 * - SerialMonitorToolbar.tsx   — 工具栏 UI
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { SessionState, SessionConfig, LogEntry } from '../../types/session';
import { SerialInput } from './SerialInput';
import { Copy, FileText } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { ContextMenu } from '../common/ContextMenu';
import { CommandEditorDialog } from '../commands/CommandEditorDialog';
import { formatTimestamp } from '../../utils/format';
import { LogSearch } from '../common/LogSearch';
import { CommandEntity } from '../../types/command';
import { Token } from '../../types/token';
import { LogItem } from './LogItem';
import { useSerialMonitorActions } from './useSerialMonitorActions';
import { useSerialMonitorState } from './useSerialMonitorState';
import { SerialMonitorToolbar } from './SerialMonitorToolbar';
import { useSerialMonitorSearch } from './useSerialMonitorSearch';

interface SerialMonitorProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onSend?: (data: string | Uint8Array) => void;
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void;
    onInputStateChange?: (inputState: Record<string, unknown>) => void;
    onClearLogs?: () => void;
    onConnectRequest?: () => Promise<boolean | void> | void;
}

export const SerialMonitor = ({ session, onShowSettings, onSend, onUpdateConfig, onInputStateChange, onClearLogs, onConnectRequest }: SerialMonitorProps) => {
    const { config: themeConfig } = useSettings();
    const { logs, isConnected, config } = session;

    // ── 显示状态管理（委托给 Hook） ──
    const displayState = useSerialMonitorState(config, onUpdateConfig);
    const {
        viewMode, encoding, filterMode,
        autoScroll, flashNewMessage,
        fontSize, fontFamily,
        searchOpen, setSearchOpen,
        uiState, saveUIState,
    } = displayState;

    // ── 搜索/滚动/过滤/格式化（委托给 Hook） ──
    const search = useSerialMonitorSearch({
        sessionId: session.id, logs, autoScroll, setAutoScroll: displayState.setAutoScroll,
        viewMode, encoding, filterMode,
        searchOpen, setSearchOpen, uiState, saveUIState,
    });
    const {
        scrollRef, initialLogCountRef, mountTimeRef,
        formatData, filteredLogs,
        query, isRegex, matchCase, matches, currentIndex, activeMatch, regexError,
        handleQueryChange, handleRegexChange, handleMatchCaseChange, handleToggleSearch,
        nextMatch, prevMatch,
        handleInputStateChange, handleScroll, handleWheel,
    } = search;

    // ── 操作函数 ──
    const {
        crcEnabled, rxCRC, commands,
        handleClearLogs: doClearLogs,
        handleSaveLogs, handleSend, handleCopyLog, handleAddToCommand, handleSaveCommand,
        getDataLengthText, toggleCRC, updateRxCRC,
    } = useSerialMonitorActions({
        onSend, onUpdateConfig, onClearLogs, config, logs, viewMode, encoding, formatData,
    });

    // ── 上下文菜单 ──
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, log: LogEntry } | null>(null);
    const [showCommandEditor, setShowCommandEditor] = useState<Record<string, unknown> | null>(null);

    const handleLogContextMenu = useCallback((e: React.MouseEvent, log: LogEntry) => {
        e.preventDefault(); e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, log });
    }, []);

    const doHandleCopyLog = (log: LogEntry | null) => { handleCopyLog(log); setContextMenu(null); };
    const doHandleAddToCommand = (log: LogEntry | null) => { const result = handleAddToCommand(log); if (result) setShowCommandEditor(result); setContextMenu(null); };
    const doHandleSaveCommand = (updates: Record<string, unknown>) => { handleSaveCommand(updates); setShowCommandEditor(null); };

    const txBytes = session.txBytes || 0;
    const rxBytes = session.rxBytes || 0;

    // ── 鼠标悬浮行高亮（覆盖层方案：overlay 不在滚动内容中，不会跟随数据移动） ──
    const hoverOverlayRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const mouseClientPosRef = useRef<{ x: number; y: number } | null>(null);

    const updateHoverOverlay = useCallback((clientX: number, clientY: number) => {
        const overlay = hoverOverlayRef.current;
        const wrapper = wrapperRef.current;
        if (!overlay || !wrapper) return;

        const el = document.elementFromPoint(clientX, clientY);
        const target = el ? (el as HTMLElement).closest('.log-row') : null;

        if (target) {
            const rowRect = target.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            overlay.style.display = 'block';
            overlay.style.top = `${rowRect.top - wrapperRect.top}px`;
            overlay.style.left = `${rowRect.left - wrapperRect.left}px`;
            overlay.style.width = `${rowRect.width}px`;
            overlay.style.height = `${rowRect.height}px`;
        } else {
            overlay.style.display = 'none';
        }
    }, []);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const onMouseMove = (e: MouseEvent) => {
            mouseClientPosRef.current = { x: e.clientX, y: e.clientY };
            updateHoverOverlay(e.clientX, e.clientY);
        };
        const onScroll = () => {
            if (mouseClientPosRef.current) {
                updateHoverOverlay(mouseClientPosRef.current.x, mouseClientPosRef.current.y);
            }
        };
        const onMouseLeave = () => {
            mouseClientPosRef.current = null;
            if (hoverOverlayRef.current) hoverOverlayRef.current.style.display = 'none';
        };

        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('scroll', onScroll);
        container.addEventListener('mouseleave', onMouseLeave);
        return () => {
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('scroll', onScroll);
            container.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [scrollRef, updateHoverOverlay]);


    return (
        <div
            className="absolute inset-0 flex flex-col bg-[var(--st-monitor-rx-bg)] bg-cover bg-center"
            style={{ backgroundImage: 'var(--st-rx-bg-img)' }}
            onClick={() => setContextMenu(null)}
            data-component="serial-monitor"
        >
            <style>{`input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; }`}</style>

            <SerialMonitorToolbar
                displayState={displayState} isConnected={isConnected} config={config}
                txBytes={txBytes} rxBytes={rxBytes}
                crcEnabled={crcEnabled} toggleCRC={toggleCRC} rxCRC={rxCRC} updateRxCRC={updateRxCRC}
                onClearLogs={doClearLogs} onSaveLogs={handleSaveLogs} scrollRef={scrollRef}
            />

            <div className="flex-1 relative overflow-hidden" ref={wrapperRef}>
                <div className="absolute top-4 right-4 z-10">
                    <LogSearch
                        isOpen={searchOpen} onToggle={handleToggleSearch}
                        query={query} isRegex={isRegex} isMatchCase={matchCase}
                        onQueryChange={handleQueryChange} onRegexChange={handleRegexChange} onMatchCaseChange={handleMatchCaseChange}
                        onNext={nextMatch} onPrev={prevMatch}
                        logs={logs} currentIndex={currentIndex} totalMatches={matches.length}
                        viewMode={viewMode} formatData={formatData} encoding={encoding} regexError={regexError}
                    />
                </div>
                {/* 悬浮高亮覆盖层 —— 不在滚动内容中，不会跟随数据移动 */}
                <div
                    ref={hoverOverlayRef}
                    className="absolute pointer-events-none rounded-sm"
                    style={{ background: 'var(--list-hover-background)', display: 'none' }}
                />
                <div
                    className="absolute inset-0 overflow-auto pt-4 px-4 pb-6"
                    style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)'), lineHeight: `${Math.floor(fontSize * 1.5)}px` }}
                    ref={scrollRef} onScroll={handleScroll} onWheel={handleWheel}
                >
                    {filteredLogs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-[var(--st-monitor-empty-text)]"><p>No data</p></div>
                    )}
                    {filteredLogs.map((log, index) => {
                        const isNewLog = flashNewMessage && (index >= initialLogCountRef.current || log.timestamp > mountTimeRef.current);
                        return (
                            <LogItem
                                key={log.id}
                                log={log} isNewLog={isNewLog} viewMode={viewMode} encoding={encoding}
                                showTimestamp={displayState.showTimestamp} showPacketType={displayState.showPacketType}
                                showDataLength={displayState.showDataLength}
                                onContextMenu={handleLogContextMenu}
                                formatData={formatData} formatTimestamp={formatTimestamp} getDataLengthText={getDataLengthText}
                                timestampFormat={themeConfig.timestampFormat}
                                matches={matches} activeMatch={activeMatch}
                                mergeRepeats={displayState.mergeRepeats} flashNewMessage={flashNewMessage}
                                fontSize={fontSize} showControlChars={displayState.showControlChars}
                                rxCRC={rxCRC} crcEnabled={crcEnabled}
                            />
                        );
                    })}
                </div>
            </div>

            <SerialInput
                key={session.id} sessionId={session.id}
                onSend={handleSend}
                initialContent={uiState.inputContent || ''} initialHTML={uiState.inputHTML || ''}
                initialTokens={uiState.inputTokens as Record<string, Token> || {}}
                initialMode={uiState.inputMode || 'hex'}
                initialLineEnding={uiState.lineEnding ?? ''} initialTimerInterval={(uiState.inputTimerInterval as number) || 1000}
                onStateChange={handleInputStateChange}
                isConnected={isConnected} fontSize={fontSize} fontFamily={fontFamily}
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

            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
                    { label: 'Copy', icon: <Copy size={13} />, onClick: () => doHandleCopyLog(contextMenu.log) },
                    { label: 'Add to Command', icon: <FileText size={13} />, onClick: () => doHandleAddToCommand(contextMenu.log) },
                ]} />
            )}

            {showCommandEditor && (
                <CommandEditorDialog
                    item={{ ...(showCommandEditor as Record<string, unknown>), id: 'new', type: 'command', name: '', payload: typeof (showCommandEditor as Record<string, unknown>).data === 'string' ? (showCommandEditor as Record<string, unknown>).data as string : '', mode: (showCommandEditor as Record<string, unknown>).type === 'TX' ? ((uiState.inputMode as string) || 'text') : ((uiState.viewMode as string) || 'text'), tokens: {}, parentId: null } as CommandEntity}
                    onClose={() => setShowCommandEditor(null)}
                    onSave={doHandleSaveCommand}
                    existingNames={commands.filter((c: CommandEntity) => !c.parentId).map((c: CommandEntity) => c.name)}
                />
            )}
        </div>
    );
};
