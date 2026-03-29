/**
 * MonitorToolbar.tsx
 * 串口监控器工具栏 — 过滤器、视图模式、选项菜单、自动滚动和清除。
 * 选项菜单使用通用 MonitorOptionsPanel 组件。
 */
import React, { useRef } from 'react';
import { Trash2, ArrowDownToLine, Menu, Unplug, Plug } from 'lucide-react';
import { MonitorSessionConfig } from '../../types/session';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { MonitorOptionsPanel } from '../common/MonitorOptionsPanel';
import type { CRCConfig } from '../../utils/crc';

interface MonitorToolbarProps {
    isConnected: boolean;
    config: any;
    txBytes: number;
    rxBytes: number;
    filterMode: 'all' | 'rx' | 'tx';
    viewMode: 'text' | 'hex' | 'both';
    autoScroll: boolean;
    showOptionsMenu: boolean;
    // 选项菜单内部状态
    showTimestamp: boolean;
    showPacketType: boolean;
    showControlChars: boolean;
    showDataLength: boolean;
    mergeRepeats: boolean;
    flashNewMessage: boolean;
    encoding: 'utf-8' | 'gbk' | 'ascii';
    fontFamily: string;
    fontSize: number;
    availableFonts: any[];
    // CRC
    crcEnabled: boolean;
    toggleCRC: () => void;
    rxCRC: CRCConfig;
    updateRxCRC: (updates: Partial<CRCConfig>) => void;
    showCRCPanel: boolean;
    setShowCRCPanel: (v: boolean) => void;
    // 分包 & 持久化
    uiState: Record<string, any>;
    saveUIState: (updates: Record<string, unknown>) => void;
    // 回调
    onFilterChange: (mode: 'all' | 'rx' | 'tx') => void;
    onViewModeChange: (mode: 'text' | 'hex' | 'both') => void;
    onAutoScrollToggle: () => void;
    onToggleOptionsMenu: () => void;
    onClearLogs: () => void;
    onSaveLogs: () => void;
    hasLogs: boolean;
    // 选项变更
    onShowTimestamp: (v: boolean) => void;
    onShowPacketType: (v: boolean) => void;
    onShowControlChars: (v: boolean) => void;
    onShowDataLength: (v: boolean) => void;
    onMergeRepeats: (v: boolean) => void;
    onFlashNewMessage: (v: boolean) => void;
    onEncoding: (v: string) => void;
    onFontFamily: (v: string) => void;
    onFontSize: (v: number) => void;
    onDisconnect?: () => void;
    onConnect?: () => void;
    onShowSettings?: (view: string) => void;
}

