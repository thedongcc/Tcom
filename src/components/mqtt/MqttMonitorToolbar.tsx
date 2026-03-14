/**
 * MqttMonitorToolbar.tsx
 * MQTT 监视器工具栏组件。
 * 从 MqttMonitor.tsx 中拆分出来，负责统计数据、视图模式切换、选项菜单、操作按钮。
 */
import React from 'react';
import { Trash2, ArrowDownToLine, Menu, Download } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';
import { LogEntry } from '../../types/session';

interface FontItem {
    label: string;
    value: string;
    disabled?: boolean;
}

interface MqttMonitorToolbarProps {
    // 连接信息
    isConnected: boolean;
    host: string;
    port: number;
    logs: LogEntry[];
    // 过滤
    filterMode: 'all' | 'rx' | 'tx';
    setFilterMode: (mode: 'all' | 'rx' | 'tx') => void;
    // 视图模式
    viewMode: 'text' | 'hex' | 'json' | 'base64';
    setViewMode: (mode: 'text' | 'hex' | 'json' | 'base64') => void;
    // 选项菜单
    showOptionsMenu: boolean;
    setShowOptionsMenu: (show: boolean) => void;
    // 显示设置
    flashNewMessage: boolean;
    setFlashNewMessage: (v: boolean) => void;
    showTimestamp: boolean;
    setShowTimestamp: (v: boolean) => void;
    showDataLength: boolean;
    setShowDataLength: (v: boolean) => void;
    mergeRepeats: boolean;
    setMergeRepeats: (v: boolean) => void;
    // 字体设置
    fontSize: number;
    setFontSize: (v: number) => void;
    fontFamily: string;
    setFontFamily: (v: string) => void;
    availableFonts: FontItem[];
    // 自动滚动
    autoScroll: boolean;
    setAutoScroll: (v: boolean) => void;
    // 操作回调
    saveUIState: (updates: Record<string, unknown>) => void;
    onClearLogs?: () => void;
    handleSaveLogs: () => void;
}

