/**
 * KeybindingInput.tsx
 * 快捷键录制输入框 — 用户点击后进入录制模式，按下组合键自动捕获。
 */
import { useState, useRef, useCallback } from 'react';
import { Keyboard, X } from 'lucide-react';
import { serializeKeyEvent, formatKeybinding } from '../../utils/keybindings';
import { useI18n } from '../../context/I18nContext';

interface KeybindingInputProps {
    value: string;
    onChange: (binding: string) => void;
}

export const KeybindingInput = ({ value, onChange }: KeybindingInputProps) => {
    const { t } = useI18n();
    const [isRecording, setIsRecording] = useState(false);
    const inputRef = useRef<HTMLDivElement>(null);

    const startRecording = useCallback(() => {
        setIsRecording(true);
        // 聚焦后等待 keydown
        setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!isRecording) return;
        e.preventDefault();
        e.stopPropagation();

        // Esc 取消录制
        if (e.key === 'Escape') {
            setIsRecording(false);
            return;
        }

        const serialized = serializeKeyEvent(e.nativeEvent);
        if (!serialized) return; // 纯修饰键，等待主键

        onChange(serialized);
        setIsRecording(false);
    }, [isRecording, onChange]);

    const handleClear = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
    }, [onChange]);


    return (
        <div className="flex items-center gap-2">
            <div
                ref={inputRef}
                tabIndex={0}
                onClick={startRecording}
                onKeyDown={handleKeyDown}
                onBlur={() => setIsRecording(false)}
                className={`
                    min-w-[160px] h-7 px-3 flex items-center gap-2 rounded-[4px] cursor-pointer
                    border transition-all text-[13px] outline-none select-none
                    ${isRecording
                        ? 'border-[var(--focus-border-color)] bg-[var(--input-background)] shadow-[0_0_0_1px_var(--focus-border-color)]'
                        : 'border-[var(--input-border-color)] bg-[var(--input-background)] hover:border-[var(--focus-border-color)]'
                    }
                `}
            >
                <Keyboard size={13} className="text-[var(--input-placeholder-color)] shrink-0" />
                {isRecording ? (
                    <span className="text-[var(--focus-border-color)] animate-pulse text-[12px]">
                        {t('settings.keybindings.recording')}
                    </span>
                ) : value ? (
                    <div className="flex items-center gap-1 flex-1">
                        {value.split('+').map((part, i) => (
                            <span
                                key={i}
                                className="px-1.5 py-0.5 rounded-[3px] text-[11px] font-medium bg-[var(--hover-background)] text-[var(--input-foreground)] border border-[var(--border-color)]"
                            >
                                {formatKeybinding(part)}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-[var(--input-placeholder-color)] text-[12px]">
                        {t('settings.keybindings.unset')}
                    </span>
                )}
                {value && !isRecording && (
                    <button
                        onClick={handleClear}
                        className="text-[var(--input-placeholder-color)] hover:text-[var(--st-status-error)] transition-colors ml-auto shrink-0"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
        </div>
    );
};
