/**
 * CdpDebugPanel.tsx
 * CDP 诊断面板 — 显示 Inspector 选中元素和匹配的 CSS 变量。
 * outerHTML 支持语法高亮（标签、属性、值、CSS 变量）。
 */
import React, { useMemo } from 'react';
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

/** 在 outerHTML 中查找变量名对应的 Label（根据语言选择） */
function findTokenLabel(varName: string, isEn: boolean): string {
    for (const meta of Object.values(componentTokenMap)) {
        const token = meta.tokens.find(t => t.var === varName);
        if (token) return isEn ? token.labelEn : token.label;
    }
    return varName;
}

// ── outerHTML 语法高亮颜色 ──
const SX = {
    tag: '#569cd6',      // 标签名 - 蓝色
    attr: '#9cdcfe',     // 属性名 - 浅蓝
    value: '#ce9178',    // 属性值 - 橙色
    cssVar: '#c586c0',   // CSS 变量 - 粉紫
    punct: '#808080',    // 标点 <>/= - 灰色
    text: '#d4d4d4',     // 纯文本 - 浅灰
} as const;

interface HtmlToken {
    text: string;
    color: string;
}

/** 将 HTML 字符串拆分为带颜色的 token 序列 */
function tokenizeHtml(html: string): HtmlToken[] {
    if (!html) return [];
    const tokens: HtmlToken[] = [];

    // 正则匹配 HTML 标签（含属性）
    const tagRegex = /(<\/?)([\w-]+)((?:\s+[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*)\s*(\/?>)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(html)) !== null) {
        // 标签前的纯文本
        if (match.index > lastIndex) {
            const textBefore = html.slice(lastIndex, match.index);
            if (textBefore) tokens.push({ text: textBefore, color: SX.text });
        }

        const [, open, tagName, attrsStr, close] = match;

        // 开标签 </ 或 <
        tokens.push({ text: open, color: SX.punct });
        // 标签名
        tokens.push({ text: tagName, color: SX.tag });

        // 解析属性
        if (attrsStr) {
            const attrRegex = /([\w-]+)(\s*=\s*)(["'])([\s\S]*?)\3/g;
            let attrLast = 0;
            let attrMatch: RegExpExecArray | null;
            const attrStr = attrsStr;

            while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
                // 属性之前的空白
                if (attrMatch.index > attrLast) {
                    tokens.push({ text: attrStr.slice(attrLast, attrMatch.index), color: SX.text });
                }

                const [, attrName, eq, quote, attrValue] = attrMatch;
                tokens.push({ text: attrName, color: SX.attr });
                tokens.push({ text: eq, color: SX.punct });
                tokens.push({ text: quote, color: SX.value });

                // 属性值中高亮 CSS 变量
                const cssVarRegex = /(var\(--[\w-]+\))/g;
                let valLast = 0;
                let varMatch: RegExpExecArray | null;
                while ((varMatch = cssVarRegex.exec(attrValue)) !== null) {
                    if (varMatch.index > valLast) {
                        tokens.push({ text: attrValue.slice(valLast, varMatch.index), color: SX.value });
                    }
                    tokens.push({ text: varMatch[1], color: SX.cssVar });
                    valLast = varMatch.index + varMatch[0].length;
                }
                if (valLast < attrValue.length) {
                    tokens.push({ text: attrValue.slice(valLast), color: SX.value });
                }

                tokens.push({ text: quote, color: SX.value });
                attrLast = attrMatch.index + attrMatch[0].length;
            }
            // 剩余的属性空白
            if (attrLast < attrStr.length) {
                tokens.push({ text: attrStr.slice(attrLast), color: SX.text });
            }
        }

        // 闭标签
        tokens.push({ text: close, color: SX.punct });
        lastIndex = match.index + match[0].length;
    }

    // 剩余文本
    if (lastIndex < html.length) {
        tokens.push({ text: html.slice(lastIndex), color: SX.text });
    }

    return tokens;
}

export const CdpDebugPanel: React.FC<Props> = ({
    data, copiedVar, onClose,
    getColorValue, handleColorChange, handleCopy, extractVars,
}) => {
    const { t, locale } = useI18n();
    const isEn = locale === 'en-US';

    // 缓存 token 化后的 HTML
    const htmlTokens = useMemo(() => tokenizeHtml(data.outerHTML), [data.outerHTML]);

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
                {/* 语法高亮的 outerHTML */}
                <pre className="p-1.5 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all select-all font-mono max-h-28 overflow-y-auto" style={{ backgroundColor: 'var(--theme-editor-input-bg)' }}>
                    {htmlTokens.length > 0 ? (
                        htmlTokens.map((tk, i) => (
                            <span key={i} style={{ color: tk.color }}>{tk.text}</span>
                        ))
                    ) : (
                        <span style={{ color: SX.text, opacity: 0.6 }}>{t('themeEditor.noInfo')}</span>
                    )}
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
                                <TokenRow varName={v} label={findTokenLabel(v, isEn)} value={getColorValue(v)} isCopied={copiedVar === v} idPrefix="matched-" onColorChange={handleColorChange} onCopy={handleCopy} />
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
