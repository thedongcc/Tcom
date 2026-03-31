/**
 * AutoReplyPanel.tsx
 * 自动回复规则配置面板 — 与 ParserSidebar SchemeRow 完全统一的模板：
 *   左：拖拽手柄 + 激活圆点(w-3 h-3)
 *   中：规则名称（只读，展开后可编辑）
 *   右：折叠箭头
 *   右键菜单：复制、删除
 */
import { ChevronDown, ChevronRight, Zap, GripVertical } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';
import { AutoReplyRule } from '../../types/autoReply';
import React from 'react';

interface AutoReplyPanelProps {
    rules: AutoReplyRule[];
    onAddRule: () => void;
    onUpdateRule: (id: string, updates: Partial<AutoReplyRule>) => void;
    onDeleteRule: (id: string) => void;
    onToggleRule: (id: string) => void;
    onReorderRules: (fromIndex: number, toIndex: number) => void;
    onDuplicateRule: (id: string) => void;
}

/** 匹配模式选项 */
const MATCH_MODE_OPTIONS = [
    { label: '包含', value: 'contains', labelKey: 'autoReply.matchContains' },
    { label: '精确', value: 'exact', labelKey: 'autoReply.matchExact' },
    { label: '正则', value: 'regex', labelKey: 'autoReply.matchRegex' },
];

/** 数据格式选项 */
const DATA_MODE_OPTIONS = [
    { label: 'HEX', value: 'hex' },
    { label: 'Text', value: 'text' },
];

// 统一输入框高度，与 CustomSelect h-7 保持一致
const INPUT_CLS = "w-full h-7 px-2 text-[12px] bg-[var(--input-background)] border border-[var(--input-border-color)] rounded-sm text-[var(--app-foreground)] focus:border-[var(--focus-border-color)] outline-none transition-colors placeholder:text-[var(--activitybar-inactive-foreground)]";

