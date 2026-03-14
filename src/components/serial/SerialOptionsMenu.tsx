/**
 * SerialOptionsMenu.tsx
 * 串口监视器选项菜单面板 — 组合编码/功能开关/排版/CRC/分包/导出子模块。
 *
 * 子模块：
 * - SerialCRCPanel.tsx       — CRC 校验配置
 * - SerialPacketSettings.tsx — 接收分包策略
 */
import { Download, Menu } from 'lucide-react';
import { CRCConfig } from '../../utils/crc';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { useI18n } from '../../context/I18nContext';
import { useRef } from 'react';
import { SerialCRCPanel } from './SerialCRCPanel';
import { SerialPacketSettings } from './SerialPacketSettings';

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

                                {/* CRC 配置 */}
                                <SerialCRCPanel
                                    crcEnabled={crcEnabled} toggleCRC={toggleCRC}
                                    rxCRC={rxCRC} updateRxCRC={updateRxCRC}
                                    showCRCPanel={showCRCPanel} setShowCRCPanel={setShowCRCPanel}
                                    uiState={uiState} saveUIState={saveUIState}
                                />
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
                                <SerialPacketSettings uiState={uiState} saveUIState={saveUIState} />
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
