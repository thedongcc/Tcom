/**
 * SerialInputToolbar.tsx
 * 串口输入工具栏组件 — 模式切换、行尾符选择、Token 按钮、定时发送控件。
 * 从 SerialInput.tsx 中拆分出来。
 */
import React from 'react';
import { Upload, Timer } from 'lucide-react';
import { tokenRegistry } from '../../tokens';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

interface SerialInputToolbarProps {
    mode: 'text' | 'hex';
    setMode: (mode: 'text' | 'hex') => void;
    lineEnding: string;
    setLineEnding: (v: string) => void;
    isTimerRunning: boolean;
    setIsTimerRunning: (v: boolean) => void;
    timerIntervalInput: string;
    setTimerIntervalInput: (v: string) => void;
    timerInterval: number;
    setTimerInterval: (v: number) => void;
    isEmpty: boolean;
    hideExtras: boolean;
    insertToken: (type: string) => void;
}

export const SerialInputToolbar = React.memo(({
    mode, setMode,
    lineEnding, setLineEnding,
    isTimerRunning, setIsTimerRunning,
    timerIntervalInput, setTimerIntervalInput,
    timerInterval, setTimerInterval,
    isEmpty, hideExtras, insertToken,
}: SerialInputToolbarProps) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    return (
        <div className="flex items-center gap-2 h-6 overflow-x-auto scrollbar-none">
            {/* 模式切换 HEX/TXT */}
            <div className="shrink-0 flex items-center gap-[1px] bg-[var(--st-btn-secondary-bg)] border border-[var(--st-sendarea-toolbar-border)] rounded-sm overflow-hidden p-[2px]">
                <button
                    className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'hex' ? 'bg-[var(--st-input-btn-mode-hex-active-bg)] text-[var(--button-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] hover:bg-[var(--list-hover-background)]'}`}
                    onClick={() => setMode('hex')}
                >
                    HEX
                </button>
                <button
                    className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'text' ? 'bg-[var(--st-input-btn-mode-txt-active-bg)] text-[var(--button-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] hover:bg-[var(--list-hover-background)]'}`}
                    onClick={() => setMode('text')}
                >
                    TXT
                </button>
            </div>

            {/* 行尾符选择器（仅文本模式） */}
            {mode === 'text' && (
                <div className="flex items-center gap-1">
                    <div className="shrink-0 w-[1px] h-4 bg-[var(--st-sendarea-toolbar-border)] mr-1" />
                    <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] whitespace-nowrap">{t('serial.appendLabel')}</span>
                    <CustomSelect
                        value={lineEnding}
                        onChange={(val) => setLineEnding(val)}
                        allowCustom={true}
                        dropdownWidth={110}
                        items={[
                            { value: '', label: 'None' },
                            { value: '\n', label: 'LF (\\n)' },
                            { value: '\r', label: 'CR (\\r)' },
                            { value: '\r\n', label: 'CRLF (\\r\\n)' }
                        ]}
                        className="!w-[88px] [&_button]:!h-6 [&_div.h-7]:!h-6 [&_span.text-ellipsis]:!text-[10px] [&_input]:!text-[10px]"
                    />
                </div>
            )}

            {!hideExtras && (
                <>
                    <div className="shrink-0 w-[1px] h-4 bg-[var(--st-sendarea-toolbar-border)] mx-1" />

                    {/* Token 工具栏按钮 — registry 驱动 */}
                    {tokenRegistry.getAll().filter(p => p.toolbar).map(plugin => {
                        const tb = plugin.toolbar!;
                        return (
                            <Tooltip key={plugin.type} content={t(tb.tooltip) || tb.tooltip} position="bottom" wrapperClassName="flex">
                                <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--st-input-btn-text)] rounded-sm transition-colors whitespace-nowrap"
                                    onClick={() => insertToken(plugin.type)}>
                                    {tb.icon.kind === 'lucide' ? (
                                        <tb.icon.component size={14} className={tb.icon.colorClass} />
                                    ) : (
                                        <div className={`flex items-center justify-center w-[14px] h-[14px] border ${tb.icon.borderColorClass} ${tb.icon.textColorClass} text-[9px] font-mono rounded-[2px] leading-none`}>{tb.icon.letter}</div>
                                    )}
                                    <span>{t(`serial.token${plugin.type.charAt(0).toUpperCase() + plugin.type.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`) || tb.shortLabel}</span>
                                </button>
                            </Tooltip>
                        );
                    })}

                    <div className="shrink-0 w-[1px] h-4 bg-[var(--st-sendarea-toolbar-border)] mx-1" />
                    <Tooltip content={t('serial.loadFile')} position="bottom" wrapperClassName="flex">
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--st-input-btn-text)] rounded-sm transition-colors opacity-50 cursor-not-allowed whitespace-nowrap">
                            <Upload size={14} />
                            <span>{t('serial.fileLabel')}</span>
                        </button>
                    </Tooltip>
                    <div className="flex-1 shrink min-w-0" />

                    {/* 定时发送控件 */}
                    <div className="shrink-0 w-[1px] h-4 bg-[var(--st-sendarea-toolbar-border)]" />
                    <div className="shrink-0 flex items-center gap-1.5">
                        <Tooltip content={isTimerRunning ? t('serial.stopTimer') : (isEmpty ? t('serial.timerEmpty') : t('serial.startTimer'))} position="bottom" wrapperClassName="flex">
                            <button
                                className={`flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-sm transition-colors cursor-pointer whitespace-nowrap ${isTimerRunning
                                    ? 'bg-[var(--st-input-btn-timer-active-bg)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)]'
                                    : ((!isTimerRunning && isEmpty) ? 'bg-[var(--st-btn-secondary-bg)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed' : 'bg-[var(--button-secondary-background)] text-[var(--button-foreground)] hover:bg-[var(--button-secondary-hover-background)]')
                                    }`}
                                onClick={() => {
                                    if (!isTimerRunning && isEmpty) {
                                        showToast(t('toast.sendEmpty'), 'warning');
                                        return;
                                    }
                                    setIsTimerRunning(!isTimerRunning);
                                }}
                            >
                                <Timer size={14} />
                                <span>{isTimerRunning ? t('serial.timerStop') : t('serial.timerStart')}</span>
                            </button>
                        </Tooltip>
                        <input
                            type="text"
                            className="w-12 h-[22px] bg-[var(--input-background)] border border-[var(--st-input-border)] text-[var(--st-input-text)] text-[11px] px-1 rounded-sm focus:border-[var(--st-input-focus-border)] outline-none text-center font-mono"
                            value={timerIntervalInput}
                            onChange={(e) => {
                                const val = e.target.value;
                                setTimerIntervalInput(val);
                                if (/^\d+$/.test(val)) {
                                    const num = parseInt(val, 10);
                                    if (num > 0) setTimerInterval(Math.max(10, num));
                                }
                            }}
                            onBlur={() => {
                                if (timerIntervalInput === '' || !/^\d+$/.test(timerIntervalInput) || parseInt(timerIntervalInput, 10) <= 0) {
                                    setTimerIntervalInput(timerInterval.toString());
                                }
                            }}
                            placeholder="1000"
                        />
                        <span className="text-[11px] text-[var(--st-input-timer-unit-text)]">ms</span>
                    </div>
                </>
            )}
        </div>
    );
});

SerialInputToolbar.displayName = 'SerialInputToolbar';
