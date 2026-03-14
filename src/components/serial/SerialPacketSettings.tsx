/**
 * SerialPacketSettings.tsx
 * 接收分包策略配置面板 — 分包模式选择及参数配置。
 * 从 SerialOptionsMenu.tsx 中拆分出来。
 */
import React from 'react';
import { CustomSelect } from '../common/CustomSelect';
import { useI18n } from '../../context/I18nContext';

interface SerialPacketSettingsProps {
    uiState: Record<string, any>;
    saveUIState: (updates: Record<string, unknown>) => void;
}

export const SerialPacketSettings = React.memo(({ uiState, saveUIState }: SerialPacketSettingsProps) => {
    const { t } = useI18n();
    const rxPacketMode = uiState.rxPacketMode as string || 'none';

    return (
        <div className="flex flex-col gap-1.5 mt-2">
            <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0">{t('monitor.rxPacketSection')}</span>
                <div className="flex-1 max-w-[150px]">
                    <CustomSelect
                        items={[
                            { label: t('monitor.rxPacketMode_none'), value: 'none', description: t('monitor.rxPacketMode_none_tip') },
                            { label: t('monitor.rxPacketMode_timeout'), value: 'timeout', description: t('monitor.rxPacketMode_timeout_tip') },
                            { label: t('monitor.rxPacketMode_delimiter'), value: 'delimiter', description: t('monitor.rxPacketMode_delimiter_tip') },
                            { label: t('monitor.rxPacketMode_fixedLength'), value: 'fixedLength', description: t('monitor.rxPacketMode_fixedLength_tip') },
                            { label: t('monitor.rxPacketMode_delimiterWithTimeout'), value: 'delimiterWithTimeout', description: t('monitor.rxPacketMode_delimiterWithTimeout_tip') },
                            { label: t('monitor.rxPacketMode_fixedLengthWithTimeout'), value: 'fixedLengthWithTimeout', description: t('monitor.rxPacketMode_fixedLengthWithTimeout_tip') },
                        ]}
                        value={rxPacketMode}
                        onChange={(val) => saveUIState({ rxPacketMode: val })}
                    />
                </div>
            </div>

            {/* 展开的参数配置行 */}
            {rxPacketMode !== 'none' && (
                <div className="flex flex-col gap-2 mt-1">
                    {(rxPacketMode === 'delimiter' || rxPacketMode === 'delimiterWithTimeout') && (
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0 truncate max-w-[80px]" title={t('monitor.rxDelimiterLabel')}>{t('monitor.rxDelimiterLabel')}</span>
                            <div className="flex-1 max-w-[150px]">
                                <CustomSelect
                                    items={[
                                        { label: '\\r\\n (CRLF)', value: '\\r\\n' },
                                        { label: '\\n (LF)', value: '\\n' },
                                        { label: '\\r (CR)', value: '\\r' },
                                        { label: '\\t (TAB)', value: '\\t' },
                                    ]}
                                    value={uiState.rxDelimiter ?? '\\r\\n'}
                                    onChange={(val) => saveUIState({ rxDelimiter: val })}
                                    allowCustom={true}
                                />
                            </div>
                        </div>
                    )}
                    {(rxPacketMode === 'fixedLength' || rxPacketMode === 'fixedLengthWithTimeout') && (
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0 truncate max-w-[80px]" title={t('monitor.rxFixedLengthLabel')}>{t('monitor.rxFixedLengthLabel')}</span>
                            <div className="flex-1 max-w-[150px]">
                                <CustomSelect
                                    items={[
                                        { label: '8', value: '8' },
                                        { label: '16', value: '16' },
                                        { label: '32', value: '32' },
                                        { label: '64', value: '64' },
                                        { label: '128', value: '128' },
                                    ]}
                                    value={(uiState.rxFixedLength ?? 8).toString()}
                                    onChange={(val) => {
                                        const num = parseInt(val);
                                        if (!isNaN(num) && num > 0) saveUIState({ rxFixedLength: num });
                                    }}
                                    allowCustom={true}
                                />
                            </div>
                        </div>
                    )}
                    {(rxPacketMode === 'timeout' || rxPacketMode === 'delimiterWithTimeout' || rxPacketMode === 'fixedLengthWithTimeout') && (
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium shrink-0 truncate max-w-[80px]" title={t('monitor.rxTimeoutMsLabel')}>{t('monitor.rxTimeoutMsLabel')}</span>
                            <div className="flex-1 max-w-[150px]">
                                <CustomSelect
                                    items={[
                                        { label: '20', value: '20' },
                                        { label: '50', value: '50' },
                                        { label: '100', value: '100' },
                                        { label: '200', value: '200' },
                                        { label: '500', value: '500' },
                                    ]}
                                    value={(uiState.rxTimeoutMs ?? 50).toString()}
                                    onChange={(val) => {
                                        const num = parseInt(val);
                                        if (!isNaN(num) && num > 0) saveUIState({ rxTimeoutMs: num });
                                    }}
                                    allowCustom={true}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

SerialPacketSettings.displayName = 'SerialPacketSettings';
