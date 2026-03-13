/**
 * ThemeTokenRow.tsx
 * 主题颜色编辑器的 TokenRow 子组件和 IPC 节流同步函数。
 * 从 ThemeColorEditor.tsx 中拆分出来。
 */
import React from 'react';
import { ColorPickerTrigger } from './ColorPickerShared';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

// ── TokenRow Props ──
export interface TokenRowProps {
    varName: string;
    label: string;
    value: string;
    isCopied: boolean;
    idPrefix?: string;
    onColorChange: (varName: string, color: string) => void;
    onCopy: (text: string) => void;
    setRef?: (el: HTMLDivElement | null) => void;
}

// ── 子组件 TokenRow (Memoized) ──
export const TokenRow = React.memo(({ varName, label, value, isCopied, idPrefix = "", onColorChange, onCopy, setRef }: TokenRowProps) => {
    const { t } = useI18n();
    return (
        <div
            ref={setRef}
            className="flex items-center gap-2.5 group/token relative mx-1 p-1.5 rounded-lg transition-all shadow-sm active:scale-[0.985]"
            style={{
                minHeight: '32px',
                backgroundColor: 'var(--theme-editor-card-bg)',
                borderColor: 'var(--theme-editor-card-border)',
                borderWidth: '1px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-editor-card-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-editor-card-bg)'}
        >
            <div className="relative shrink-0 flex items-center">
                <ColorPickerTrigger
                    value={value}
                    onChange={(val) => onColorChange(varName, val)}
                />
                <div
                    className="absolute inset-0 rounded pointer-events-none ring-1 ring-inset"
                    style={{
                        boxShadow: 'inset 0 1px 1px var(--theme-editor-card-border)',
                        borderColor: 'var(--theme-editor-card-border)'
                    }}
                />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[10px] truncate transition-colors text-[var(--app-foreground)] font-semibold leading-tight opacity-90">
                    {label}
                </span>
                <Tooltip content={isCopied ? t('themeEditor.copied') : t('themeEditor.copyVar')} position="right" delay={150}>
                    <span
                        className="text-[9px] text-[var(--app-foreground)] opacity-50 font-mono truncate cursor-pointer hover:underline hover:opacity-100 block mt-[1px]"
                        onClick={e => { e.stopPropagation(); onCopy(varName); }}
                    >
                        {varName}
                    </span>
                </Tooltip>
            </div>
        </div>
    );
});
TokenRow.displayName = 'TokenRow';

// ── IPC 节流同步器 ──
let lastIpcTime = 0;
let ipcTimer: NodeJS.Timeout | null = null;

export const throttledIpcSync = (themeId: string, edits: Record<string, string>) => {
    const now = Date.now();
    if (now - lastIpcTime > 32) {
        window.themeAPI?.applyPreview?.(edits);
        window.themeAPI?.setPendingEdits?.(themeId, edits);
        lastIpcTime = now;
        if (ipcTimer) clearTimeout(ipcTimer);
    } else {
        if (ipcTimer) clearTimeout(ipcTimer);
        ipcTimer = setTimeout(() => {
            window.themeAPI?.applyPreview?.(edits);
            window.themeAPI?.setPendingEdits?.(themeId, edits);
            lastIpcTime = Date.now();
        }, 32);
    }
};
