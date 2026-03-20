/**
 * ThemeColorEditor.tsx
 * 主题颜色编辑器 — 渲染 UI，状态逻辑委托给 useThemeEditorState。
 *
 * 子模块：
 * - useThemeEditorState.ts — 状态管理、Inspector、颜色变更回调
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { X, ChevronDown, Palette, Save, RotateCcw, Search, Crosshair, MapPin } from 'lucide-react';
import { componentTokenMap } from '../../themes/componentTokenMap';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { REGION_GROUPS } from './themeColorGroups';
import { TokenRow } from './ThemeTokenRow';
import { useThemeEditorState } from './useThemeEditorState';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const ThemeColorEditor: React.FC<Props> = ({ isOpen, onClose }) => {
    const { t } = useI18n();
    const {
        expandedGroups, setExpandedGroups,
        isInspecting, copiedVar,
        cdpDebugData, setCdpDebugData,
        editCount,
        getColorValue, handleColorChange, handleSave, handleCancel,
        handleCopy, startInspect, extractVars,
    } = useThemeEditorState({ isOpen, onClose });

    const [searchTerm, setSearchTerm] = useState('');

    // Refs
    const thumbRef = useRef<HTMLDivElement | null>(null);
    const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);
    const tokenRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const thumbHeightRef = useRef(40);

    // ── 滚动条 ──
    const syncScrollThumb = useCallback(() => {
        const target = scrollContainerRef.current;
        const thumb = thumbRef.current;
        if (!target || !thumb) return;
        const maxScroll = target.scrollHeight - target.clientHeight;
        if (maxScroll <= 0) { thumb.style.display = 'none'; return; }
        const ratio = target.scrollTop / maxScroll;
        const h = Math.max(20, (target.clientHeight / target.scrollHeight) * target.clientHeight);
        const translateY = ratio * (target.clientHeight - h);
        if (Math.abs(h - thumbHeightRef.current) > 1) {
            thumbHeightRef.current = h;
            thumb.style.height = `${h}px`;
        }
        thumb.style.transform = `translateY(${translateY}px)`;
        thumb.style.display = 'block';
    }, []);

    const handleScroll = useCallback(() => {
        syncScrollThumb();
        thumbRef.current?.classList.add('is-scrolling');
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
            thumbRef.current?.classList.remove('is-scrolling');
        }, 800);
    }, [syncScrollThumb]);

    useEffect(() => {
        const raf = requestAnimationFrame(() => syncScrollThumb());
        return () => cancelAnimationFrame(raf);
    }, [searchTerm, expandedGroups, cdpDebugData, syncScrollThumb]);

    // ── 搜索过滤 ──
    const lowerSearch = searchTerm.toLowerCase();
    const filteredGroups = useMemo(() => {
        if (!lowerSearch) return REGION_GROUPS;
        return REGION_GROUPS.map(group => {
            const filteredComps = group.components.map(compId => {
                const compMeta = componentTokenMap[compId];
                if (!compMeta) return null;
                if (compMeta.label.toLowerCase().includes(lowerSearch) || compId.toLowerCase().includes(lowerSearch)) return compId;
                const hasMatchingToken = compMeta.tokens.some(t =>
                    t.var.toLowerCase().includes(lowerSearch) || t.label.toLowerCase().includes(lowerSearch)
                );
                return hasMatchingToken ? compId : null;
            }).filter(Boolean) as string[];
            return filteredComps.length > 0 ? { ...group, components: filteredComps } : null;
        }).filter(Boolean) as typeof REGION_GROUPS;
    }, [lowerSearch]);

    useEffect(() => {
        if (lowerSearch && filteredGroups.length > 0) {
            const newExpanded: Record<string, boolean> = {};
            filteredGroups.forEach(g => newExpanded[g.id] = true);
            setExpandedGroups(newExpanded);
        }
    }, [lowerSearch, filteredGroups]);

    // 全局查找变量 Label
    const findTokenLabel = (varName: string) => {
        for (const meta of Object.values(componentTokenMap)) {
            const token = meta.tokens.find(t => t.var === varName);
            if (token) return token.label;
        }
        return varName;
    };

    // CDP 诊断面板监听滚动
    useEffect(() => {
        if (cdpDebugData && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [cdpDebugData]);

    return (
        <div
            className="flex flex-col h-screen w-full bg-[var(--app-background)] text-[var(--app-foreground)] overflow-hidden relative"
        >
            <div className="flex-1 flex flex-col bg-[var(--theme-editor-bg)] overflow-hidden relative">

                {/* 头部（可拖拽） */}
                <div
                    className="px-3 py-2 border-b flex items-center justify-between shrink-0 cursor-default"
                    style={{ borderColor: 'var(--theme-editor-border)' }}
                    onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        const target = e.target as HTMLElement;
                        if (target.closest('button')) return;
                        e.preventDefault();
                        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().startDragging());
                    }}
                >
                    <div className="flex items-center gap-2">
                        <Palette size={14} className="text-[var(--accent-color)] shrink-0" />
                        <span className="text-[12px] font-semibold tracking-tight select-none opacity-90">{t('themeEditor.title')}</span>
                        {editCount > 0 && (
                            <span className="ml-2 bg-[var(--accent-color)]/10 text-[var(--accent-color)] border border-[var(--accent-color)]/20 text-[10px] px-2 py-0.5 rounded-full font-bold select-none whitespace-nowrap">
                                {t('themeEditor.modifiedCount', { count: String(editCount) })}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center">
                        <Tooltip content={t('themeEditor.close')} position="bottom" offset={4}>
                            <button
                                onClick={onClose}
                                className="p-1 rounded transition-all"
                                style={{ color: 'var(--app-foreground)', opacity: 0.5 }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = 'var(--theme-editor-btn-hover)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                <X size={15} />
                            </button>
                        </Tooltip>
                    </div>
                </div>

                {/* 搜索 + 检查器 */}
                <div className="px-3 py-2 border-b shrink-0 flex flex-col gap-1.5" style={{ borderColor: 'var(--theme-editor-border)' }}>
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" style={{ color: 'var(--app-foreground)' }} />
                        <input
                            type="text"
                            placeholder={t('themeEditor.searchPlaceholder')}
                            className="w-full h-7 pl-7 pr-3 text-[11px] rounded-md outline-none transition-all placeholder:text-[var(--app-foreground)] placeholder:opacity-50"
                            style={{ backgroundColor: 'var(--theme-editor-input-bg)', borderColor: 'var(--theme-editor-input-border)', borderWidth: '1px', color: 'var(--app-foreground)' }}
                            onFocus={(e) => { e.currentTarget.style.backgroundColor = 'var(--theme-editor-input-focus)'; e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                            onBlur={(e) => { e.currentTarget.style.backgroundColor = 'var(--theme-editor-input-bg)'; e.currentTarget.style.borderColor = 'var(--theme-editor-input-border)'; }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={isInspecting ? () => window.themeAPI?.stopInspector?.() : startInspect}
                        className="w-full py-1.5 flex items-center justify-center gap-1.5 rounded-md border text-[11px] font-semibold transition-all shadow-sm"
                        style={{
                            backgroundColor: isInspecting ? 'var(--theme-editor-inspect-bg)' : 'var(--theme-editor-btn-bg)',
                            borderColor: isInspecting ? 'var(--theme-editor-inspect-border)' : 'var(--theme-editor-input-border)',
                            color: isInspecting ? 'var(--theme-editor-inspect-text)' : 'var(--app-foreground)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isInspecting ? 'var(--theme-editor-inspect-hover)' : 'var(--theme-editor-btn-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isInspecting ? 'var(--theme-editor-inspect-bg)' : 'var(--theme-editor-btn-bg)'; }}
                    >
                        {isInspecting ? (
                            <><X size={12} className="animate-pulse" /><span>{t('themeEditor.stopInspect')}</span></>
                        ) : (
                            <><Crosshair size={12} /><span className="tracking-wide">{t('themeEditor.startInspect')}</span></>
                        )}
                    </button>
                </div>

                {/* 内容区 */}
                <div className="flex-1 overflow-hidden relative group/scroll-container">
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="w-full h-full overflow-y-auto overflow-x-hidden px-2.5 py-2 flex flex-col gap-1.5 scrollbar-none"
                    >
                        {/* CDP 诊断面板 */}
                        {cdpDebugData && (
                            <div className="mb-2 flex flex-col gap-1.5 shrink-0">
                                <div className="p-2.5 rounded-lg text-[11px] flex flex-col gap-2 relative shrink-0 border" style={{ backgroundColor: 'var(--theme-editor-inspect-bg)', borderColor: 'var(--theme-editor-inspect-border)' }}>
                                    <Tooltip content={t('themeEditor.closeInspect')} position="bottom" offset={4}>
                                        <button onClick={() => setCdpDebugData(null)} className="absolute right-2 top-2 transition-colors hover:opacity-100 opacity-60" style={{ color: 'var(--theme-editor-inspect-text)' }}>
                                            <X size={13} />
                                        </button>
                                    </Tooltip>
                                    <div className="font-medium pb-1 flex items-center gap-1.5 border-b" style={{ color: 'var(--theme-editor-inspect-text)', borderColor: 'var(--theme-editor-inspect-border)' }}>
                                        <Crosshair size={12} />
                                        {t('themeEditor.pickedOuterHTML')}
                                    </div>
                                    <pre className="p-1.5 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all select-all font-mono max-h-28 overflow-y-auto" style={{ backgroundColor: 'var(--theme-editor-input-bg)', color: 'var(--app-foreground)', opacity: 0.8 }}>
                                        {cdpDebugData.outerHTML || t('themeEditor.noInfo')}
                                    </pre>
                                </div>

                                <div className="p-2.5 rounded-lg shrink-0 border" style={{ backgroundColor: 'var(--theme-editor-match-bg)', borderColor: 'var(--theme-editor-match-border)' }}>
                                    <div className="font-medium pb-1 mb-2 flex items-center gap-1.5 text-[11px] border-b" style={{ color: 'var(--theme-editor-match-text)', borderColor: 'var(--theme-editor-match-border)' }}>
                                        <MapPin size={12} />
                                        {t('themeEditor.matchedVars')}
                                    </div>
                                    {extractVars(cdpDebugData.outerHTML).length > 0 ? (
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {extractVars(cdpDebugData.outerHTML).map(v => (
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
                        )}

                        {/* 颜色组列表 */}
                        {filteredGroups.length === 0 ? (
                            <div className="text-center py-10 text-[var(--app-foreground)]/40 text-[11px]">{t('themeEditor.noMatchingVars')}</div>
                        ) : (
                            filteredGroups.map(group => {
                                const isExpanded = expandedGroups[group.id];
                                return (
                                    <div key={group.id} className="border rounded-xl overflow-hidden shrink-0 shadow-sm" style={{ backgroundColor: 'var(--theme-editor-card-bg)', borderColor: 'var(--theme-editor-card-border)' }}>
                                        <button
                                            onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !isExpanded }))}
                                            className="w-full px-3 py-2 flex items-center justify-between transition-colors cursor-pointer"
                                            style={{ backgroundColor: isExpanded ? 'var(--theme-editor-card-hover)' : 'transparent' }}
                                            onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'var(--theme-editor-card-hover)'; }}
                                            onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                                                    <ChevronDown size={12} className={isExpanded ? 'text-[var(--accent-color)]' : 'opacity-40'} style={{ color: isExpanded ? undefined : 'var(--app-foreground)' }} />
                                                </div>
                                                <span className="text-[11px] font-semibold transition-colors" style={{ color: 'var(--app-foreground)', opacity: isExpanded ? 1 : 0.7 }}>
                                                    {group.label}
                                                </span>
                                            </div>
                                            <div className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center font-mono tabular-nums" style={{ color: 'var(--app-foreground)', opacity: 0.6, backgroundColor: 'var(--theme-editor-input-bg)' }}>
                                                {group.components.length}
                                            </div>
                                        </button>

                                        {isExpanded && (
                                                <div
                                                    className="overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                                                >
                                                    <div className="px-2.5 py-2 flex flex-col gap-4 border-t" style={{ borderColor: 'var(--theme-editor-card-border)' }}>
                                                        {group.components.map(compId => {
                                                            const compMeta = componentTokenMap[compId];
                                                            if (!compMeta) return null;
                                                            const tokens = compMeta.tokens.filter(t =>
                                                                !lowerSearch || t.var.toLowerCase().includes(lowerSearch) || t.label.toLowerCase().includes(lowerSearch) || compMeta.label.toLowerCase().includes(lowerSearch)
                                                            );
                                                            if (tokens.length === 0) return null;
                                                            return (
                                                                <div key={compId} className="flex flex-col gap-1.5 shrink-0">
                                                                    <div className="text-[10px] font-bold uppercase tracking-widest pb-0.5 border-b" style={{ color: 'var(--app-foreground)', opacity: 0.5, borderColor: 'var(--theme-editor-card-border)' }}>
                                                                        {compMeta.label}
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-x-1 gap-y-1">
                                                                        {tokens.map(token => (
                                                                            <div key={token.var} className="min-w-0">
                                                                                <TokenRow
                                                                                    varName={token.var}
                                                                                    label={token.label}
                                                                                    value={getColorValue(token.var)}
                                                                                    isCopied={copiedVar === token.var}
                                                                                    onColorChange={handleColorChange}
                                                                                    onCopy={handleCopy}
                                                                                    setRef={el => { tokenRowRefs.current[token.var] = el; }}
                                                                                />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* 悬浮滑块 */}
                    <div
                        ref={thumbRef}
                        className="floating-scrollbar-thumb absolute right-[3px] pointer-events-none z-50"
                        style={{
                            top: 0, height: `${thumbHeightRef.current}px`, width: '3px',
                            backgroundColor: 'var(--scrollbar-slider-hover-color)', borderRadius: '3px',
                            marginTop: '4px', marginBottom: '4px', willChange: 'transform',
                            display: 'none', opacity: 0, transition: 'opacity 0.3s'
                        }}
                    />
                </div>

                {/* 底部操作栏 */}
                <div className="px-3 py-2 border-t flex justify-end gap-2 shrink-0" style={{ borderColor: 'var(--theme-editor-border)', backgroundColor: 'var(--theme-editor-card-bg)' }}>
                    <button
                        onClick={handleCancel}
                        className="px-2.5 py-1 text-[11px] rounded-md border text-[var(--app-foreground)] hover:text-[var(--app-foreground)] transition-all flex items-center gap-1 font-medium"
                        style={{ borderColor: 'var(--theme-editor-input-border)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--theme-editor-btn-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <RotateCcw size={12} />
                        {t('themeEditor.discardChanges')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={editCount === 0}
                        className="px-3 py-1 text-[11px] rounded-md bg-[var(--accent-color)]/90 hover:opacity-90 text-white transition-all disabled:opacity-90 disabled:grayscale-[0.5] disabled:cursor-not-allowed flex items-center gap-1 font-semibold shadow-sm"
                    >
                        <Save size={12} />
                        {t('themeEditor.saveChanges')}
                    </button>
                </div>
            </div>
        </div>
    );
};
