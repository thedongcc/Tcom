/**
 * PendingEditsPanel.tsx
 * 待保存的颜色修改列表 — 展示原色 → 新色对比、支持复制变量名/色值。
 */
import React from 'react';
import { Palette } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { ColorPickerTrigger } from './ColorPickerShared';
import { componentTokenMap } from '../../themes/componentTokenMap';
import { useI18n } from '../../context/I18nContext';

interface ThemeDef {
    colors?: Record<string, string>;
}

interface Props {
    edits: Record<string, string>;
    currentThemeDef: ThemeDef | null;
    copiedVar: string | null;
    handleColorChange: (varName: string, value: string) => void;
    handleCopy: (text: string) => void;
}

/** 在 componentTokenMap 中查找变量名对应的 Label（根据语言选择） */
function findTokenLabel(varName: string, isEn: boolean): string {
    for (const meta of Object.values(componentTokenMap)) {
        const token = meta.tokens.find(t => t.var === varName);
        if (token) return isEn ? token.labelEn : token.label;
    }
    return varName;
}

/** 获取变量的原始色值 */
function getOriginalValue(varName: string, currentThemeDef: ThemeDef | null): string {
    if (currentThemeDef?.colors?.[varName]) return currentThemeDef.colors[varName];
    if (typeof window !== 'undefined') {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (raw && raw !== 'transparent') {
            const m = raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m) return `#${parseInt(m[1]).toString(16).padStart(2, '0')}${parseInt(m[2]).toString(16).padStart(2, '0')}${parseInt(m[3]).toString(16).padStart(2, '0')}`;
            return raw;
        }
    }
    return '#808080';
}

export const PendingEditsPanel: React.FC<Props> = ({
    edits, currentThemeDef, copiedVar,
    handleColorChange, handleCopy,
}) => {
    const { locale } = useI18n();
    const isEn = locale === 'en-US';
    const entries = Object.entries(edits);
    if (entries.length === 0) return null;

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text);
        handleCopy(text);
    };

    return (
        <div className="p-2.5 rounded-lg shrink-0 border mb-1" style={{ backgroundColor: 'var(--theme-editor-card-bg)', borderColor: 'var(--accent-color, #007acc)', borderWidth: '1px' }}>
            <div className="font-medium pb-1 mb-2 flex items-center justify-between text-[11px] border-b" style={{ color: 'var(--accent-color)', borderColor: 'var(--theme-editor-card-border)' }}>
                <div className="flex items-center gap-1.5">
                    <Palette size={12} />
                    <span>{isEn ? 'Pending Changes' : '待保存修改'} ({entries.length})</span>
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                {entries.map(([varName, newVal]) => {
                    const origVal = getOriginalValue(varName, currentThemeDef);
                    const label = findTokenLabel(varName, isEn);
                    return (
                        <div key={`pending-${varName}`}
                            className="flex items-center gap-2.5 p-1.5 rounded-lg transition-all shadow-sm border"
                            style={{ minHeight: '32px', backgroundColor: 'var(--theme-editor-card-bg)', borderColor: 'var(--theme-editor-card-border)', borderWidth: '1px' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-editor-card-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-editor-card-bg)'}
                        >
                            {/* 原始色块 */}
                            <Tooltip content={`${isEn ? 'Original' : '原始'}: ${origVal}`} position="top" offset={4}>
                                <div
                                    className="shrink-0 cursor-pointer"
                                    style={{ width: 28, height: 20, borderRadius: 4, border: '1px solid var(--border-color)', padding: 2, background: 'rgba(0,0,0,0.2)' }}
                                    onClick={() => copyText(origVal)}
                                >
                                    <div style={{ width: '100%', height: '100%', borderRadius: 2, backgroundColor: origVal }} />
                                </div>
                            </Tooltip>

                            <span className="opacity-30 text-[10px] shrink-0">→</span>

                            {/* 新色块 */}
                            <div className="relative shrink-0 flex items-center">
                                <ColorPickerTrigger
                                    value={newVal}
                                    onChange={(val) => handleColorChange(varName, val)}
                                />
                                <div
                                    className="absolute inset-0 rounded pointer-events-none ring-1 ring-inset"
                                    style={{ boxShadow: 'inset 0 1px 1px var(--theme-editor-card-border)', borderColor: 'var(--theme-editor-card-border)' }}
                                />
                            </div>

                            {/* 名称 + 变量代码 + 色值 */}
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-[10px] font-semibold leading-tight opacity-90 truncate" style={{ color: 'var(--app-foreground)' }}>
                                    {label}
                                </span>
                                <div className="flex items-center gap-1.5 mt-[1px]">
                                    <Tooltip content={copiedVar === varName ? '✓ Copied' : (isEn ? 'Click to copy var name' : '点击复制变量名')} position="right" delay={150}>
                                        <span
                                            className="text-[9px] font-mono opacity-50 truncate cursor-pointer hover:underline hover:opacity-100"
                                            style={{ color: 'var(--app-foreground)' }}
                                            onClick={(e) => { e.stopPropagation(); copyText(varName); }}
                                        >{varName}</span>
                                    </Tooltip>
                                    <span className="text-[9px] opacity-30">|</span>
                                    <Tooltip content={copiedVar === origVal ? '✓ Copied' : (isEn ? 'Click to copy original' : '点击复制原色值')} position="right" delay={150}>
                                        <span
                                            className="text-[9px] font-mono opacity-40 cursor-pointer hover:opacity-100 hover:text-[var(--accent-color)] transition-all"
                                            onClick={(e) => { e.stopPropagation(); copyText(origVal); }}
                                        >{origVal}</span>
                                    </Tooltip>
                                    <span className="text-[9px] opacity-30">→</span>
                                    <Tooltip content={copiedVar === newVal ? '✓ Copied' : (isEn ? 'Click to copy new value' : '点击复制新色值')} position="right" delay={150}>
                                        <span
                                            className="text-[9px] font-mono font-bold opacity-80 cursor-pointer hover:opacity-100 hover:text-[var(--accent-color)] transition-all"
                                            onClick={(e) => { e.stopPropagation(); copyText(newVal); }}
                                        >{newVal}</span>
                                    </Tooltip>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
