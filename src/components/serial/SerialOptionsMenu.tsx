/**
 * SerialOptionsMenu.tsx
 * 串口监视器选项菜单 — 按钮 + 浮层定位 Shell。
 * 内部包裹通用 MonitorOptionsPanel 组件，透传所有 Props。
 */
import { Menu } from 'lucide-react';
import { CRCConfig } from '../../utils/crc';
import { useI18n } from '../../context/I18nContext';
import { useRef } from 'react';
import { MonitorOptionsPanel } from '../common/MonitorOptionsPanel';

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
    hasLogs: boolean;
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
    handleSaveLogs, hasLogs,
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
                        <MonitorOptionsPanel
                            encoding={encoding} setEncoding={setEncoding}
                            showTimestamp={showTimestamp} setShowTimestamp={setShowTimestamp}
                            showPacketType={showPacketType} setShowPacketType={setShowPacketType}
                            showControlChars={showControlChars} setShowControlChars={setShowControlChars}
                            showDataLength={showDataLength} setShowDataLength={setShowDataLength}
                            mergeRepeats={mergeRepeats} setMergeRepeats={setMergeRepeats}
                            flashNewMessage={flashNewMessage} setFlashNewMessage={setFlashNewMessage}
                            crcEnabled={crcEnabled} toggleCRC={toggleCRC}
                            rxCRC={rxCRC} updateRxCRC={updateRxCRC}
                            showCRCPanel={showCRCPanel} setShowCRCPanel={setShowCRCPanel}
                            fontSize={fontSize} setFontSize={setFontSize}
                            fontFamily={fontFamily} setFontFamily={setFontFamily}
                            availableFonts={availableFonts}
                            uiState={uiState} saveUIState={saveUIState}
                            hasLogs={hasLogs}
                            onExportLogs={() => {
                                handleSaveLogs();
                                setShowOptionsMenu(false);
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    );
};
