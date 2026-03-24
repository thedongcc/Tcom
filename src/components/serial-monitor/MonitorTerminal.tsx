/**
 * MonitorTerminal.tsx
 * 串口监控器终端 — 显示日志数据流、搜索和数据注入。
 *
 * 子模块：
 * - MonitorToolbar.tsx — 工具栏（过滤器、视图模式、选项菜单）
 * - useMonitorTerminalState.ts — 状态管理（UI 状态、搜索、字体、滚动）
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Copy, FileText } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useCommandContext } from '../../context/CommandContext';
import { formatTimestamp } from '../../utils/format';
import { SerialInput } from '../serial/SerialInput';
import { generateUniqueName } from '../../utils/commandUtils';
import { CommandEditorDialog } from '../commands/CommandEditorDialog';
import { CommandEntity } from '../../types/command';
import { ContextMenu } from '../common/ContextMenu';
import { MonitorSessionConfig } from '../../types/session';
import { LogSearch } from '../common/LogSearch';
import { useI18n } from '../../context/I18nContext';
import { MonitorLogItem } from './MonitorLogItem';
import { MonitorToolbar } from './MonitorToolbar';
import { useMonitorTerminalState } from './useMonitorTerminalState';
import { SessionState } from '../../types/session';

interface MonitorTerminalProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onConnectRequest?: () => Promise<void> | void;
}

export const MonitorTerminal = ({ session, onConnectRequest }: MonitorTerminalProps) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    // ── 核心状态（全部委托给 Hook） ──
    const state = useMonitorTerminalState(session);
    const {
        scrollRef, scrollPositions,
        sessionManager, isConnected, config, themeConfig, uiState,
        viewMode, showTimestamp, showPacketType, showDataLength,
        mergeRepeats, filterMode, encoding, fontSize, fontFamily,
        autoScroll, flashNewMessage, showOptionsMenu, sendTarget,
        partnerConnected, searchOpen, availableFonts,
        setShowOptionsMenu,
        formatData, getDataLengthText,
        query, isRegex, matchCase, matches, currentIndex, activeMatch, regexError,
        handleQueryChange, handleRegexChange, handleMatchCaseChange, handleToggleSearch,
        nextMatch, prevMatch,
        filteredLogs,
        handleFilterChange, handleViewModeChange, handleAutoScrollToggle,
        onShowTimestamp, onShowPacketType, onShowDataLength,
        onMergeRepeats, onFlashNewMessage, onEncoding, onFontFamily, onFontSize,
        onSendTarget, handleInputStateChange,
        txBytes, rxBytes,
    } = state;

    // ── 日志操作 ──
    const handleClearLogs = () => sessionManager.clearLogs(session.id);

    const handleSend = useCallback((data: string | Uint8Array, mode: 'text' | 'hex') => {
        if (!isConnected) { showToast(t('toast.connectFirst'), 'error'); return; }
        let finalData = data;
        if (mode === 'hex' && typeof data === 'string') {
            const cleanHex = data.replace(/\s+/g, '');
            if (cleanHex.length % 2 === 0) {
                const byteArray = new Uint8Array(cleanHex.length / 2);
                for (let i = 0; i < cleanHex.length; i += 2) byteArray[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
                finalData = byteArray;
            }
        }
        void sessionManager.writeToMonitor(session.id, sendTarget, finalData);
    }, [isConnected, sendTarget, session.id, sessionManager, showToast, t]);

    const handleTimedSendStart = useCallback((sid: string, data: number[], intervalMs: number) => {
        void window.monitorAPI?.startTimedSend(sid, sendTarget, data, intervalMs);
    }, [sendTarget]);

    const handleTimedSendStop = useCallback((sid: string) => {
        void window.monitorAPI?.stopTimedSend(sid);
    }, []);

    // ── 右键菜单和命令添加 ──
    const { addCommand, commands } = useCommandContext();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, log: any } | null>(null);
    const [showCommandEditor, setShowCommandEditor] = useState<any | null>(null);

    const handleLogContextMenu = useCallback((e: React.MouseEvent, log: any) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, log }); }, []);
    const handleCopyLog = (log: any) => { void navigator.clipboard.writeText(formatData(log.data, viewMode, encoding)); showToast(t('toast.copied'), 'success', 1500); setContextMenu(null); };
    const handleAddToCommand = (log: any) => { setShowCommandEditor({ name: generateUniqueName(commands, 'command', undefined), payload: formatData(log.data, viewMode, encoding), mode: viewMode === 'hex' ? 'hex' : 'text', tokens: {}, lineEnding: '' }); setContextMenu(null); };

    const handleSaveCommand = (updates: any) => {
        addCommand({ ...updates, payload: updates.payload || '', mode: updates.mode || 'text', tokens: updates.tokens || {}, parentId: undefined });
        setShowCommandEditor(null);
    };

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

    const handleSaveLogs = async () => {
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const { writeTextFile } = await import('@tauri-apps/plugin-fs');

            const content = state.logs.map(log => {
                const d = new Date(log.timestamp);
                const timestampStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`;
                const dataStr = formatData(log.data, viewMode, encoding);
                return `[${timestampStr}][${log.topic === 'virtual' ? 'APP' : 'DEV'}] ${dataStr} `;
            }).join('\n');

            const filePath = await save({
                defaultPath: `monitor_log_${Date.now()}.txt`,
                filters: [{ name: 'Text', extensions: ['txt'] }],
            });

            if (filePath) {
                await writeTextFile(filePath, content);
                showToast(t('toast.exportSuccess') || '导出成功', 'success', 1500);
            }
        } catch (e) {
            console.error('导出日志失败:', e);
            showToast(t('toast.exportFailed') || '导出失败', 'error', 2000);
        }
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[var(--monitor-terminal-bg)] bg-cover bg-center select-none" style={{ backgroundImage: 'var(--st-rx-bg-img)' }} onClick={() => setContextMenu(null)} data-component="monitor-terminal">
            <style>{`@keyframes flash-new { 0% { background-color: var(--flash-color); } 100% { background-color: transparent; } } .animate-flash-new { animation: flash-new 1s ease-out forwards; }`}</style>

            <MonitorToolbar
                isConnected={isConnected} config={config} txBytes={txBytes} rxBytes={rxBytes}
                filterMode={filterMode} viewMode={viewMode} autoScroll={autoScroll} showOptionsMenu={showOptionsMenu}
                showTimestamp={showTimestamp} showPacketType={showPacketType}
                showControlChars={state.showControlChars}
                showDataLength={showDataLength}
                mergeRepeats={mergeRepeats} flashNewMessage={flashNewMessage}
                encoding={encoding} fontFamily={fontFamily} fontSize={fontSize} availableFonts={availableFonts}
                crcEnabled={config.rxCRC?.enabled || false}
                toggleCRC={() => {
                    const current = config.rxCRC || { enabled: false, algorithm: 'modbus-crc16' as const, startIndex: 0, endIndex: 0 };
                    void sessionManager.updateSessionConfig(session.id, { rxCRC: { ...current, enabled: !current.enabled } } as any);
                }}
                rxCRC={config.rxCRC || { enabled: false, algorithm: 'modbus-crc16' as const, startIndex: 0, endIndex: 0 }}
                updateRxCRC={(updates) => {
                    const current = config.rxCRC || { enabled: false, algorithm: 'modbus-crc16' as const, startIndex: 0, endIndex: 0 };
                    void sessionManager.updateSessionConfig(session.id, { rxCRC: { ...current, ...updates } } as any);
                }}
                showCRCPanel={state.showCRCPanel} setShowCRCPanel={state.setShowCRCPanel}
                uiState={uiState} saveUIState={state.saveUIState}
                onFilterChange={handleFilterChange} onViewModeChange={handleViewModeChange}
                onAutoScrollToggle={handleAutoScrollToggle}
                onToggleOptionsMenu={() => setShowOptionsMenu(!showOptionsMenu)}
                onClearLogs={handleClearLogs} onSaveLogs={handleSaveLogs} hasLogs={state.logs.length > 0}
                onShowTimestamp={onShowTimestamp}
                onShowPacketType={onShowPacketType}
                onShowControlChars={state.onShowControlChars}
                onShowDataLength={onShowDataLength}
                onMergeRepeats={onMergeRepeats}
                onFlashNewMessage={onFlashNewMessage}
                onEncoding={onEncoding}
                onFontFamily={onFontFamily}
                onFontSize={onFontSize}
                onDisconnect={() => sessionManager.disconnectSession(session.id)}
                onConnect={onConnectRequest ? () => onConnectRequest() : undefined}
            />

            {isConnected && !partnerConnected && (
                <div className="bg-amber-600/20 border-b border-amber-600/30 transition-all duration-200 ease-out animate-in fade-in slide-in-from-top-1">
                    <div className="px-4 py-2 flex items-center justify-between gap-3 text-amber-400 text-xs">
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /><span>{t('monitor.partnerNotOpen', { port: (config as MonitorSessionConfig).virtualSerialPort || '' })}</span></div>
                        <button className="px-2 py-1 bg-amber-600/30 rounded text-amber-200 text-[10px]" onClick={() => onSendTarget('physical')}>{t('monitor.switchPhysical')}</button>
                    </div>
                </div>
            )}

            <div className="flex-1 relative overflow-hidden" ref={wrapperRef}>
                <div className="absolute top-4 right-4 z-10">
                    <LogSearch
                        isOpen={searchOpen} onToggle={handleToggleSearch}
                        query={query} isRegex={isRegex} isMatchCase={matchCase}
                        onQueryChange={handleQueryChange} onRegexChange={handleRegexChange} onMatchCaseChange={handleMatchCaseChange}
                        onNext={nextMatch} onPrev={prevMatch}
                        logs={state.logs} currentIndex={currentIndex} totalMatches={matches.length}
                        viewMode={viewMode} formatData={formatData} encoding={encoding} regexError={regexError}
                    />
                </div>
                {/* 悬浮高亮覆盖层 —— 不在滚动内容中，不会跟随数据移动 */}
                <div
                    ref={hoverOverlayRef}
                    className="absolute pointer-events-none rounded-sm"
                    style={{ background: 'var(--list-hover-background)', display: 'none' }}
                />
                <div className="absolute inset-0 overflow-auto p-4" ref={scrollRef} onScroll={(e) => { if (!autoScroll) scrollPositions.set(session.id, e.currentTarget.scrollTop); }} style={{ fontSize: fontSize ? `${fontSize}px` : 'var(--st-font-size)', fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)'), lineHeight: `${Math.floor(fontSize * 1.5)}px` }}>
                    {filteredLogs.map((log, _index) => {
                        const isNewLog = flashNewMessage && (Date.now() - log.timestamp < 300);
                        const virtualSerPort = (config as MonitorSessionConfig).virtualSerialPort;
                        const physPort = (config as MonitorSessionConfig).connection?.path || 'DEV';
                        const rxCRC = (config.rxCRC) || { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
                        return (
                            <MonitorLogItem
                                key={`${log.id}-${log.repeatCount || 1}`}
                                log={log} isNewLog={isNewLog} viewMode={viewMode} encoding={encoding}
                                showTimestamp={showTimestamp} showPacketType={showPacketType} showDataLength={showDataLength}
                                showControlChars={state.showControlChars}
                                virtualSerialPort={virtualSerPort || ''} physicalPortPath={physPort}
                                onContextMenu={handleLogContextMenu}
                                formatData={formatData} formatTimestamp={(ts: number, fmt?: string) => formatTimestamp(ts, fmt || 'HH:mm:ss.SSS')} getDataLengthText={getDataLengthText}
                                timestampFormat={themeConfig.timestampFormat}
                                matches={matches} activeMatch={activeMatch} mergeRepeats={mergeRepeats} flashNewMessage={flashNewMessage}
                                fontSize={fontSize} rxCRC={rxCRC} crcEnabled={rxCRC.enabled}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="shrink-0">
                <div className="flex items-center px-3 py-1 border-t border-[var(--st-widget-border)] bg-[var(--st-sendarea-bg)] gap-2">
                    <button onClick={() => onSendTarget('virtual')} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'virtual' ? 'bg-[var(--st-monitor-btn-target-virtual-active-bg)] text-[var(--button-foreground)] shadow-md' : 'bg-[var(--button-secondary-background)] text-gray-400 hover:text-gray-200 hover:bg-[var(--button-secondary-hover-background)]'}`}>{t('monitor.virtual')}: {(config as MonitorSessionConfig).virtualSerialPort}</button>
                    <button onClick={() => onSendTarget('physical')} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'physical' ? 'bg-[var(--st-monitor-btn-target-physical-active-bg)] text-[var(--st-monitor-btn-target-physical-active-text,white)] shadow-md' : 'bg-[var(--button-secondary-background)] text-[var(--st-monitor-btn-text)] hover:text-[var(--st-monitor-btn-target-physical-active-text,white)] hover:bg-[var(--button-secondary-hover-background)]'}`}>{t('monitor.physical')}: {(config as MonitorSessionConfig).connection?.path || t('monitor.unconnected')}</button>
                </div>
                <SerialInput
                    key={session.id}
                    sessionId={session.id}
                    onSend={handleSend}
                    onTimedSendStart={handleTimedSendStart}
                    onTimedSendStartDynamic={window.serialAPI?.timedSendStartDynamic}
                    onTimedSendStop={handleTimedSendStop}
                    initialContent={uiState.inputContent as string} initialHTML={uiState.inputHTML as string}
                    initialTokens={uiState.inputTokens as Record<string, import('../../types/token').Token>} initialMode={(uiState.inputMode as string as 'text' | 'hex') || 'hex'}
                    initialLineEnding={(uiState.lineEnding as string) ?? ''} initialTimerInterval={(uiState.inputTimerInterval as number) || 1000}
                    onStateChange={handleInputStateChange}
                    isConnected={isConnected} fontSize={fontSize} fontFamily={fontFamily} onConnectRequest={onConnectRequest}
                />
            </div>

            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: t('common.copy'), icon: <Copy size={13} />, onClick: () => handleCopyLog(contextMenu.log) }, { label: t('common.addCommand'), icon: <FileText size={13} />, onClick: () => handleAddToCommand(contextMenu.log) }]} />}
            {showCommandEditor && <CommandEditorDialog item={{ id: 'new', type: 'command', name: '', payload: '', mode: 'hex', tokens: {}, parentId: null, ...showCommandEditor } as CommandEntity} onClose={() => setShowCommandEditor(null)} onSave={handleSaveCommand} existingNames={commands.filter(c => !c.parentId).map(c => c.name)} />}
        </div>
    );
};
