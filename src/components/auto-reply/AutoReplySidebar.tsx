/**
 * AutoReplySidebar.tsx
 * 自动回复侧边栏 — 独立功能模块的侧边栏面板。
 * 布局参照 SerialConfigPanel 的 label+control 表单模式。
 */
import { useMemo, useCallback } from 'react';
import { useSession } from '../../context/SessionContext';
import { useI18n } from '../../context/I18nContext';
import { useAutoReply } from '../../hooks/useAutoReply';
import { AutoReplyPanel } from './AutoReplyPanel';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import type { FeatureSidebarProps } from '../../types/module';

export const AutoReplySidebar = (_props: FeatureSidebarProps) => {
    const { sessions, writeToSession } = useSession();
    const { t } = useI18n();

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
        <div className="flex flex-col h-full" data-component="auto-reply-sidebar">
            {/* 头部控制区 — 表单式布局（label 在上，控件在下） */}
            <div className="px-4 py-2 flex flex-col gap-3">
                {/* 启用开关 — 与虚拟串口中开关样式一致 */}
                <div className="border border-[var(--widget-border-color)] p-3 bg-[var(--widget-background)] rounded-sm">
                    <Switch
                        label={t('autoReply.title')}
                        checked={autoReply.enabled}
                        onChange={autoReply.setEnabled}
                    />
                </div>

                {/* 端口选择器 — 关闭时变暗（仿虚拟串口） */}
                <div className={`${!autoReply.enabled ? 'opacity-40 pointer-events-none' : ''} flex flex-col gap-3 transition-all duration-300`}>
                    {/* 生效端口 — label 和选择器同行 */}
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] text-[var(--st-monitor-config-label)] opacity-80 font-medium shrink-0">
                            {t('autoReply.targetPort')}
                        </label>
                        <div className="flex-1">
                            <CustomSelect
                                items={portOptions}
                                value={selectedPortValue}
                                onChange={handlePortChange}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 分隔线 */}
            <div className="border-t border-[var(--widget-border-color)]" />

            {/* 规则列表 */}
            <div className={`flex-1 overflow-y-auto px-2 py-2 min-h-0 ${!autoReply.enabled ? 'opacity-40 pointer-events-none' : ''} transition-all duration-300`}>
                <AutoReplyPanel
                    rules={autoReply.rules}
                    onAddRule={autoReply.addRule}
                    onUpdateRule={autoReply.updateRule}
                    onDeleteRule={autoReply.deleteRule}
                    onToggleRule={autoReply.toggleRuleEnabled}
                />
            </div>
        </div>
    );
};
