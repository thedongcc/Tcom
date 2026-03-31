/**
 * AutoReplySidebar.tsx
 * 自动回复侧边栏 — 独立功能模块的侧边栏面板。
 * 布局参照 SerialConfigPanel 的 label+control 表单模式。
 */
import { useMemo, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { useI18n } from '../../context/I18nContext';
import { useProfile } from '../../context/ProfileContext';
import { useAutoReply } from '../../hooks/useAutoReply';
import { AutoReplyPanel } from './AutoReplyPanel';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import type { FeatureSidebarProps } from '../../types/module';

export const AutoReplySidebar = (_props: FeatureSidebarProps) => {
    const { sessions, writeToSession } = useSession();
    const { t } = useI18n();
    const { activeProfile, isLoaded: profileLoaded } = useProfile();
    const [rulesOpen, setRulesOpen] = useState(true);

    // 仅串口类型的会话
    const serialSessions = useMemo(() =>
        sessions.filter(s => s.config.type === 'serial' || s.config.type === 'mqtt' || s.config.type === 'monitor'),
    [sessions]);

    const sessionsData = useMemo(() =>
        serialSessions.map(s => ({
            id: s.id,
            logs: s.logs,
            isConnected: s.isConnected,
        })),
    [serialSessions]);

    const handleWriteToSession = useCallback((sessionId: string, data: string | Uint8Array, options?: { commandName?: string }) => {
        writeToSession(sessionId, data, options);
    }, [writeToSession]);

    const autoReply = useAutoReply({
        activeProfile,
        profileLoaded,
        sessionsData,
        writeToSession: handleWriteToSession,
    });

    // 端口选择器选项
    const portOptions = useMemo(() => [
        { label: t('autoReply.allPorts'), value: '__all__' },
        ...serialSessions.map(s => ({
            label: s.config.name || s.id,
            value: s.id,
        })),
    ], [serialSessions, t]);

    const selectedPortValue = autoReply.targetSessionIds.length === 0
        ? '__all__'
        : autoReply.targetSessionIds[0];

    const handlePortChange = (value: string) => {
        if (value === '__all__') {
            autoReply.setTargetSessionIds([]);
        } else {
            autoReply.setTargetSessionIds([value]);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--serial-config-bg)] text-[var(--serial-config-text)]" data-component="auto-reply-sidebar">
            {/* 头部控制区 — 与 ParserSidebar Switch 区完全一致：px-4 py-2 + border-b */}
            <div className="px-4 py-2 flex flex-col gap-3 border-b border-[var(--border-color)] shrink-0">
                {/* 启用开关 */}
                <Switch
                    label={t('autoReply.title')}
                    checked={autoReply.enabled}
                    onChange={autoReply.setEnabled}
                />

                {/* 端口选择器 — 关闭时变暗 */}
                <div className={`${!autoReply.enabled ? 'opacity-40 pointer-events-none' : ''} flex flex-col gap-3 transition-all duration-300`}>
                    {/* 生效端口 */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">
                            {t('autoReply.targetPort')}
                        </label>
                        <CustomSelect
                            items={portOptions}
                            value={selectedPortValue}
                            onChange={handlePortChange}
                        />
                    </div>
                </div>
            </div>

            {/* ══ 规则区标题行（可折叠）——对齐 ParserSidebar 的 SCHEMES 标题行 ══ */}
            <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[var(--serial-config-bg)] sticky top-0 flex items-center justify-between cursor-pointer hover:bg-[var(--list-hover-background)] border-b border-[var(--border-color)] border-t z-10 shrink-0"
                onClick={() => setRulesOpen(o => !o)}
            >
                <div className="flex items-center gap-2">
                    {rulesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{t('autoReply.rules')} · {autoReply.rules.length}</span>
                </div>
                <button
                    className="text-[10px] px-2 py-0.5 rounded-sm text-[var(--button-foreground)] bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] transition-colors cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); autoReply.addRule(); setRulesOpen(true); }}
                >
                    + {t('autoReply.addRule')}
                </button>
            </div>

            {/* 规则列表 */}
            <div className={`flex-1 overflow-y-auto px-2 py-2 min-h-0 ${!autoReply.enabled ? 'opacity-40 pointer-events-none' : ''} transition-all duration-300`}>
                {rulesOpen && (
                    <AutoReplyPanel
                        rules={autoReply.rules}
                        onAddRule={autoReply.addRule}
                        onUpdateRule={autoReply.updateRule}
                        onDeleteRule={autoReply.deleteRule}
                        onToggleRule={autoReply.toggleRuleEnabled}
                        onReorderRules={autoReply.reorderRules}
                        onDuplicateRule={autoReply.duplicateRule}
                    />
                )}
            </div>
        </div>
    );
};