// ──────────────────────────────────────────────
//  单个规则行 — 与 SchemeRow 完全一致的模板
// ──────────────────────────────────────────────
const RuleRow = ({
    rule,
    index,
    onUpdate,
    onDelete,
    onToggle,
    onDuplicate,
    onDragStart,
    onDragOver,
    onDrop,
}: {
    rule: AutoReplyRule;
    index: number;
    onUpdate: (updates: Partial<AutoReplyRule>) => void;
    onDelete: () => void;
    onToggle: () => void;
    onDuplicate: () => void;
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (e: React.DragEvent, index: number) => void;
}) => {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
    const ctxRef = useRef<HTMLDivElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // 点击外部关闭右键菜单
    useEffect(() => {
        if (!ctxMenu) return;
        const close = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [ctxMenu]);

    return (
        <div
            className={`rounded-sm overflow-hidden border transition-colors duration-150 relative ${
                isDragOver ? 'border-[var(--focus-border-color)] opacity-60' :
                open ? 'border-[var(--focus-border-color)]' : 'border-[var(--border-color)]'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); onDragOver(e, index); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { setIsDragOver(false); onDrop(e, index); }}
        >
            {/* 规则头部 — 左：拖拽+圆点 • 中：名称只读 • 右：折叠箭头 */}
            <div
                className={`flex items-center gap-1.5 px-1.5 py-2 transition-colors duration-150 select-none bg-[var(--widget-background)] ${open ? '' : 'hover:bg-[var(--list-hover-background)]'} cursor-pointer`}
                onClick={() => setOpen(o => !o)}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
            >
                {/* 拖拽手柄 — 最左侧 */}
                <Tooltip content={t('sidebar.dragOrder')} position="top">
                <span
                    draggable
                    onDragStart={e => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', index.toString());
                        onDragStart(e, index);
                    }}
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--activitybar-inactive-foreground)] opacity-30 hover:opacity-80 transition-opacity"
                    onClick={e => e.stopPropagation()}
                >
                    <GripVertical size={13} />
                </span>
                </Tooltip>

                {/* 激活圆点(启用状态) — w-3 h-3，与 SchemeRow 完全一致 */}
                <Tooltip content={rule.enabled ? t('sidebar.ruleEnabled') : t('sidebar.ruleDisabled')} position="top">
                <span
                    className={`flex-shrink-0 w-3 h-3 rounded-full transition-colors cursor-pointer border-[1.5px] ${
                        rule.enabled ? 'bg-[var(--focus-border-color)] border-[var(--focus-border-color)]' : 'bg-transparent border-[var(--activitybar-inactive-foreground)] opacity-50 hover:opacity-100 hover:border-[var(--focus-border-color)]'
                    }`}
                    onClick={e => { e.stopPropagation(); onToggle(); }}
                />
                </Tooltip>

                {/* 规则名 — 只读文本，展开后才可编辑 */}
                <span className={`flex-1 text-[12px] truncate font-medium ${
                    rule.enabled ? 'text-[var(--app-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] line-through opacity-60'
                }`}>
                    {rule.name || rule.matchPattern || t('autoReply.untitled') || '未命名规则'}
                </span>

                {/* 展开/折叠 — 最右侧 */}
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center pointer-events-none text-[var(--activitybar-inactive-foreground)] opacity-50">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>
            </div>

            {/* 右键菜单（复制、删除） */}
            {ctxMenu && (
                <div
                    ref={ctxRef}
                    className="fixed z-[5000] rounded-sm overflow-hidden shadow-xl py-1 bg-[var(--st-menu-bg)] border border-[var(--menu-border-color)] min-w-[140px]"
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                >
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)]"
                        onClick={() => { onDuplicate(); setCtxMenu(null); }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        <span>复制规则</span>
                    </button>
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors text-[var(--st-status-error)] hover:bg-[var(--st-status-error-bg)]"
                        onClick={() => { onDelete(); setCtxMenu(null); }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/></svg>
                        <span>删除规则</span>
                    </button>
                </div>
            )}

            {/* 展开的编辑区 */}
            {open && (
                <div className="px-2.5 pb-2.5 space-y-2 border-t border-[var(--border-color)] bg-[var(--widget-background)]">
                    {/* 规则名称 — 展开后可编辑 */}
                    <div className="pt-2">
                        <label className="block text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide mb-1">
                            {t('autoReply.ruleName') || '规则名称'}
                        </label>
                        <input
                            className={INPUT_CLS}
                            value={rule.name}
                            onChange={e => onUpdate({ name: e.target.value })}
                            placeholder={t('autoReply.ruleNamePlaceholder') || '规则名称'}
                        />
                    </div>

                    {/* 匹配配置 */}
                    <div className="space-y-1">
                        <div className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide">
                            {t('autoReply.matchConfig')} (RX)
                        </div>
                        <div className="flex gap-1">
                            <div className="flex-1">
                                <CustomSelect
                                    items={MATCH_MODE_OPTIONS.map(o => ({ label: t(o.labelKey as Parameters<typeof t>[0]) || o.label, value: o.value }))}
                                    value={rule.matchMode}
                                    onChange={v => onUpdate({ matchMode: v as AutoReplyRule['matchMode'] })}
                                />
                            </div>
                            <div className="w-[60px] shrink-0">
                                <CustomSelect
                                    items={DATA_MODE_OPTIONS}
                                    value={rule.matchDataMode}
                                    onChange={v => onUpdate({ matchDataMode: v as AutoReplyRule['matchDataMode'] })}
                                />
                            </div>
                        </div>
                        <input
                            className={`${INPUT_CLS} font-mono`}
                            value={rule.matchPattern}
                            onChange={e => onUpdate({ matchPattern: e.target.value })}
                            placeholder={rule.matchDataMode === 'hex' ? 'FF 01 02 ...' : t('autoReply.matchPlaceholder')}
                        />
                    </div>

                    {/* 回复配置 */}
                    <div className="space-y-1">
                        <div className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide">
                            {t('autoReply.replyConfig')}
                        </div>
                        <div className="flex gap-1 items-center">
                            <div className="w-[60px] shrink-0">
                                <CustomSelect
                                    items={DATA_MODE_OPTIONS}
                                    value={rule.replyDataMode}
                                    onChange={v => onUpdate({ replyDataMode: v as AutoReplyRule['replyDataMode'] })}
                                />
                            </div>
                            <div className="flex-1" />
                            <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] shrink-0">{t('autoReply.delay')}</span>
                            <input
                                type="number"
                                className="w-[52px] h-7 px-1 text-[12px] bg-[var(--input-background)] border border-[var(--input-border-color)] rounded-sm text-[var(--app-foreground)] focus:border-[var(--focus-border-color)] outline-none text-center transition-colors tabular-nums"
                                value={rule.replyDelay}
                                min={0}
                                onChange={e => onUpdate({ replyDelay: Math.max(0, parseInt(e.target.value) || 0) })}
                            />
                            <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] shrink-0">ms</span>
                        </div>
                        <input
                            className={`${INPUT_CLS} font-mono`}
                            value={rule.replyData}
                            onChange={e => onUpdate({ replyData: e.target.value })}
                            placeholder={rule.replyDataMode === 'hex' ? 'FF 03 04 ...' : t('autoReply.replyPlaceholder')}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────
//  AutoReplyPanel 主组件
// ──────────────────────────────────────────────
export const AutoReplyPanel = ({
    rules,
    onAddRule: _onAddRule,
    onUpdateRule,
    onDeleteRule,
    onToggleRule,
    onReorderRules,
    onDuplicateRule,
}: AutoReplyPanelProps) => {
    const { t } = useI18n();
    const dragIndexRef = useRef<number>(-1);

    const handleDragStart = useCallback((_e: React.DragEvent, index: number) => {
        dragIndexRef.current = index;
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((_e: React.DragEvent, toIndex: number) => {
        const fromIndex = dragIndexRef.current;
        if (fromIndex === -1 || fromIndex === toIndex) return;
        onReorderRules(fromIndex, toIndex);
        dragIndexRef.current = -1;
    }, [onReorderRules]);

    if (rules.length === 0) {
        return (
            <div className="flex flex-col items-center py-6 gap-2">
                <Zap size={20} className="text-[var(--activitybar-inactive-foreground)] opacity-40" />
                <span className="text-[11px] text-[var(--activitybar-inactive-foreground)]">
                    {t('sidebar.noRules')}
                </span>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            {rules.map((rule, index) => (
                <RuleRow
                    key={rule.id}
                    rule={rule}
                    index={index}
                    onUpdate={updates => onUpdateRule(rule.id, updates)}
                    onDelete={() => onDeleteRule(rule.id)}
                    onToggle={() => onToggleRule(rule.id)}
                    onDuplicate={() => onDuplicateRule(rule.id)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                />
            ))}
        </div>
    );
};
