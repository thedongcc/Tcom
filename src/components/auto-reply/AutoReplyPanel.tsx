/**
 * AutoReplyPanel.tsx
 * 自动回复规则配置面板 — 规则列表与内联编辑器。
 * 仅对 RX 数据进行自动匹配回复。
 */
import { Plus, Trash2, ChevronDown, ChevronRight, Zap, Check } from 'lucide-react';
import { useState } from 'react';
import { CustomSelect } from '../common/CustomSelect';
import { useI18n } from '../../context/I18nContext';
import { AutoReplyRule } from '../../types/autoReply';
import { Tooltip } from '../common/Tooltip';

interface AutoReplyPanelProps {
    rules: AutoReplyRule[];
    onAddRule: () => void;
    onUpdateRule: (id: string, updates: Partial<AutoReplyRule>) => void;
    onDeleteRule: (id: string) => void;
    onToggleRule: (id: string) => void;
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
const INPUT_CLS = "w-full h-7 px-2 text-[12px] bg-[var(--input-background)] border border-[var(--widget-border-color)] rounded text-[var(--app-foreground)] focus:border-[var(--focus-border-color)] outline-none transition-colors placeholder:text-[var(--activitybar-inactive-foreground)]";

export const AutoReplyPanel = ({
    rules,
    onAddRule,
    onUpdateRule,
    onDeleteRule,
    onToggleRule,
}: AutoReplyPanelProps) => {
    const { t } = useI18n();
    // 支持多规则同时展开
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="space-y-1.5">
            {rules.length === 0 && (
                <div className="flex flex-col items-center py-6 gap-2">
                    <Zap size={20} className="text-[var(--activitybar-inactive-foreground)] opacity-40" />
                    <span className="text-[11px] text-[var(--activitybar-inactive-foreground)]">
                        {t('autoReply.noRules')}
                    </span>
                </div>
            )}

            {rules.map(rule => {
                const isExpanded = expandedIds.has(rule.id);
                return (
                    <div
                        key={rule.id}
                        className={`rounded border transition-colors ${
                            isExpanded
                                ? 'border-[var(--focus-border-color)] bg-[var(--widget-background)]'
                                : 'border-[var(--widget-border-color)] bg-[var(--widget-background)] hover:border-[var(--focus-border-color)]'
                        }`}
                    >
                        {/* 规则标题行 */}
                        <div
                            className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none"
                            onClick={() => toggleExpand(rule.id)}
                        >
                            {isExpanded
                                ? <ChevronDown size={12} className="text-[var(--activitybar-inactive-foreground)] shrink-0" />
                                : <ChevronRight size={12} className="text-[var(--activitybar-inactive-foreground)] shrink-0" />
                            }
                            <div
                                className={`w-[14px] h-[14px] rounded-[2px] flex items-center justify-center cursor-pointer transition-all shrink-0 ${rule.enabled
                                    ? 'bg-[var(--checkbox-background)] border border-[var(--checkbox-border-color)]'
                                    : 'bg-transparent border-2 border-[var(--input-border-color)]'
                                }`}
                                onClick={(e) => { e.stopPropagation(); onToggleRule(rule.id); }}
                            >
                                {rule.enabled && <Check size={11} strokeWidth={3} className="text-[var(--checkbox-foreground)]" />}
                            </div>
                            <span className={`text-[12px] flex-1 truncate ${rule.enabled ? 'text-[var(--app-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] line-through opacity-60'}`}>
                                {rule.name || rule.matchPattern || t('autoReply.untitled')}
                            </span>
                            <Tooltip content={t('common.delete')} position="left">
                                <button
                                    className="p-0.5 hover:bg-[var(--hover-background)] rounded transition-colors shrink-0 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); onDeleteRule(rule.id); }}
                                >
                                    <Trash2 size={12} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-status-error)]" />
                                </button>
                            </Tooltip>
                        </div>

                        {/* 规则详情（展开时） */}
                        {isExpanded && (
                            <div className="px-2.5 pb-2.5 space-y-2 border-t border-[var(--widget-border-color)]">
                                {/* 规则名称 */}
                                <div className="pt-2">
                                    <input
                                        className={INPUT_CLS}
                                        value={rule.name}
                                        onChange={e => onUpdateRule(rule.id, { name: e.target.value })}
                                        placeholder={t('autoReply.ruleNamePlaceholder')}
                                    />
                                </div>

                                {/* 匹配配置 */}
                                <div className="space-y-1">
                                    <div className="text-[10px] text-[var(--st-sidebar-title-text)] font-medium uppercase tracking-wider">
                                        {t('autoReply.matchConfig')} (RX)
                                    </div>
                                    {/* 下拉框一行 */}
                                    <div className="flex gap-1">
                                        <div className="flex-1">
                                            <CustomSelect
                                                items={MATCH_MODE_OPTIONS.map(o => ({ label: t(o.labelKey as Parameters<typeof t>[0]) || o.label, value: o.value }))}
                                                value={rule.matchMode}
                                                onChange={v => onUpdateRule(rule.id, { matchMode: v as AutoReplyRule['matchMode'] })}
                                            />
                                        </div>
                                        <div className="w-[60px] shrink-0">
                                            <CustomSelect
                                                items={DATA_MODE_OPTIONS}
                                                value={rule.matchDataMode}
                                                onChange={v => onUpdateRule(rule.id, { matchDataMode: v as AutoReplyRule['matchDataMode'] })}
                                            />
                                        </div>
                                    </div>
                                    {/* 输入框独占一行 */}
                                    <input
                                        className={`${INPUT_CLS} font-mono`}
                                        value={rule.matchPattern}
                                        onChange={e => onUpdateRule(rule.id, { matchPattern: e.target.value })}
                                        placeholder={rule.matchDataMode === 'hex' ? 'FF 01 02 ...' : t('autoReply.matchPlaceholder')}
                                    />
                                </div>

                                {/* 回复配置 */}
                                <div className="space-y-1">
                                    <div className="text-[10px] text-[var(--st-sidebar-title-text)] font-medium uppercase tracking-wider">
                                        {t('autoReply.replyConfig')}
                                    </div>
                                    {/* 下拉框 + 延迟一行 */}
                                    <div className="flex gap-1 items-center">
                                        <div className="w-[60px] shrink-0">
                                            <CustomSelect
                                                items={DATA_MODE_OPTIONS}
                                                value={rule.replyDataMode}
                                                onChange={v => onUpdateRule(rule.id, { replyDataMode: v as AutoReplyRule['replyDataMode'] })}
                                            />
                                        </div>
                                        <div className="flex-1" />
                                        <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] shrink-0">{t('autoReply.delay')}</span>
                                        <input
                                            type="number"
                                            className="w-[52px] h-7 px-1 text-[12px] bg-[var(--input-background)] border border-[var(--widget-border-color)] rounded text-[var(--app-foreground)] focus:border-[var(--focus-border-color)] outline-none text-center transition-colors tabular-nums"
                                            value={rule.replyDelay}
                                            min={0}
                                            onChange={e => onUpdateRule(rule.id, { replyDelay: Math.max(0, parseInt(e.target.value) || 0) })}
                                        />
                                        <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] shrink-0">ms</span>
                                    </div>
                                    {/* 输入框独占一行 */}
                                    <input
                                        className={`${INPUT_CLS} font-mono`}
                                        value={rule.replyData}
                                        onChange={e => onUpdateRule(rule.id, { replyData: e.target.value })}
                                        placeholder={rule.replyDataMode === 'hex' ? 'FF 03 04 ...' : t('autoReply.replyPlaceholder')}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

        </div>
    );
};
