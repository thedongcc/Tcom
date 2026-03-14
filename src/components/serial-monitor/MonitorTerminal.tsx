/**
 * MonitorTerminal.tsx
 * 串口监控器终端 — 显示日志数据流、搜索和数据注入。
 *
 * 子模块：
 * - MonitorToolbar.tsx — 工具栏（过滤器、视图模式、选项菜单）
 * - useMonitorTerminalState.ts — 状态管理（UI 状态、搜索、字体、滚动）
 */
import React, { useState, useCallback } from 'react';
import { Copy, FileText } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useCommandContext } from '../../context/CommandContext';
import { formatTimestamp } from '../../utils/format';
import { SerialInput } from '../serial/SerialInput';
import { AnimatePresence, motion } from 'framer-motion';
import { generateUniqueName } from '../../utils/commandUtils';
import { CommandEditorDialog } from '../commands/CommandEditorDialog';
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

export const MonitorTerminal = ({ session, onShowSettings, onConnectRequest }: MonitorTerminalProps) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    // ── 核心状态（全部委托给 Hook） ──
    const state = useMonitorTerminalState(session);
    const {
        scrollRef, initialLogCountRef, mountTimeRef, scrollPositions,
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
        onSendTarget, handleInputStateChange, saveUIState,
        txBytes, rxBytes,
    } = state;

    // ── 日志操作 ──
    const handleClearLogs = () => sessionManager.clearLogs(session.id);

    const handleSend = (data: string | Uint8Array, mode: 'text' | 'hex') => {
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
        sessionManager.writeToMonitor(session.id, sendTarget, finalData);
    };

    // ── 右键菜单和命令添加 ──
    const { addCommand, commands } = useCommandContext();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, log: any } | null>(null);
    const [showCommandEditor, setShowCommandEditor] = useState<any | null>(null);

    const handleLogContextMenu = useCallback((e: React.MouseEvent, log: any) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, log }); }, []);
    const handleCopyLog = (log: any) => { navigator.clipboard.writeText(formatData(log.data, viewMode, encoding)); showToast(t('toast.copied'), 'success', 1500); setContextMenu(null); };
    const handleAddToCommand = (log: any) => { setShowCommandEditor({ name: generateUniqueName(commands, 'command', undefined), payload: formatData(log.data, viewMode, encoding), mode: viewMode === 'hex' ? 'hex' : 'text', tokens: {}, lineEnding: '' }); setContextMenu(null); };

    const handleSaveCommand = (updates: any) => {
        addCommand({ ...updates, payload: updates.payload || '', mode: updates.mode || 'text', tokens: updates.tokens || {}, parentId: undefined });
        setShowCommandEditor(null);
    };

    const handleSaveLogs = () => {
        const content = state.logs.map(log => {
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

    return (
        <div className="absolute inset-0 flex flex-col bg-[var(--monitor-terminal-bg)] bg-cover bg-center select-none" style={{ backgroundImage: 'var(--st-rx-bg-img)' }} onClick={() => setContextMenu(null)} data-component="monitor-terminal">
            <style>{`@keyframes flash-new { 0% { background-color: var(--flash-color); } 100% { background-color: transparent; } } .animate-flash-new { animation: flash-new 1s ease-out forwards; }`}</style>

            <MonitorToolbar
                isConnected={isConnected} config={config} txBytes={txBytes} rxBytes={rxBytes}
                filterMode={filterMode} viewMode={viewMode} autoScroll={autoScroll} showOptionsMenu={showOptionsMenu}
                showTimestamp={showTimestamp} showPacketType={showPacketType} showDataLength={showDataLength}
                mergeRepeats={mergeRepeats} flashNewMessage={flashNewMessage}
                encoding={encoding} fontFamily={fontFamily} fontSize={fontSize} availableFonts={availableFonts}
                onFilterChange={handleFilterChange} onViewModeChange={handleViewModeChange}
                onAutoScrollToggle={handleAutoScrollToggle}
                onToggleOptionsMenu={() => setShowOptionsMenu(!showOptionsMenu)}
                onClearLogs={handleClearLogs} onSaveLogs={handleSaveLogs}
                onShowTimestamp={onShowTimestamp}
                onShowPacketType={onShowPacketType}
                onShowDataLength={onShowDataLength}
                onMergeRepeats={onMergeRepeats}
                onFlashNewMessage={onFlashNewMessage}
                onEncoding={onEncoding}
                onFontFamily={onFontFamily}
                onFontSize={onFontSize}
                scrollRef={scrollRef}
            />

            <AnimatePresence>
                {isConnected && !partnerConnected && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-amber-600/20 border-b border-amber-600/30">
                        <div className="px-4 py-2 flex items-center justify-between gap-3 text-amber-400 text-xs">
                            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /><span>{t('monitor.partnerNotOpen', { port: (config as MonitorSessionConfig).virtualSerialPort })}</span></div>
                            <button className="px-2 py-1 bg-amber-600/30 rounded text-amber-200 text-[10px]" onClick={() => onSendTarget('physical')}>{t('monitor.switchPhysical')}</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex-1 relative overflow-hidden">
                <div className="absolute top-4 right-4 z-10">
                    <LogSearch
                        isOpen={searchOpen} onToggle={handleToggleSearch}
                        query={query} isRegex={isRegex} isMatchCase={matchCase}
                        onQueryChange={handleQueryChange} onRegexChange={handleRegexChange} onMatchCaseChange={handleMatchCaseChange}
                        onNext={nextMatch} onPrev={prevMatch}
                        logs={state.logs} currentIndex={currentIndex} totalMatches={matches.length}
                        viewMode={viewMode} formatData={formatData as any} encoding={encoding} regexError={regexError}
                    />
                </div>
                <div className="absolute inset-0 overflow-auto p-4" ref={scrollRef} onScroll={(e) => { if (!autoScroll) scrollPositions.set(session.id, e.currentTarget.scrollTop); }} style={{ fontSize: fontSize ? `${fontSize}px` : 'var(--st-font-size)', fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)'), lineHeight: `${Math.floor(fontSize * 1.5)}px` }}>
                    {filteredLogs.map((log, index) => {
                        const isNewLog = flashNewMessage && (index >= initialLogCountRef.current || log.timestamp > mountTimeRef.current);
                        const virtualSerPort = (config as MonitorSessionConfig).virtualSerialPort;
                        const physPort = (config as MonitorSessionConfig).connection?.path || 'DEV';
                        const rxCRC = ((config as any).rxCRC as any) || { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
                        return (
                            <MonitorLogItem
                                key={`${log.id}-${log.repeatCount || 1}`}
                                log={log} isNewLog={isNewLog} viewMode={viewMode} encoding={encoding}
                                showTimestamp={showTimestamp} showPacketType={showPacketType} showDataLength={showDataLength}
                                virtualSerialPort={virtualSerPort} physicalPortPath={physPort}
                                onContextMenu={handleLogContextMenu}
                                formatData={formatData} formatTimestamp={formatTimestamp} getDataLengthText={getDataLengthText}
                                timestampFormat={themeConfig.timestampFormat}
                                matches={matches} activeMatch={activeMatch} mergeRepeats={mergeRepeats} flashNewMessage={flashNewMessage}
                                fontSize={fontSize} rxCRC={rxCRC as any} crcEnabled={rxCRC.enabled as any}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="bg-[var(--app-background)] border-t border-[var(--border-color)]">
                <div className="flex items-center bg-[var(--widget-background)]/30 px-3 py-1 border-y border-white/5 gap-2">
                    <button onClick={() => onSendTarget('virtual')} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'virtual' ? 'bg-[var(--st-monitor-btn-target-virtual-active-bg)] text-[var(--button-foreground)] shadow-md' : 'bg-[var(--button-secondary-background)] text-gray-400 hover:text-gray-200 hover:bg-[var(--button-secondary-hover-background)]'}`}>{t('monitor.virtual')}: {(config as MonitorSessionConfig).virtualSerialPort}</button>
                    <button onClick={() => onSendTarget('physical')} className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${sendTarget === 'physical' ? 'bg-[var(--st-monitor-btn-target-physical-active-bg)] text-white shadow-md' : 'bg-[var(--button-secondary-background)] text-[var(--st-monitor-btn-text)] hover:text-white hover:bg-[var(--button-secondary-hover-background)]'}`}>{t('monitor.physical')}: {(config as MonitorSessionConfig).connection?.path || t('monitor.unconnected')}</button>
                </div>
                <SerialInput
                    key={session.id}
                    onSend={handleSend as any}
                    initialContent={uiState.inputContent as string} initialHTML={uiState.inputHTML as string}
                    initialTokens={uiState.inputTokens as any} initialMode={(uiState.inputMode as any) || 'hex'}
                    initialLineEnding={(uiState.lineEnding as any) ?? ''} initialTimerInterval={(uiState.inputTimerInterval as number) || 1000}
                    onStateChange={handleInputStateChange}
                    isConnected={isConnected} fontSize={fontSize} fontFamily={fontFamily} onConnectRequest={onConnectRequest}
                />
            </div>

            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: t('common.copy'), icon: <Copy size={13} />, onClick: () => handleCopyLog(contextMenu.log) }, { label: t('common.addCommand'), icon: <FileText size={13} />, onClick: () => handleAddToCommand(contextMenu.log) }]} />}
            {showCommandEditor && <CommandEditorDialog item={{ id: 'new', type: 'command', name: '', payload: '', mode: 'hex', tokens: {}, parentId: null, ...showCommandEditor } as any} onClose={() => setShowCommandEditor(null)} onSave={handleSaveCommand} existingNames={commands.filter(c => !c.parentId).map(c => c.name)} />}
        </div>
    );
};
