/**
 * SerialCRCPanel.tsx
 * CRC 校验配置面板 — 包含校验对象选择、算法选择、偏移量配置。
 * 从 SerialOptionsMenu.tsx 中拆分出来。
 */
import React from 'react';
import { Settings } from 'lucide-react';
import { CRCConfig } from '../../utils/crc';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';

interface SerialCRCPanelProps {
    crcEnabled: boolean;
    toggleCRC: () => void;
    rxCRC: CRCConfig;
    updateRxCRC: (updates: Partial<CRCConfig>) => void;
    showCRCPanel: boolean;
    setShowCRCPanel: (v: boolean) => void;
    uiState: Record<string, any>;
    saveUIState: (updates: Record<string, unknown>) => void;
}

export const SerialCRCPanel = React.memo(({
    crcEnabled, toggleCRC, rxCRC, updateRxCRC,
    showCRCPanel, setShowCRCPanel,
    uiState, saveUIState,
}: SerialCRCPanelProps) => {
    const { t } = useI18n();

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 group/crc">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0">{t('monitor.crcCheck')}</span>
                    <Tooltip content={t('monitor.crcConfig')} position="bottom">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowCRCPanel(!showCRCPanel); }}
                            className={`p-1 rounded hover:bg-[var(--st-serial-options-hover-bg)] text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-monitor-btn-text)] transition-colors flex-shrink-0 ${showCRCPanel ? 'bg-[var(--st-serial-btn-crc-active-bg)] text-white' : ''}`}
                        >
                            <Settings size={12} />
                        </button>
                    </Tooltip>
                </div>
                <Switch checked={crcEnabled} onChange={toggleCRC} />
            </div>

            {showCRCPanel && (
                <div className="bg-[rgba(128,128,128,0.05)] border border-[var(--border-color)] rounded p-2.5 space-y-3 mt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-[var(--input-placeholder-color)] font-medium">{t('monitor.crcTarget')}</span>
                        <CustomSelect
                            items={[
                                { label: t('monitor.crcTargetRx'), value: 'rx' },
                                { label: t('monitor.crcTargetTx'), value: 'tx' },
                                { label: t('monitor.crcTargetBoth'), value: 'both' }
                            ]}
                            value={uiState.crcTarget || 'rx'}
                            onChange={(val) => saveUIState({ crcTarget: val })}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-[var(--input-placeholder-color)] font-medium">{t('monitor.algorithm')}</span>
                        <CustomSelect
                            items={[
                                { label: 'Modbus CRC16', value: 'modbus-crc16' },
                                { label: 'CCITT CRC16', value: 'ccitt-crc16' },
                                { label: 'CRC32', value: 'crc32' },
                                { label: 'None', value: 'none' }
                            ]}
                            value={rxCRC.algorithm}
                            onChange={(val) => updateRxCRC({ algorithm: val as 'modbus-crc16' | 'ccitt-crc16' | 'crc32' | 'none' })}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] font-medium">{t('monitor.startOffset')}</span>
                        <input
                            type="number"
                            className="w-full bg-[var(--input-background)] border border-[var(--input-border-color)] text-[11px] text-[var(--input-foreground)] rounded-sm outline-none px-2 py-1 focus:border-[var(--focus-border-color)]"
                            value={rxCRC.startIndex}
                            onChange={(e) => updateRxCRC({ startIndex: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] font-medium">{t('monitor.endPosition')}</span>
                        <CustomSelect
                            items={[
                                { label: t('monitor.crcEndPacket'), value: '0' },
                                { label: t('monitor.crcExclude1'), value: '-1' },
                                { label: t('monitor.crcExclude2'), value: '-2' },
                                { label: t('monitor.crcExclude3'), value: '-3' }
                            ]}
                            value={(rxCRC.endIndex ?? 0).toString()}
                            onChange={(val) => updateRxCRC({ endIndex: parseInt(val) })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});

SerialCRCPanel.displayName = 'SerialCRCPanel';
