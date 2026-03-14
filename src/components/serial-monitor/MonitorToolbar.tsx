/**
 * MonitorToolbar.tsx
 * 串口监控器工具栏 — 过滤器、视图模式、选项菜单、自动滚动和清除。
 * 从 MonitorTerminal.tsx 中拆分出来。
 */
import React from 'react';
import { Trash2, ArrowDownToLine, Download, Menu, X } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { MonitorSessionConfig } from '../../types/session';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

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
    showDataLength: boolean;
    mergeRepeats: boolean;
    flashNewMessage: boolean;
    encoding: 'utf-8' | 'gbk' | 'ascii';
    fontFamily: string;
    fontSize: number;
    availableFonts: any[];
    // 回调
    onFilterChange: (mode: 'all' | 'rx' | 'tx') => void;
    onViewModeChange: (mode: 'text' | 'hex' | 'both') => void;
    onAutoScrollToggle: () => void;
    onToggleOptionsMenu: () => void;
    onClearLogs: () => void;
    onSaveLogs: () => void;
    // 选项变更
    onShowTimestamp: (v: boolean) => void;
    onShowPacketType: (v: boolean) => void;
    onShowDataLength: (v: boolean) => void;
    onMergeRepeats: (v: boolean) => void;
    onFlashNewMessage: (v: boolean) => void;
    onEncoding: (v: string) => void;
    onFontFamily: (v: string) => void;
    onFontSize: (v: number) => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const MonitorToolbar = React.memo(({
    isConnected, config, txBytes, rxBytes,
    filterMode, viewMode, autoScroll, showOptionsMenu,
    showTimestamp, showPacketType, showDataLength, mergeRepeats, flashNewMessage,
    encoding, fontFamily, fontSize, availableFonts,
    onFilterChange, onViewModeChange, onAutoScrollToggle, onToggleOptionsMenu,
    onClearLogs, onSaveLogs,
    onShowTimestamp, onShowPacketType, onShowDataLength, onMergeRepeats, onFlashNewMessage,
    onEncoding, onFontFamily, onFontSize,
    scrollRef,
}: MonitorToolbarProps) => {
    const { t } = useI18n();

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--st-widget-border)] bg-[var(--st-toolbar-bg)] shrink-0">
            <div className="text-sm font-medium text-[var(--st-monitor-toolbar-foreground)] flex items-center gap-2">
                {isConnected ? <div className="w-2 h-2 rounded-full bg-[var(--st-monitor-status-online)] shadow-[0_0_8px_var(--st-monitor-status-online)] animate-pulse" style={{ opacity: 0.8 }} /> : <div className="w-2 h-2 rounded-full bg-[var(--st-monitor-status-offline)]" />}
                <span className="opacity-80">Monitor: </span>
                <span className="text-blue-400 font-bold">{(config as MonitorSessionConfig).virtualSerialPort}</span>
                <span className="text-gray-600 px-1">⟷</span>
                <span className="text-emerald-400 font-bold">{(config as MonitorSessionConfig).connection?.path || 'No Device'}</span>
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
                        <button className={`h-[26px] px-2 hover:bg-[var(--monitor-options-hover-bg)] rounded-[3px] text-[var(--st-ter-btn-options-text)] bg-[var(--st-ter-btn-options-bg)] border-[var(--st-ter-btn-options-border)] transition-colors flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[var(--monitor-options-hover-bg)]' : ''}`} onClick={onToggleOptionsMenu}>
                            <Menu size={14} /> <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                        </button>
                        {showOptionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={onToggleOptionsMenu} />
                                <div className="absolute right-0 top-full mt-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded-[3px] shadow-2xl p-3 z-50 min-w-[260px]">
                                    <div className="flex items-center justify-between mb-4 pb-1 border-b border-[var(--menu-border-color)]">
                                        <div className="text-[12px] text-[var(--menu-foreground)] font-bold">{t('monitor.logSettings')}</div>
                                        <X size={14} className="cursor-pointer text-[var(--activitybar-inactive-foreground)] hover:text-[var(--menu-foreground)]" onClick={onToggleOptionsMenu} />
                                    </div>
                                    <div className="space-y-4 px-1">
                                        <div className="space-y-2.5">
                                            <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.display')}</div>
                                            <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2 hidden">{t('monitor.encoding')}</div>
                                            <CustomSelect items={[{ label: 'UTF-8', value: 'utf-8' }, { label: 'GBK', value: 'gbk' }, { label: 'ASCII', value: 'ascii' }]} value={encoding} onChange={(val) => onEncoding(val)} />
                                            <Switch label={t('monitor.timestamp')} checked={showTimestamp} onChange={onShowTimestamp} />
                                            <Switch label={t('monitor.packetType')} checked={showPacketType} onChange={onShowPacketType} />
                                            <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={onShowDataLength} />
                                            <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={onMergeRepeats} />
                                            <Switch label={t('monitor.flashNewMessage')} checked={flashNewMessage} onChange={onFlashNewMessage} />
                                            <div className="pt-2 mt-2 border-t border-[var(--menu-border-color)]">
                                                <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.typography')}</div>
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('monitor.fontFamily')}:</span>
                                                    <CustomSelect items={availableFonts} value={fontFamily} onChange={(val) => onFontFamily(val)} />
                                                </div>
                                                <div className="flex flex-col gap-2 mt-2">
                                                    <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('monitor.fontSize')}:</span>
                                                    <CustomSelect items={[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map(size => ({ label: `${size}px`, value: size.toString() }))} value={fontSize.toString()} onChange={(val) => onFontSize(Number(val))} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-[var(--menu-border-color)]">
                                            <button className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[var(--st-monitor-btn-export-bg)] text-white text-[11px] rounded hover:bg-[var(--button-hover-background)] transition-colors" onClick={() => { onSaveLogs(); onToggleOptionsMenu(); }}>
                                                <Download size={14} /> {t('monitor.exportLog')}
                                            </button>
                                        </div>
                                    </div>
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
