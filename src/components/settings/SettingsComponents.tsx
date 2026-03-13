/**
 * SettingsComponents.tsx
 * 设置编辑器的 UI 子组件。
 * 从 SettingsEditor.tsx 中拆分出来。
 */
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

// ─── 工厂重置确认对话框 ──────────────────────────────────────────────────
export const FactoryResetDialog = ({
    resetInput,
    setResetInput,
    onReset,
    onClose,
}: {
    resetInput: string;
    setResetInput: (val: string) => void;
    onReset: () => void;
    onClose: () => void;
}) => {
    const { t } = useI18n();
    const resetKeyword = t('settings.factoryResetKeyword');
    const canFactoryReset = resetInput === resetKeyword;

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-[var(--st-popover-bg)] border border-[var(--st-settings-danger-bg)] shadow-2xl w-[450px] flex flex-col rounded-md overflow-hidden animate-in zoom-in-95 fade-in duration-300"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-3 border-b border-[var(--st-popover-border)] bg-[var(--st-settings-danger-bg-subtle)]">
                    <span className="text-[12px] font-bold text-[var(--st-settings-danger-title)] uppercase tracking-wider flex items-center gap-2">
                        <AlertTriangle size={14} />
                        {t('settings.factoryResetDialogTitle')}
                    </span>
                    <button onClick={onClose} className="text-[var(--st-settings-text)] hover:text-[var(--st-settings-text-hover)] transition-colors">
                        <X size={14} />
                    </button>
                </div>
                <div className="p-5">
                    <p className="text-[13px] text-[var(--st-settings-text)] leading-relaxed whitespace-pre-wrap mb-4">
                        {t('settings.factoryResetDialogMessage', { keyword: resetKeyword })}
                    </p>
                    <input
                        autoFocus
                        type="text"
                        className="w-full bg-[var(--input-background)] border border-[var(--input-border-color)] p-2 text-sm text-[var(--input-foreground)] outline-none focus:border-[var(--st-settings-danger-bg)] rounded"
                        placeholder={resetKeyword}
                        value={resetInput}
                        onChange={e => setResetInput(e.target.value)}
                    />
                </div>
                <div className="flex justify-end gap-2 p-3 bg-[var(--st-settings-footer-bg)] border-t border-[var(--st-settings-footer-border)]">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-[var(--st-settings-text)] hover:bg-[var(--st-settings-btn-cancel-hover)] rounded-sm text-xs transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        disabled={!canFactoryReset}
                        onClick={onReset}
                        className={`px-4 py-1.5 text-[var(--st-settings-danger-text)] rounded-sm text-xs transition-all flex items-center gap-2 ${canFactoryReset ? 'bg-[var(--st-settings-danger-bg)] hover:bg-[var(--st-settings-danger-hover)] cursor-pointer' : 'bg-[var(--st-settings-btn-disabled-bg)] text-[var(--st-settings-btn-disabled-text)] cursor-not-allowed opacity-50'}`}
                    >
                        {canFactoryReset && <AlertTriangle size={12} />}
                        {t('settings.factoryResetBtn')}
                    </button>
                </div>
            </div>
        </div>
    );
};
