/**
 * MqttTopicList.tsx
 * MQTT 订阅主题列表组件 — 添加/删除/编辑主题。
 * 从 MqttConfigPanel.tsx 中拆分出来。
 */
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MqttTopicConfig } from '../../types/session';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

const COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e',
    '#cccccc', '#9ca3af'
];

const inputCls = 'w-full bg-[var(--input-background)] border border-[var(--input-border-color)] text-[var(--input-foreground)] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--focus-border-color)] disabled:opacity-50';

interface MqttTopicListProps {
    topics: MqttTopicConfig[];
    onUpdate: (topics: MqttTopicConfig[]) => void;
}

export const MqttTopicList = React.memo(({ topics, onUpdate }: MqttTopicListProps) => {
    const { t } = useI18n();
    const [newTopicPath, setNewTopicPath] = useState('');

    const handleAddTopic = () => {
        if (!newTopicPath.trim()) return;
        if (topics.some(t => t.path === newTopicPath.trim())) return;

        const newTopic: MqttTopicConfig = {
            id: Date.now().toString(),
            path: newTopicPath.trim(),
            color: COLORS[Math.floor(Math.random() * (COLORS.length - 2))],
            subscribed: true
        };
        onUpdate([...topics, newTopic]);
        setNewTopicPath('');
    };

    const handleRemoveTopic = (id: string) => {
        onUpdate(topics.filter(t => t.id !== id));
    };

    const updateTopic = (id: string, updates: Partial<MqttTopicConfig>) => {
        onUpdate(topics.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[var(--mqtt-config-bg)] sticky top-0 border-b border-[var(--border-color)] shrink-0">
                {t('mqtt.subscriptions')}
            </div>

            <div className="p-3 flex flex-col gap-3 min-h-0">
                <div className="flex flex-col gap-2 shrink-0">
                    <input
                        className={inputCls}
                        placeholder={t('mqtt.addTopicPlaceholder')}
                        value={newTopicPath}
                        onChange={(e) => setNewTopicPath(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                    />
                    <button
                        className="w-full py-1.5 bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] text-[var(--button-foreground)] text-[12px] rounded-sm transition-colors flex items-center justify-center gap-1"
                        onClick={handleAddTopic}
                    >
                        <Plus size={14} />
                        {t('mqtt.addTopic')}
                    </button>
                </div>

                {/* 主题列表 */}
                <div className="flex flex-col gap-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
                    {topics.length === 0 && (
                        <div className="text-[var(--input-placeholder-color)] italic text-[11px] text-center py-4">{t('mqtt.noSubscriptions')}</div>
                    )}
                    {topics.map((topic) => (
                        <div
                            key={topic.id}
                            className="group flex flex-col gap-2 p-2 bg-[var(--list-active-background)] rounded-sm hover:bg-[var(--list-hover-background)] transition-colors border border-transparent hover:border-[var(--border-color)]"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {/* 颜色选择器 */}
                                <div className="relative w-3 h-3 shrink-0 rounded-full overflow-hidden border border-white/10">
                                    <input
                                        type="color"
                                        className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                                        value={topic.color}
                                        onChange={(e) => updateTopic(topic.id, { color: e.target.value })}
                                    />
                                    <div className="w-full h-full pointer-events-none" style={{ backgroundColor: topic.color }} />
                                </div>

                                {/* 主题路径 */}
                                <input
                                    className="flex-1 bg-transparent border-none outline-none text-[12px] font-mono text-[var(--input-foreground)] min-w-0"
                                    value={topic.path}
                                    onChange={(e) => updateTopic(topic.id, { path: e.target.value })}
                                />

                                {/* 订阅开关 */}
                                <Tooltip content={topic.subscribed ? t('mqtt.topicSubscribed') : t('mqtt.topicPaused')} position="bottom" wrapperClassName="flex items-center px-0.5">
                                    <button
                                        className={`w-8 h-4 rounded-full flex items-center transition-colors px-0.5 ${topic.subscribed ? 'bg-[var(--switch-active-bg)]' : 'bg-[var(--input-border-color)]'}`}
                                        onClick={() => updateTopic(topic.id, { subscribed: !topic.subscribed })}
                                    >
                                        <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${topic.subscribed ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </Tooltip>

                                {/* 删除 */}
                                <Trash2
                                    size={14}
                                    className="text-[var(--input-placeholder-color)] hover:text-[var(--st-status-error)] cursor-pointer transition-colors"
                                    onClick={() => handleRemoveTopic(topic.id)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

MqttTopicList.displayName = 'MqttTopicList';
