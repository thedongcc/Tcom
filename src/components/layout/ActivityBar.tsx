/**
 * ActivityBar.tsx
 * 活动栏 — 侧边栏导航图标，按 localStorage 中保存的顺序排列。
 * 排序功能已迁移到设置页的功能模块区。
 */
import { type ReactNode, useState, useEffect, useMemo } from 'react';
import { Files, Box, Settings, Monitor } from 'lucide-react';
import { useFeatureManager } from '../../context/FeatureContextShared';
import { FEATURE_REGISTRY } from '../../features/registry';
import { useI18n } from '../../context/I18nContext';
import { useSettings } from '../../context/SettingsContext';
import { Tooltip } from '../common/Tooltip';

interface ActivityItemProps {
    icon: ReactNode;
    label?: string;
    active?: boolean;
    onClick?: () => void;
    className?: string;
}

const ActivityItem = ({ icon, label, active, onClick, className }: ActivityItemProps) => {
    const content = (
        <div
            className={`w-[48px] h-[48px] flex items-center justify-center cursor-pointer relative hover:text-[var(--st-activitybar-icon-hover)] transition-colors border-l-4 ${active ? 'text-[var(--st-activitybar-icon-active)] border-[var(--accent-color)]' : 'text-[var(--activitybar-inactive-foreground)] border-transparent'} ${className}`}
            onClick={onClick}
        >
            {icon}
        </div>
    );

    if (label) {
        return (
            <Tooltip content={label} position="right" delay={300}>
                {content}
            </Tooltip>
        );
    }

    return content;
};

interface ActivityBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
}

const DEFAULT_ITEMS = [
    { id: 'explorer', icon: <Files size={24} />, label: 'Explorer' },
    { id: 'serial', icon: <Monitor size={24} />, label: 'Serial Monitor' },
];

export const ActivityBar = ({ activeView, onViewChange }: ActivityBarProps) => {
    const { features } = useFeatureManager();
    const { t } = useI18n();
    const { openSettings } = useSettings();

    // 合并默认项 + 激活的功能模块
    const allKnownItems = useMemo(() => {
        // 翻译默认项
        const translatedDefaults = DEFAULT_ITEMS.map(item => {
            let translatedLabel = item.label;
            if (item.id === 'explorer') translatedLabel = t('sidebar.sessions');
            else if (item.id === 'serial') translatedLabel = t('sidebar.configuration');
            return { ...item, label: translatedLabel };
        });

        // 活跃的功能模块（有侧边栏组件的）
        const featureItems = features
            .filter(f => f.isActive && f.feature.sidebarComponent)
            .map(f => {
                const descriptor = FEATURE_REGISTRY.find(d => d.id === f.feature.id);
                return {
                    id: f.feature.id,
                    icon: f.feature.icon ? <f.feature.icon size={24} /> : <Box size={24} />,
                    label: descriptor ? t(descriptor.nameKey) : (f.feature.name || f.feature.id)
                };
            });
        return [...translatedDefaults, ...featureItems];
    }, [features, t]);

    // 从 localStorage 读取排序（与设置页共享同一 key）
    const [orderedIds, setOrderedIds] = useState<string[]>([]);

    useEffect(() => {
        const savedOrder = localStorage.getItem('activitybar-order');
        const allIds = allKnownItems.map(i => i.id);

        if (savedOrder) {
            try {
                const parsedOrder = JSON.parse(savedOrder) as string[];
                const validIds = new Set(allIds);
                // 保留已存在的排序，追加新增的项
                const finalOrder = parsedOrder.filter(id => validIds.has(id));
                allIds.forEach(id => {
                    if (!finalOrder.includes(id)) finalOrder.push(id);
                });
                setOrderedIds(finalOrder);
                return;
            } catch { /* 解析失败则用默认顺序 */ }
        }
        setOrderedIds(allIds);
    }, [allKnownItems]);

    // 监听 localStorage 变化（当设置页排序更新时实时同步）
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'activitybar-order' && e.newValue) {
                try {
                    const newOrder = JSON.parse(e.newValue) as string[];
                    const validIds = new Set(allKnownItems.map(i => i.id));
                    setOrderedIds(newOrder.filter(id => validIds.has(id)));
                } catch { /* 忽略 */ }
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [allKnownItems]);

    return (
        <div
            className="w-[48px] bg-[var(--activitybar-background)] flex flex-col justify-between py-2 border-r border-[var(--border-color)] z-40"
            data-component="activitybar"
        >
            <div className="flex flex-col gap-0">
                {orderedIds.map(id => {
                    const itemDef = allKnownItems.find(i => i.id === id);
                    if (!itemDef) return null;

                    return (
                        <ActivityItem
                            key={id}
                            icon={itemDef.icon}
                            label={itemDef.label}
                            active={activeView === id}
                            onClick={() => onViewChange(activeView === id ? '' : id)}
                        />
                    );
                })}
            </div>

            {/* 底部：设置 */}
            <div className="flex flex-col gap-0">
                <ActivityItem
                    icon={<Settings size={24} />}
                    label={t('configSidebar.settings')}
                    active={false}
                    onClick={() => openSettings()}
                />
            </div>
        </div>
    );
};
