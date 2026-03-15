/**
 * ActivityBar.tsx
 * 活动栏 — 侧边栏导航图标，支持拖拽排序。
 */
import { type ReactNode, useState, useEffect, useMemo } from 'react';
import { Files, Box, Settings, Monitor } from 'lucide-react';
import { useFeatureManager } from '../../context/FeatureContextShared';
import { FEATURE_REGISTRY } from '../../features/registry';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
    arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ActivityItemProps {
    id?: string;
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

// Sortable Wrapper
const SortableActivityItem = ({ id, ...props }: ActivityItemProps & { id: string }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <ActivityItem {...props} />
        </div>
    );
};

interface ActivityBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    onOpenSettings?: () => void;
}

const DEFAULT_ITEMS = [
    { id: 'explorer', icon: <Files size={24} />, label: 'Explorer' },
    { id: 'serial', icon: <Monitor size={24} />, label: 'Serial Monitor' },
];

export const ActivityBar = ({ activeView, onViewChange, onOpenSettings }: ActivityBarProps) => {
    const { features } = useFeatureManager();
    const { t } = useI18n();

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
                    label: descriptor ? t(descriptor.nameKey as any) : (f.feature.name || f.feature.id)
                };
            });
        return [...translatedDefaults, ...featureItems];
    }, [features, t]);

    const [orderedIds, setOrderedIds] = useState<string[]>([]);

    // 合并排序：每次 allKnownItems 变化时，确保新增的模块加入排序列表
    useEffect(() => {
        const savedOrder = localStorage.getItem('activitybar-order');

        if (orderedIds.length === 0 && savedOrder) {
            try {
                const parsedOrder = JSON.parse(savedOrder) as string[];
                const validIds = new Set(allKnownItems.map(i => i.id));
                const finalOrder = parsedOrder.filter(id => validIds.has(id));
                allKnownItems.forEach(i => {
                    if (!finalOrder.includes(i.id)) finalOrder.push(i.id);
                });
                setOrderedIds(finalOrder);
                return;
            } catch (e) {
                console.error('Failed to parse sidebar order', e);
            }
        }

        // 确保所有已知项都在排序中（处理异步加载的功能模块）
        const currentIds = new Set(orderedIds);
        const allIds = allKnownItems.map(i => i.id);
        const newIds = allIds.filter(id => !currentIds.has(id));
        // 移除不再存在的项
        const validIds = new Set(allIds);
        const cleanedOrder = orderedIds.filter(id => validIds.has(id));

        if (newIds.length > 0 || cleanedOrder.length !== orderedIds.length) {
            setOrderedIds([...cleanedOrder, ...newIds]);
        } else if (orderedIds.length === 0) {
            setOrderedIds(allIds);
        }
    }, [allKnownItems]);

    // 持久化排序
    useEffect(() => {
        if (orderedIds.length > 0) {
            localStorage.setItem('activitybar-order', JSON.stringify(orderedIds));
        }
    }, [orderedIds]);

    // Drag Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setOrderedIds((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over?.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    return (
        <div
            className="w-[48px] bg-[var(--activitybar-background)] flex flex-col justify-between py-2 border-r border-[var(--border-color)] z-40"
            data-component="activitybar"
        >
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="flex flex-col gap-0">
                    <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                        {orderedIds.map(id => {
                            const itemDef = allKnownItems.find(i => i.id === id);
                            if (!itemDef) return null;

                            return (
                                <SortableActivityItem
                                    key={id}
                                    id={id}
                                    icon={itemDef.icon}
                                    label={itemDef.label}
                                    active={activeView === id}
                                    onClick={() => onViewChange(activeView === id ? '' : id)}
                                />
                            );
                        })}
                    </SortableContext>
                </div>
            </DndContext>

            {/* 底部：设置 */}
            <div className="flex flex-col gap-0">
                <ActivityItem
                    icon={<Settings size={24} />}
                    label={t('configSidebar.settings')}
                    active={false}
                    onClick={() => {
                        if (onOpenSettings) onOpenSettings();
                    }}
                />
            </div>
        </div>
    );
};
