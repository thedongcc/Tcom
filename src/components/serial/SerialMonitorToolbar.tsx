/**
 * SerialMonitorToolbar.tsx
 * 串口监视器顶部工具栏组件。
 * 从 SerialMonitor.tsx 中拆分出来，包含连接状态指示器、TX/RX 过滤器、
 * 视图模式切换、选项菜单入口和操作按钮。
 */
import { Trash2, ArrowDownToLine } from 'lucide-react';
import { SessionConfig } from '../../types/session';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { SerialOptionsMenu } from './SerialOptionsMenu';
import type { SerialMonitorDisplayState } from './useSerialMonitorState';
import type { CRCConfig } from '../../utils/crc';

interface SerialMonitorToolbarProps {
    /** 显示状态管理（由 useSerialMonitorState 提供） */
    displayState: SerialMonitorDisplayState;
    /** 连接状态 */
    isConnected: boolean;
    /** 会话配置 */
    config: SessionConfig;
    /** TX 字节数统计 */
    txBytes: number;
    /** RX 字节数统计 */
    rxBytes: number;
    /** CRC 相关状态 */
    crcEnabled: boolean;
    toggleCRC: () => void;
    rxCRC: CRCConfig;
    updateRxCRC: (updates: Partial<CRCConfig>) => void;
    /** 清除日志 */
    onClearLogs: () => void;
    /** 导出日志 */
    onSaveLogs: () => void;
    /** 滚动容器引用（用于自动滚动切换） */
    scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function SerialMonitorToolbar({
    displayState,
    isConnected,
    config,
    txBytes,
    rxBytes,
    crcEnabled,
    toggleCRC,
    rxCRC,
    updateRxCRC,
    onClearLogs,
    onSaveLogs,
    scrollRef,
}: SerialMonitorToolbarProps) {
    const { t } = useI18n();
    const {
        viewMode, setViewMode,
        filterMode, setFilterMode,
        autoScroll, setAutoScroll,
        showOptionsMenu, setShowOptionsMenu,
        optionsMenuPos, setOptionsMenuPos,
        showTimestamp, setShowTimestamp,
        showPacketType, setShowPacketType,
        showControlChars, setShowControlChars,
        showDataLength, setShowDataLength,
        mergeRepeats, setMergeRepeats,
        flashNewMessage, setFlashNewMessage,
        showCRCPanel, setShowCRCPanel,
        fontSize, setFontSize,
        fontFamily, setFontFamily,
        availableFonts,
        encoding, setEncoding,
        uiState, saveUIState,
    } = displayState;

    const toggleFilter = (mode: 'tx' | 'rx') => {
        const newMode = filterMode === mode ? 'all' : mode;
        setFilterMode(newMode);
        saveUIState({ filterMode: newMode });
    };

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--st-toolbar-bg)] shrink-0">
            {/* 连接状态 + 端口信息 */}
            <div className="text-sm font-medium text-[var(--st-monitor-toolbar-foreground)] flex items-center gap-2">
                {isConnected ? (
                    <div className="w-2 h-2 rounded-full bg-[var(--st-monitor-status-online)] shadow-[0_0_8px_var(--st-monitor-status-online)] animate-pulse" style={{ opacity: 0.8 }} />
                ) : (
                    <div className="w-2 h-2 rounded-full bg-[var(--st-monitor-status-offline)]" />
                )}

                {config.type === 'serial' ?
                    `${config.connection.path || 'No Port'}-${config.connection.baudRate}-${config.connection.dataBits}${(config.connection.parity ?? 'none') === 'none' ? 'N' : (config.connection.parity ?? 'none').toUpperCase()}${config.connection.stopBits}`
                    : config.type === 'mqtt' ?
                        `${config.host}:${config.port} ` : 'Connected'}
            </div>

            <div className="flex items-center gap-4">
                {/* TX/RX 统计过滤器 */}
                <div className="flex items-center border border-[var(--st-serial-filter-group-border)] rounded-[3px] divide-x divide-[var(--st-serial-filter-group-divider)] overflow-hidden h-[26px] bg-[var(--st-serial-filter-group-bg)]">
                    <Tooltip content={filterMode === 'tx' ? t('monitor.cancelFilter') : t('monitor.filterTxOnly')} position="bottom">
                        <div
                            className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'tx' ? 'bg-[var(--st-serial-btn-filter-tx-active-bg)] text-[var(--st-serial-btn-filter-tx-active-text)] shadow-sm' : 'hover:bg-[var(--st-serial-btn-filter-tx-hover-bg)] text-[var(--st-serial-btn-filter-tx-text)] bg-[var(--st-serial-btn-filter-tx-bg)]'}`}
                            onClick={() => toggleFilter('tx')}
                        >
                            <span className="text-[11px] font-bold font-mono opacity-70">T:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{txBytes.toLocaleString()}</span>
                        </div>
                    </Tooltip>
                    <Tooltip content={filterMode === 'rx' ? t('monitor.cancelFilter') : t('monitor.filterRxOnly')} position="bottom">
                        <div
                            className={`flex items-center justify-between gap-1.5 px-2 min-w-[56px] h-full transition-colors cursor-pointer ${filterMode === 'rx' ? 'bg-[var(--st-serial-btn-filter-rx-active-bg)] text-[var(--st-serial-btn-filter-rx-active-text)] shadow-sm' : 'hover:bg-[var(--st-serial-btn-filter-rx-hover-bg)] text-[var(--st-serial-btn-filter-rx-text)] bg-[var(--st-serial-btn-filter-rx-bg)]'}`}
                            onClick={() => toggleFilter('rx')}
                        >
                            <span className="text-[11px] font-bold font-mono opacity-70">R:</span>
                            <span className="text-[11px] font-bold font-mono tabular-nums leading-none">{rxBytes.toLocaleString()}</span>
                        </div>
                    </Tooltip>
                </div>

                {/* 视图模式切换 + 选项菜单 */}
                <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5 p-0.5 rounded-[3px] border border-[var(--st-serial-view-group-border)] bg-[var(--st-serial-view-group-bg)] h-[26px]">
                        <button
                            className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === 'hex' || viewMode === 'both' ? 'bg-[var(--st-serial-btn-view-active-bg)] text-[var(--st-serial-btn-view-active-text)] shadow-sm' : 'text-[var(--st-serial-btn-view-text)] hover:bg-[var(--st-serial-btn-view-hover-bg)] bg-[var(--st-serial-btn-view-bg)]'}`}
                            onClick={() => {
                                if (viewMode === 'hex') return;
                                const newMode = viewMode === 'both' ? 'text' : 'both';
                                setViewMode(newMode);
                                saveUIState({ viewMode: newMode });
                            }}
                        >
                            HEX
                        </button>
                        <button
                            className={`flex items-center justify-center px-2 h-full text-[10px] font-medium leading-none rounded-[2px] uppercase transition-colors ${viewMode === 'text' || viewMode === 'both' ? 'bg-[var(--st-serial-btn-view-active-bg)] text-[var(--st-serial-btn-view-active-text)] shadow-sm' : 'text-[var(--st-serial-btn-view-text)] hover:bg-[var(--st-serial-btn-view-hover-bg)] bg-[var(--st-serial-btn-view-bg)]'}`}
                            onClick={() => {
                                if (viewMode === 'text') return;
                                const newMode = viewMode === 'both' ? 'hex' : 'both';
                                setViewMode(newMode);
                                saveUIState({ viewMode: newMode });
                            }}
                        >
                            TXT
                        </button>
                    </div>

                    {/* 选项菜单 */}
                    <SerialOptionsMenu
                        showOptionsMenu={showOptionsMenu} setShowOptionsMenu={setShowOptionsMenu}
                        optionsMenuPos={optionsMenuPos} setOptionsMenuPos={setOptionsMenuPos}
                        encoding={encoding} setEncoding={setEncoding}
                        showTimestamp={showTimestamp} setShowTimestamp={setShowTimestamp}
                        showPacketType={showPacketType} setShowPacketType={setShowPacketType}
                        showControlChars={showControlChars} setShowControlChars={setShowControlChars}
                        showDataLength={showDataLength} setShowDataLength={setShowDataLength}
                        mergeRepeats={mergeRepeats} setMergeRepeats={setMergeRepeats}
                        flashNewMessage={flashNewMessage} setFlashNewMessage={setFlashNewMessage}
                        crcEnabled={crcEnabled} toggleCRC={toggleCRC} rxCRC={rxCRC} updateRxCRC={updateRxCRC}
                        showCRCPanel={showCRCPanel} setShowCRCPanel={setShowCRCPanel}
                        fontSize={fontSize} setFontSize={setFontSize}
                        fontFamily={fontFamily} setFontFamily={setFontFamily}
                        availableFonts={availableFonts}
                        uiState={uiState} saveUIState={saveUIState}
                        handleSaveLogs={onSaveLogs}
                    />
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 border-l border-[var(--st-serial-toolbar-divider)] pl-2">
                    <Tooltip content={autoScroll ? t('monitor.autoScrollOn') : t('monitor.autoScrollOff')} position="bottom">
                        <button
                            className={`w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors ${autoScroll ? 'bg-[var(--st-serial-btn-autoscroll-active-bg)] text-[var(--st-serial-btn-autoscroll-active-text)] shadow-sm' : 'text-[var(--st-serial-btn-autoscroll-icon)] hover:bg-[var(--st-serial-btn-autoscroll-hover-bg)] bg-[var(--st-serial-btn-autoscroll-bg)] border border-[var(--st-serial-btn-autoscroll-border)]'}`}
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
                            className="w-7 h-[26px] flex items-center justify-center rounded-[3px] transition-colors text-[var(--st-serial-btn-clear-icon)] hover:bg-[var(--st-serial-btn-clear-hover-bg)] bg-[var(--st-serial-btn-clear-bg)] border border-[var(--st-serial-btn-clear-border)]"
                            onClick={onClearLogs}
                        >
                            <Trash2 size={14} />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}
