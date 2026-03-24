/**
 * CdpDebugPanel.tsx
 * CDP 诊断面板 — 显示 Inspector 选中元素和匹配的 CSS 变量。
 */
import React from 'react';
import { X, Crosshair, MapPin } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { TokenRow } from './ThemeTokenRow';
import { componentTokenMap } from '../../themes/componentTokenMap';
import { useI18n } from '../../context/I18nContext';

interface CdpDebugData {
    outerHTML: string;
}

interface Props {
    data: CdpDebugData;
    copiedVar: string | null;
    onClose: () => void;
    getColorValue: (varName: string) => string;
    handleColorChange: (varName: string, value: string) => void;
    handleCopy: (text: string) => void;
    extractVars: (html: string) => string[];
}

/** 在 outerHTML 中查找变量名对应的 Label */
function findTokenLabel(varName: string): string {
    for (const meta of Object.values(componentTokenMap)) {
        const token = meta.tokens.find(t => t.var === varName);
        if (token) return token.label;
    }
    return varName;
}

export const CdpDebugPanel: React.FC<Props> = ({
    data, copiedVar, onClose,
    getColorValue, handleColorChange, handleCopy, extractVars,
}) => {
    const { t } = useI18n();

    return (
        <div className="mb-2 flex flex-col gap-1.5 shrink-0">
            {/* 选中元素 outerHTML 展示 */}
            <div className="p-2.5 rounded-lg text-[11px] flex flex-col gap-2 relative shrink-0 border" style={{ backgroundColor: 'var(--theme-editor-inspect-bg)', borderColor: 'var(--theme-editor-inspect-border)' }}>
                <Tooltip content={t('themeEditor.closeInspect')} position="bottom" offset={4}>
                    <button onClick={onClose} className="absolute right-2 top-2 transition-colors hover:opacity-100 opacity-60" style={{ color: 'var(--theme-editor-inspect-text)' }}>
                        <X size={13} />
                    </button>
                </Tooltip>
                <div className="font-medium pb-1 flex items-center gap-1.5 border-b" style={{ color: 'var(--theme-editor-inspect-text)', borderColor: 'var(--theme-editor-inspect-border)' }}>
                    <Crosshair size={12} />
                    {t('themeEditor.pickedOuterHTML')}
                </div>
                <pre className="p-1.5 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all select-all font-mono max-h-28 overflow-y-auto" style={{ backgroundColor: 'var(--theme-editor-input-bg)', color: 'var(--app-foreground)', opacity: 0.8 }}>
                    {data.outerHTML || t('themeEditor.noInfo')}
                </pre>
            </div>

            {/* 匹配的 CSS 变量列表 */}
            <div className="p-2.5 rounded-lg shrink-0 border" style={{ backgroundColor: 'var(--theme-editor-match-bg)', borderColor: 'var(--theme-editor-match-border)' }}>
                <div className="font-medium pb-1 mb-2 flex items-center gap-1.5 text-[11px] border-b" style={{ color: 'var(--theme-editor-match-text)', borderColor: 'var(--theme-editor-match-border)' }}>
                    <MapPin size={12} />
                    {t('themeEditor.matchedVars')}
                </div>
                {extractVars(data.outerHTML).length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
                        {extractVars(data.outerHTML).map(v => (
                            <div key={`matched-${v}`}>
                                <TokenRow varName={v} label={findTokenLabel(v)} value={getColorValue(v)} isCopied={copiedVar === v} idPrefix="matched-" onColorChange={handleColorChange} onCopy={handleCopy} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-3 text-[10px] italic opacity-60" style={{ color: 'var(--theme-editor-match-text)' }}>
                        {t('themeEditor.noVarsFound')}
                    </div>
                )}
            </div>
        </div>
    );
};
