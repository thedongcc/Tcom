/**
 * MonitorOptionsPanel.tsx
 * 通用监视器选项面板 — 编码/功能开关/CRC/排版/分包/导出。
 * 配置驱动，通过 Feature Flags 隐藏不适用的功能模块。
 *
 * 使用方：
 * - SerialOptionsMenu（完整功能）
 * - MonitorToolbar（完整功能）
 * - MqttMonitorToolbar（hideCRC + hidePacketSettings）
 */
import { Download } from 'lucide-react';
import { CRCConfig } from '../../utils/crc';
import { CustomSelect } from './CustomSelect';
import { Switch } from './Switch';
import { useI18n } from '../../context/I18nContext';
import { CRCPanel } from './CRCPanel';
import { PacketSettingsPanel } from './PacketSettingsPanel';

export interface MonitorOptionsPanelProps {
    // ── 编码 ──
    encoding: 'utf-8' | 'gbk' | 'ascii';
    setEncoding: (enc: 'utf-8' | 'gbk' | 'ascii') => void;

    // ── 功能开关 ──
    showTimestamp: boolean;
    setShowTimestamp: (v: boolean) => void;
    showPacketType: boolean;
    setShowPacketType: (v: boolean) => void;
    showControlChars: boolean;
    setShowControlChars: (v: boolean) => void;
    showDataLength: boolean;
    setShowDataLength: (v: boolean) => void;
    mergeRepeats: boolean;
    setMergeRepeats: (v: boolean) => void;
    flashNewMessage: boolean;
    setFlashNewMessage: (v: boolean) => void;

    // ── CRC（可隐藏） ──
    crcEnabled?: boolean;
    toggleCRC?: () => void;
    rxCRC?: CRCConfig;
    updateRxCRC?: (updates: Partial<CRCConfig>) => void;
    showCRCPanel?: boolean;
    setShowCRCPanel?: (v: boolean) => void;

    // ── 排版 ──
    fontSize: number;
    setFontSize: (v: number) => void;
    fontFamily: string;
    setFontFamily: (v: string) => void;
    availableFonts: any[];

    // ── 分包（可隐藏） ──
    uiState: Record<string, any>;
    saveUIState: (updates: Record<string, unknown>) => void;

    // ── 导出 ──
    hasLogs: boolean;
    onExportLogs: () => void;

    // ── Feature Flags ──
    /** 隐藏 CRC 校验面板（如 MQTT 不需要） */
    hideCRC?: boolean;
    /** 隐藏接收分包策略（如 MQTT 不需要） */
    hidePacketSettings?: boolean;
    /** 隐藏报文方向开关 */
    hidePacketType?: boolean;
}

