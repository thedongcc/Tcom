/**
 * SerialOptionsMenu.tsx
 * 串口监视器选项菜单面板（编码/功能开关/排版/分包策略/导出）。
 * 从 SerialMonitor.tsx 中拆分出来。
 */
import { Download, Settings, Menu } from 'lucide-react';
import { CRCConfig } from '../../utils/crc';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';
import { useRef } from 'react';

interface SerialOptionsMenuProps {
    // 展示状态
    showOptionsMenu: boolean;
    setShowOptionsMenu: (show: boolean) => void;
    optionsMenuPos: { top: number; right: number };
    setOptionsMenuPos: (pos: { top: number; right: number }) => void;

    // 编码
    encoding: 'utf-8' | 'gbk' | 'ascii';
    setEncoding: (enc: 'utf-8' | 'gbk' | 'ascii') => void;

    // 功能开关
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

    // CRC
    crcEnabled: boolean;
    toggleCRC: () => void;
    rxCRC: CRCConfig;
    updateRxCRC: (updates: Partial<CRCConfig>) => void;
    showCRCPanel: boolean;
    setShowCRCPanel: (v: boolean) => void;

    // 排版
    fontSize: number;
    setFontSize: (v: number) => void;
    fontFamily: string;
    setFontFamily: (v: string) => void;
    availableFonts: any[];

    // 分包
    uiState: Record<string, any>;
    saveUIState: (updates: Record<string, unknown>) => void;

    // 操作
    handleSaveLogs: () => void;
}

export const SerialOptionsMenu = ({
    showOptionsMenu, setShowOptionsMenu, optionsMenuPos, setOptionsMenuPos,
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
    handleSaveLogs,
}: SerialOptionsMenuProps) => {
    const { t } = useI18n();
    const optionsButtonRef = useRef<HTMLButtonElement>(null);

    return (
        <div className="relative">
            <button
                ref={optionsButtonRef}
                className={`h-[26px] px-2 hover:bg-[var(--st-serial-options-hover-bg)] rounded-[3px] text-[var(--st-serial-btn-options-text)] bg-[var(--st-serial-btn-options-bg)] border-[var(--st-serial-btn-options-border)] transition-colors flex items-center gap-1.5 ${showOptionsMenu ? 'bg-[var(--st-serial-options-hover-bg)] text-[var(--st-serial-btn-options-text)]' : ''}`}
                onClick={() => {
                    if (!showOptionsMenu && optionsButtonRef.current) {
                        const rect = optionsButtonRef.current.getBoundingClientRect();
                        setOptionsMenuPos({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right
                        });
                    }
                    setShowOptionsMenu(!showOptionsMenu);
                }}
            >
                <Menu size={14} />
                <span className="text-[11px] font-medium">{t('monitor.options')}</span>
            </button>
            {showOptionsMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowOptionsMenu(false)} />
                    <div
                        className="fixed bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded-[3px] shadow-2xl p-3 z-50 min-w-[280px] flex flex-col"
                        style={{
                            top: optionsMenuPos.top,
                            right: optionsMenuPos.right,
                            maxHeight: `calc(100vh - ${optionsMenuPos.top + 10}px)`,
                            overflowY: 'auto'
                        }}
                    >
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
                                <Switch label={t('monitor.packetType')} checked={showPacketType} onChange={(checked) => { setShowPacketType(checked); saveUIState({ showPacketType: checked }); }} />
                                <Switch label={t('monitor.showControlChars') || '控制字符可视化'} checked={showControlChars} onChange={(checked) => { setShowControlChars(checked); saveUIState({ showControlChars: checked }); }} />
                                <Switch label={t('monitor.dataLength')} checked={showDataLength} onChange={(checked) => { setShowDataLength(checked); saveUIState({ showDataLength: checked }); }} />
                                <Switch label={t('monitor.mergeRepeats')} checked={mergeRepeats} onChange={(checked) => { setMergeRepeats(checked); saveUIState({ mergeRepeats: checked }); }} />
                                <Switch label={t('monitor.flashNewMessage')} checked={flashNewMessage} onChange={(checked) => { setFlashNewMessage(checked); saveUIState({ flashNewMessage: checked }); }} />

                                {/* CRC */}
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
                                                <span className="text-[10px] text-[var(--input-placeholder-color)] font-medium">校验对象</span>
                                                <CustomSelect
                                                    items={[
                                                        { label: '仅接收 (RX)', value: 'rx' },
                                                        { label: '仅发送 (TX)', value: 'tx' },
                                                        { label: '发送与接收 (TX+RX)', value: 'both' }
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

                                {/* 接收分包策略 */}
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
                                                value={uiState.rxPacketMode as string || 'none'}
                                                onChange={(val) => saveUIState({ rxPacketMode: val })}
                                            />
                                        </div>
                                    </div>

                                    {/* 展开的参数配置行 */}
                                    {uiState.rxPacketMode && uiState.rxPacketMode !== 'none' && (
                                        <div className="flex flex-col gap-2 mt-1">
                                            {(uiState.rxPacketMode === 'delimiter' || uiState.rxPacketMode === 'delimiterWithTimeout') && (
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
                                            {(uiState.rxPacketMode === 'fixedLength' || uiState.rxPacketMode === 'fixedLengthWithTimeout') && (
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
                                            {(uiState.rxPacketMode === 'timeout' || uiState.rxPacketMode === 'delimiterWithTimeout' || uiState.rxPacketMode === 'fixedLengthWithTimeout') && (
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
                            </div>
                        </div>

                        {/* 导出按钮 */}
                        <div className="pt-2 border-t border-[#3c3c3c]">
                            <button
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--st-btn-primary-bg)] hover:bg-[var(--st-btn-primary-hover)] text-white text-[11px] rounded transition-colors"
                                onClick={() => {
                                    handleSaveLogs();
                                    setShowOptionsMenu(false);
                                }}
                            >
                                <Download size={14} />
                                <span>{t('monitor.exportLog')}</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