export const MqttMonitorToolbar = React.memo(({
    isConnected, host, port, logs,
    filterMode, setFilterMode,
    viewMode, setViewMode,
    showOptionsMenu, setShowOptionsMenu,
    flashNewMessage, setFlashNewMessage,
    showTimestamp, setShowTimestamp,
    showDataLength, setShowDataLength,
    mergeRepeats, setMergeRepeats,
    fontSize, setFontSize,
    fontFamily, setFontFamily,
    availableFonts,
    autoScroll, setAutoScroll,
    saveUIState, onClearLogs, handleSaveLogs,
}: MqttMonitorToolbarProps) => {
    const { t } = useI18n();

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--st-toolbar-bg)] shrink-0">
            <div className="text-sm font-medium text-[var(--st-monitor-toolbar-foreground)] flex items-center gap-2">
                {isConnected ? (
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                ) : (
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                )}
                {host}:{port}
            </div>

            <div className="flex items-center gap-4">
                {/* 统计/过滤按钮 */}
                <div className="flex items-center border border-[var(--st-mqtt-filter-group-border)] rounded-[3px] divide-x divide-[var(--st-mqtt-filter-group-divider)] overflow-hidden h-[26px] bg-[var(--st-mqtt-filter-group-bg)]">
                    <Tooltip content={filterMode === 'rx' ? t('monitor.cancelFilter') : t('monitor.filterRxOnly')} position="bottom">
                        <div
                            className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-[var(--st-mqtt-btn-filter-rx-active-bg)] text-[var(--st-mqtt-btn-filter-rx-active-text)] shadow-sm' : 'hover:bg-[var(--st-mqtt-btn-filter-rx-hover-bg)] text-[var(--st-mqtt-btn-filter-rx-text)] bg-[var(--st-mqtt-btn-filter-rx-bg)]'}`}
                            onClick={() => { const m = filterMode === 'rx' ? 'all' : 'rx'; setFilterMode(m); saveUIState({ filterMode: m }); }}
                        >
                            <span className="text-[11px] font-bold font-mono opacity-70">R:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">
                                {logs.filter(l => l.type === 'RX').reduce((s, l) => s + (typeof l.data === 'string' ? l.data.length : l.data.length), 0).toLocaleString()}
                            </span>
                        </div>
                    </Tooltip>
                    <Tooltip content={filterMode === 'tx' ? t('monitor.cancelFilter') : t('monitor.filterTxOnly')} position="bottom">
                        <div
                            className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[var(--st-mqtt-btn-filter-tx-active-bg)] text-[var(--st-mqtt-btn-filter-tx-active-text)] shadow-sm' : 'hover:bg-[var(--st-mqtt-btn-filter-tx-hover-bg)] text-[var(--st-mqtt-btn-filter-tx-text)] bg-[var(--st-mqtt-btn-filter-tx-bg)]'}`}
                            onClick={() => { const m = filterMode === 'tx' ? 'all' : 'tx'; setFilterMode(m); saveUIState({ filterMode: m }); }}
                        >
                            <span className="text-[11px] font-bold font-mono opacity-70">T:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">
                                {logs.filter(l => l.type === 'TX').reduce((s, l) => s + (typeof l.data === 'string' ? l.data.length : l.data.length), 0).toLocaleString()}
                            </span>
                        </div>
                    </Tooltip>
                </div>

                {/* 视图模式切换 + 选项菜单 */}
                <div className="flex items-center gap-1.5">
                    {/* 视图模式切换 */}
                    <div className="flex items-center gap-0.5 p-0.5 rounded-[3px] border border-[var(--st-mqtt-view-group-border)] bg-[var(--st-mqtt-view-group-bg)] h-[26px]">
                        {(['hex', 'text', 'json', 'base64'] as const).map(m => (
                            <button
                                key={m}
                                className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === m ? 'bg-[var(--st-mqtt-btn-view-active-bg)] text-[var(--st-mqtt-btn-view-active-text)] shadow-sm' : 'text-[var(--st-mqtt-btn-view-text)] hover:bg-[var(--st-mqtt-btn-view-hover-bg)] bg-[var(--st-mqtt-btn-view-bg)]'}`}
                                onClick={() => { setViewMode(m); saveUIState({ viewMode: m }); }}
                            >
                                {m === 'text' ? 'TXT' : m === 'base64' ? 'B64' : m.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    {/* 选项菜单 */}
                    <div className="relative">
                        <button
                            className={`h-[26px] px-2 hover:bg-[var(--st-mqtt-options-hover-bg)] rounded-[3px] text-[var(--st-mqtt-btn-options-text)] bg-[var(--st-mqtt-btn-options-bg)] border-[var(--st-mqtt-btn-options-border)] transition-colors flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[var(--st-mqtt-options-hover-bg)] text-[var(--st-mqtt-btn-options-text)]' : ''}`}
                            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                        >
                            <Menu size={14} />
                            <span className="text-[11px] font-medium">{t('monitor.options')}</span>
                        </button>
                        {showOptionsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded-[3px] shadow-2xl p-3 z-50 min-w-[240px]">
                                    <div className="text-[12px] text-[var(--st-monitor-btn-text)] font-bold mb-4 pb-1 border-b border-[var(--menu-border-color)]">{t('monitor.logSettings')}</div>
                                    <div className="space-y-4 px-1">
                                        <div className="space-y-2.5">
                                            <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.display')}</div>
                                            <Switch label={t('monitor.flashNewMessage')} checked={flashNewMessage} onChange={val => { setFlashNewMessage(val); saveUIState({ flashNewMessage: val }); }} />
                                            <Switch label={t('monitor.timestamp')} checked={showTimestamp} onChange={val => { setShowTimestamp(val); saveUIState({ showTimestamp: val }); }} />
                                            <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={val => { setShowDataLength(val); saveUIState({ showDataLength: val }); }} />
                                            <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={val => { setMergeRepeats(val); saveUIState({ mergeRepeats: val }); }} />

                                            <div className="pt-2 mt-2 border-t border-[var(--menu-border-color)]">
                                                <div className="text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider mb-2">{t('monitor.typography')}</div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex flex-col gap-2">
                                                        <span className="text-[11px] text-[var(--st-monitor-toolbar-foreground)]">{t('monitor.fontFamily')}:</span>
                                                        <CustomSelect
                                                            items={availableFonts}
                                                            value={fontFamily}
                                                            onChange={(val) => { setFontFamily(val); saveUIState({ fontFamily: val }); }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2 mt-2">
                                                    <span className="text-[11px] text-[var(--st-monitor-toolbar-foreground)]">{t('monitor.fontSize')}:</span>
                                                    <CustomSelect
                                                        items={[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map(size => ({
                                                            label: `${size}px`,
                                                            value: size.toString()
                                                        }))}
                                                        value={fontSize.toString()}
                                                        onChange={(val) => { const size = Number(val); setFontSize(size); saveUIState({ fontSize: size }); }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-[var(--menu-border-color)]">
                                            <button className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[var(--st-monitor-btn-export-bg)] text-white text-[11px] rounded hover:bg-[var(--button-hover-background)] transition-colors" onClick={() => { handleSaveLogs(); setShowOptionsMenu(false); }}>
                                                <Download size={14} /> {t('monitor.exportLog')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 border-l border-[var(--st-mqtt-toolbar-divider)] pl-2">
                    <Tooltip content={autoScroll ? t('monitor.autoScrollOn') : t('monitor.autoScrollOff')} position="bottom">
                        <button
                            className={`w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors ${autoScroll ? 'bg-[var(--st-mqtt-btn-autoscroll-active-bg)] text-[var(--st-mqtt-btn-autoscroll-active-text)] shadow-sm' : 'text-[var(--st-mqtt-btn-autoscroll-icon)] hover:bg-[var(--st-mqtt-btn-autoscroll-hover-bg)] bg-[var(--st-mqtt-btn-autoscroll-bg)] border border-[var(--st-mqtt-btn-autoscroll-border)]'}`}
                            onClick={() => { setAutoScroll(!autoScroll); saveUIState({ autoScroll: !autoScroll }); }}
                        >
                            <ArrowDownToLine size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('monitor.clearLogs')} position="bottom">
                        <button
                            className="w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors text-[var(--st-mqtt-btn-clear-icon)] hover:bg-[var(--st-mqtt-btn-clear-hover-bg)] bg-[var(--st-mqtt-btn-clear-bg)] border border-[var(--st-mqtt-btn-clear-border)]"
                            onClick={() => onClearLogs?.()}
                        >
                            <Trash2 size={14} />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
});

MqttMonitorToolbar.displayName = 'MqttMonitorToolbar';