export const MonitorToolbar = React.memo(({
    isConnected, config, txBytes, rxBytes,
    filterMode, viewMode, autoScroll, showOptionsMenu,
    showTimestamp, showPacketType, showControlChars, showDataLength, mergeRepeats, flashNewMessage,
    encoding, fontFamily, fontSize, availableFonts,
    crcEnabled, toggleCRC, rxCRC, updateRxCRC, showCRCPanel, setShowCRCPanel,
    uiState, saveUIState,
    onFilterChange, onViewModeChange, onAutoScrollToggle, onToggleOptionsMenu,
    onClearLogs, onSaveLogs, hasLogs,
    onShowTimestamp, onShowPacketType, onShowControlChars, onShowDataLength, onMergeRepeats, onFlashNewMessage,
    onEncoding, onFontFamily, onFontSize,
    onDisconnect,
    onConnect,
    onShowSettings,
}: MonitorToolbarProps) => {
    const { t } = useI18n();
    const optionsButtonRef = useRef<HTMLButtonElement>(null);

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--st-toolbar-bg)] shrink-0">
            <div className="text-sm font-medium text-[var(--st-monitor-toolbar-foreground)] flex items-center gap-2">
                {isConnected ? <div className="w-2 h-2 rounded-full bg-[var(--st-monitor-status-online)] shadow-[0_0_8px_var(--st-monitor-status-online)] animate-pulse" style={{ opacity: 0.8 }} /> : <div className="w-2 h-2 rounded-full bg-[var(--st-monitor-status-offline)]" />}
                <Tooltip content={t('session.configure')} position="bottom">
                    <div 
                        className="flex items-center cursor-pointer hover:text-[var(--accent-color)] transition-colors pl-1"
                        onClick={() => onShowSettings?.('serial')}
                    >
                        <span className="opacity-80">Monitor: </span>
                        <span className="text-blue-400 font-bold ml-1">{(config as MonitorSessionConfig).virtualSerialPort}</span>
                        <span className="text-gray-600 px-1">⟷</span>
                        <span className="text-emerald-400 font-bold">{(config as MonitorSessionConfig).connection?.path || 'No Device'}</span>
                    </div>
                </Tooltip>

                {/* 连接/断开按钮 */}
                {isConnected ? (
                    onDisconnect && (
                        <Tooltip content={t('monitor.disconnect')} position="bottom">
                            <button
                                className="ml-1 p-1 rounded-[3px] text-[var(--st-status-error)] hover:bg-[var(--st-status-error-bg)] transition-colors cursor-pointer"
                                onClick={onDisconnect}
                            >
                                <Unplug size={13} />
                            </button>
                        </Tooltip>
                    )
                ) : (
                    onConnect && (
                        <Tooltip content={t('monitor.connect')} position="bottom">
                            <button
                                className="ml-1 p-1 rounded-[3px] text-[var(--st-status-success)] hover:bg-[var(--st-status-success-bg,rgba(0,200,0,0.1))] transition-colors cursor-pointer"
                                onClick={onConnect}
                            >
                                <Plug size={13} />
                            </button>
                        </Tooltip>
                    )
                )}
            </div>

            <div className="flex items-center gap-4">
                {/* 过滤器 */}
                <div className="flex items-center border border-[var(--st-ter-filter-group-border)] rounded-[3px] divide-x divide-[var(--st-ter-filter-group-divider)] overflow-hidden h-[26px] bg-[var(--st-ter-filter-group-bg)]">
                    <Tooltip content={filterMode === 'tx' ? t('monitor.cancelFilter') : t('monitor.filterVirtualPort')} position="bottom">
                        <div className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[var(--st-monitor-btn-filter-tx-active-bg)] text-[var(--st-ter-btn-filter-tx-active-text)] shadow-sm' : 'hover:bg-[var(--st-ter-btn-filter-tx-hover-bg)] text-[var(--st-ter-btn-filter-tx-text)] bg-[var(--st-ter-btn-filter-tx-bg)]'}`} onClick={() => onFilterChange(filterMode === 'tx' ? 'all' : 'tx')}>
                            <span className="text-[11px] font-bold font-mono opacity-70">{(config as MonitorSessionConfig).virtualSerialPort}:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{txBytes.toLocaleString()}</span>
                        </div>
                    </Tooltip>
                    <Tooltip content={filterMode === 'rx' ? t('monitor.cancelFilter') : t('monitor.filterPhysicalPort')} position="bottom">
                        <div className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-[var(--st-monitor-btn-filter-rx-active-bg)] text-[var(--st-ter-btn-filter-rx-active-text)] shadow-sm' : 'hover:bg-[var(--st-ter-btn-filter-rx-hover-bg)] text-[var(--st-ter-btn-filter-rx-text)] bg-[var(--st-ter-btn-filter-rx-bg)]'}`} onClick={() => onFilterChange(filterMode === 'rx' ? 'all' : 'rx')}>
                            <span className="text-[11px] font-bold font-mono opacity-70">{(config as MonitorSessionConfig).connection?.path || 'DEV'}:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{rxBytes.toLocaleString()}</span>
                        </div>
                    </Tooltip>
                </div>

                {/* 视图模式 */}
                <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5 p-0.5 rounded-[3px] border border-[var(--st-ter-view-group-border)] bg-[var(--st-ter-view-group-bg)] h-[26px]">
                        <button
                            className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === 'hex' || viewMode === 'both' ? 'bg-[var(--st-monitor-btn-view-hex-active-bg)] text-[var(--st-ter-btn-view-active-text)] shadow-sm' : 'text-[var(--st-ter-btn-view-text)] hover:bg-[var(--st-ter-btn-view-hover-bg)] bg-[var(--st-ter-btn-view-bg)]'}`}
                            onClick={() => { if (viewMode === 'hex') return; onViewModeChange(viewMode === 'both' ? 'text' : 'both'); }}
                        >HEX</button>
                        <button
                            className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === 'text' || viewMode === 'both' ? 'bg-[var(--st-monitor-btn-view-txt-active-bg)] text-[var(--st-ter-btn-view-active-text)] shadow-sm' : 'text-[var(--st-ter-btn-view-text)] hover:bg-[var(--st-ter-btn-view-hover-bg)] bg-[var(--st-ter-btn-view-bg)]'}`}
                            onClick={() => { if (viewMode === 'text') return; onViewModeChange(viewMode === 'both' ? 'hex' : 'both'); }}
                        >TXT</button>
                    </div>

                    {/* 选项菜单 */}
                    <div className="relative">
                        <button
                            ref={optionsButtonRef}
                            className={`h-[26px] px-2 hover:bg-[var(--monitor-options-hover-bg)] rounded-[3px] text-[var(--st-ter-btn-options-text)] bg-[var(--st-ter-btn-options-bg)] border-[var(--st-ter-btn-options-border)] transition-colors flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[var(--monitor-options-hover-bg)]' : ''}`}
                            onClick={onToggleOptionsMenu}
                        >
                            <Menu size={14} /> <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                        </button>
                        {showOptionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={onToggleOptionsMenu} />
                                <div className="absolute right-0 top-full mt-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded-[3px] shadow-2xl p-3 z-50 min-w-[280px] max-h-[calc(100vh-120px)] overflow-y-auto">
                                    <MonitorOptionsPanel
                                        encoding={encoding} setEncoding={(v) => onEncoding(v)}
                                        showTimestamp={showTimestamp} setShowTimestamp={onShowTimestamp}
                                        showPacketType={showPacketType} setShowPacketType={onShowPacketType}
                                        showControlChars={showControlChars} setShowControlChars={onShowControlChars}
                                        showDataLength={showDataLength} setShowDataLength={onShowDataLength}
                                        mergeRepeats={mergeRepeats} setMergeRepeats={onMergeRepeats}
                                        flashNewMessage={flashNewMessage} setFlashNewMessage={onFlashNewMessage}
                                        crcEnabled={crcEnabled} toggleCRC={toggleCRC}
                                        rxCRC={rxCRC} updateRxCRC={updateRxCRC}
                                        showCRCPanel={showCRCPanel} setShowCRCPanel={setShowCRCPanel}
                                        fontSize={fontSize} setFontSize={onFontSize}
                                        fontFamily={fontFamily} setFontFamily={onFontFamily}
                                        availableFonts={availableFonts}
                                        uiState={uiState} saveUIState={saveUIState}
                                        hasLogs={hasLogs}
                                        onExportLogs={() => { onSaveLogs(); onToggleOptionsMenu(); }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 自动滚动 + 清除 */}
                <div className="flex items-center gap-1 border-l border-[var(--st-ter-toolbar-divider)] pl-2">
                    <Tooltip content={autoScroll ? t('monitor.autoScrollOn') : t('monitor.autoScrollOff')} position="bottom">
                        <button
                            className={`w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors ${autoScroll ? 'bg-[var(--st-monitor-btn-autoscroll-active-bg)] text-[var(--st-ter-btn-autoscroll-active-text)] shadow-sm' : 'text-[var(--st-ter-btn-autoscroll-icon)] hover:bg-[var(--st-ter-btn-autoscroll-hover-bg)] bg-[var(--st-ter-btn-autoscroll-bg)] border border-[var(--st-ter-btn-autoscroll-border)]'}`}
                            onClick={onAutoScrollToggle}
                        >
                            <ArrowDownToLine size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('monitor.clearLogs')} position="bottom">
                        <button className="w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors text-[var(--st-ter-btn-clear-icon)] hover:bg-[var(--st-ter-btn-clear-hover-bg)] bg-[var(--st-ter-btn-clear-bg)] border border-[var(--st-ter-btn-clear-border)]" onClick={onClearLogs}><Trash2 size={14} /></button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
});

MonitorToolbar.displayName = 'MonitorToolbar';