export const MonitorOptionsPanel = ({
    encoding, setEncoding,
    showTimestamp, setShowTimestamp,
    showPacketType, setShowPacketType,
    showControlChars, setShowControlChars,
    showDataLength, setShowDataLength,
    mergeRepeats, setMergeRepeats,
    flashNewMessage, setFlashNewMessage,
    crcEnabled, toggleCRC, rxCRC, updateRxCRC,
    showCRCPanel, setShowCRCPanel,
    fontSize, setFontSize, fontFamily, setFontFamily, availableFonts,
    uiState, saveUIState,
    hasLogs, onExportLogs,
    hideCRC = false,
    hidePacketSettings = false,
    hidePacketType = false,
}: MonitorOptionsPanelProps) => {
    const { t } = useI18n();

    return (
        <div className="flex flex-col">
            {/* 编码 */}
            <div className="mb-3 px-1">
                <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider">
                    <span>{t('monitor.encoding')}</span>
                    <div className="h-[1px] bg-[var(--menu-border-color)] flex-1" />
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0">{t('monitor.encoding')}</span>
                    <div className="flex-1 max-w-[150px]">
                        <CustomSelect
                            items={[
                                { label: 'UTF-8', value: 'utf-8' },
                                { label: 'GBK', value: 'gbk' },
                                { label: 'ASCII', value: 'ascii' }
                            ]}
                            value={encoding}
                            onChange={(val) => { setEncoding(val as 'utf-8' | 'gbk' | 'ascii'); saveUIState({ encoding: val }); }}
                        />
                    </div>
                </div>
            </div>

            {/* 功能开关 */}
            <div className="mb-3 px-1">
                <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider">
                    <span>{t('monitor.logFeatures')}</span>
                    <div className="h-[1px] bg-[var(--menu-border-color)] flex-1" />
                </div>
                <div className="space-y-2.5">
                    <Switch label={t('monitor.timestamp')} checked={showTimestamp} onChange={(checked) => { setShowTimestamp(checked); saveUIState({ showTimestamp: checked }); }} />
                    {!hidePacketType && (
                        <Switch label={t('monitor.packetType')} checked={showPacketType} onChange={(checked) => { setShowPacketType(checked); saveUIState({ showPacketType: checked }); }} />
                    )}
                    <Switch label={t('monitor.showControlChars') || '控制字符可视化'} checked={showControlChars} onChange={(checked) => { setShowControlChars(checked); saveUIState({ showControlChars: checked }); }} />
                    <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={(checked) => { setShowDataLength(checked); saveUIState({ showDataLength: checked }); }} />
                    <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={(checked) => { setMergeRepeats(checked); saveUIState({ mergeRepeats: checked }); }} />
                    <Switch label={t('monitor.flashNewMessage')} checked={flashNewMessage} onChange={(checked) => { setFlashNewMessage(checked); saveUIState({ flashNewMessage: checked }); }} />

                    {/* CRC 配置（可隐藏） */}
                    {!hideCRC && crcEnabled !== undefined && toggleCRC && rxCRC && updateRxCRC && showCRCPanel !== undefined && setShowCRCPanel && (
                        <CRCPanel
                            crcEnabled={crcEnabled} toggleCRC={toggleCRC}
                            rxCRC={rxCRC} updateRxCRC={updateRxCRC}
                            showCRCPanel={showCRCPanel} setShowCRCPanel={setShowCRCPanel}
                            uiState={uiState} saveUIState={saveUIState}
                        />
                    )}
                </div>
            </div>

            {/* 排版 & 分包 */}
            <div className="mb-4 px-1">
                <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wider">
                    <span>{t('monitor.typography')}</span>
                    <div className="h-[1px] bg-[var(--menu-border-color)] flex-1" />
                </div>
                <div className="space-y-3">
                    {/* 字号 */}
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0">{t('monitor.fontSize')}</span>
                        <div className="flex-1 max-w-[150px]">
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

                    {/* 字体 */}
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0">{t('monitor.fontFamily')}</span>
                        <div className="flex-1 max-w-[150px]">
                            <CustomSelect
                                items={availableFonts}
                                value={fontFamily}
                                onChange={(val) => { setFontFamily(val); saveUIState({ fontFamily: val }); }}
                            />
                        </div>
                    </div>

                    {/* 接收分包策略（可隐藏） */}
                    {!hidePacketSettings && (
                        <PacketSettingsPanel uiState={uiState} saveUIState={saveUIState} />
                    )}
                </div>
            </div>

            {/* 导出按钮 */}
            <div className="pt-2 border-t border-[var(--st-monitor-divider)]">
                <button
                    disabled={!hasLogs}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-white text-[11px] rounded transition-colors ${
                        hasLogs
                            ? 'bg-[var(--st-btn-primary-bg)] hover:bg-[var(--st-btn-primary-hover)] cursor-pointer'
                            : 'bg-[var(--st-btn-primary-bg)] opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => { if (hasLogs) onExportLogs(); }}
                >
                    <Download size={14} />
                    <span>{t('monitor.exportLog')}</span>
                </button>
            </div>
        </div>
    );
};
