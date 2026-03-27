/**
 * ModuleSettings.tsx
 * 功能模块排序区 — DnD 拖拽排序、模块开关。
 * 从 SettingsEditor.tsx 中拆分出来。
 */
import { useState, useCallback } from 'react';
import { GripVertical, Files, Monitor, LineChart, LayoutDashboard } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useFeatureManager } from '../../context/FeatureContextShared';
import { FEATURE_REGISTRY } from '../../features/registry';
import { Switch } from '../common/Switch';
import { Group } from './SettingsShared';
import { useDashboardStore } from '../../store/useDashboardStore';
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

// 模块级别
type ModuleTier = 'core' | 'optional' | 'panel';

// 默认侧边栏项
const DEFAULT_MODULE_ITEMS: { id: string; nameKey: string; descriptionKey: string; icon: React.ComponentType<any>; tier: ModuleTier }[] = [
    { id: 'explorer',  nameKey: 'sidebar.sessions',       descriptionKey: '',                     icon: Files,            tier: 'core' },
    { id: 'serial',    nameKey: 'sidebar.configuration',  descriptionKey: '',                     icon: Monitor,          tier: 'core' },
    { id: 'parser',    nameKey: 'sidebar.parser',         descriptionKey: 'panel.parserDesc',     icon: LineChart,        tier: 'panel' },
    { id: 'dashboard', nameKey: 'sidebar.dashboard',      descriptionKey: 'panel.dashboardDesc',  icon: LayoutDashboard,  tier: 'panel' },
];

// 'sidebar.parser' 等 i18n key 如果没有对应 descriptionKey 可以留空，组件里判断
const PANEL_NAME_FALLBACK: Record<string, string> = {
    parser:    '数据解析',
    dashboard: '组件库',
};
const PANEL_DESC_FALLBACK: Record<string, string> = {
    parser:    '右侧实时数据面板',
    dashboard: '仪表盘组件拖拽入口',
};

// 所有模块项（默认 + 可选）
const getAllModuleItems = () => [
    ...DEFAULT_MODULE_ITEMS,
    ...FEATURE_REGISTRY.filter(d => d.tier === 'optional').map(d => ({
        id: d.id, nameKey: d.nameKey, descriptionKey: d.descriptionKey, icon: d.icon, tier: 'optional' as ModuleTier,
    })),
];

// ─── 可拖拽模块行 ─────────────────────────────────────────────────────────
const SortableModuleRow = ({
    id,
    allModuleItems,
    features,
    activateFeature,
    deactivateFeature,
}: {
    id: string;
    allModuleItems: ReturnType<typeof getAllModuleItems>;
    features: ReturnType<typeof useFeatureManager>['features'];
    activateFeature: (id: string) => void;
    deactivateFeature: (id: string) => void;
}) => {
    const { t } = useI18n();
    const { isVisible: dataViewVisible, toggleVisible, showDashboard, toggleDashboard } = useDashboardStore();
    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto' as const,
    };

    const moduleItem = allModuleItems.find(m => m.id === id);
    if (!moduleItem) return null;

    const isOptional  = moduleItem.tier === 'optional';
    const isPanel     = moduleItem.tier === 'panel';

    // 面板类型的激活状态
    const panelChecked = id === 'parser' ? dataViewVisible : showDashboard;
    const panelToggle  = id === 'parser' ? toggleVisible   : toggleDashboard;

    // 通用激活状态（core 和 optional）
    const isActive = isOptional
        ? (features.find(f => f.feature.id === id)?.isActive ?? false)
        : isPanel
            ? panelChecked
            : true;

    const IconComponent = moduleItem.icon;

    // 名称：先尝试 i18n，对 panel 项降级到硬编码中文
    const name = (() => {
        const translated = t(moduleItem.nameKey);
        if (translated && translated !== moduleItem.nameKey) return translated;
        return PANEL_NAME_FALLBACK[id] ?? moduleItem.nameKey;
    })();

    // 描述：panel 项用硬编码，optional 项用 i18n
    const description = isPanel
        ? PANEL_DESC_FALLBACK[id]
        : (moduleItem.descriptionKey ? t(moduleItem.descriptionKey) : '');

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`h-[42px] border-b border-[var(--settings-row-hover-background)] last:border-0 hover:bg-[var(--list-hover-background)] px-3 flex items-center gap-3 ${isDragging ? 'bg-[var(--list-active-background)] rounded shadow-lg' : ''}`}
        >
            {/* 拖拽手柄 */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] transition-colors flex-shrink-0"
                title={t('settings.modules.dragToReorder')}
            >
                <GripVertical size={16} />
            </div>

            {/* 图标 */}
            <div className={`flex-shrink-0 ${isActive ? 'text-[var(--app-foreground)]' : 'text-[var(--input-placeholder-color)]'}`}>
                <IconComponent size={18} />
            </div>

            {/* 名称和描述 */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className={`text-[13px] font-medium shrink-0 ${isActive ? 'text-[var(--st-settings-text)]' : 'text-[var(--input-placeholder-color)]'}`}>
                    {name}
                </span>
                {description && (
                    <span className="text-[11px] text-[var(--input-placeholder-color)] truncate">
                        {description}
                    </span>
                )}
            </div>

            {/* 核心标签 / 面板开关 / 可选模块开关 */}
            <div className="flex-shrink-0">
                {moduleItem.tier === 'core' ? (
                    <span className="text-[13px] text-[var(--input-placeholder-color)] opacity-60 uppercase tracking-wider">
                        {t('settings.modules.core')}
                    </span>
                ) : isPanel ? (
                    <Switch checked={panelChecked} onChange={panelToggle} />
                ) : (
                    <Switch
                        checked={isActive}
                        onChange={(checked) => {
                            if (checked) activateFeature(id);
                            else deactivateFeature(id);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

// ─── 模块排序区域 ─────────────────────────────────────────────────────────
export const ModuleSettings = ({ searchTerm }: { searchTerm: string }) => {
    const { t } = useI18n();
    const { features, activateFeature, deactivateFeature } = useFeatureManager();
    const allModuleItems = getAllModuleItems();

    // 模块排序状态
    const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
        const saved = localStorage.getItem('activitybar-order');
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as string[];
                const allIds = allModuleItems.map(m => m.id);
                const validIds = new Set(allIds);
                const order = parsed.filter(id => validIds.has(id));
                allIds.forEach(id => { if (!order.includes(id)) order.push(id); });
                return order;
            } catch { /* 回退默认顺序 */ }
        }
        return allModuleItems.map(m => m.id);
    });

    // 排序变更时写入 localStorage
    const saveModuleOrder = useCallback((newOrder: string[]) => {
        setModuleOrder(newOrder);
        localStorage.setItem('activitybar-order', JSON.stringify(newOrder));
        // 手动触发 storage 事件让 ActivityBar 实时同步（同一 tab 内不自动触发 StorageEvent）
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'activitybar-order',
            newValue: JSON.stringify(newOrder),
        }));
    }, []);

    const moduleSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleModuleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = moduleOrder.indexOf(active.id as string);
            const newIndex = moduleOrder.indexOf(over?.id as string);
            saveModuleOrder(arrayMove(moduleOrder, oldIndex, newIndex));
        }
    };

    const lowerSearch = searchTerm.toLowerCase();
    const shouldShow = !searchTerm || t('settings.groups.modules').toLowerCase().includes(lowerSearch);

    if (!shouldShow) return null;

    return (
        <Group title={t('settings.groups.modules')}>
            <DndContext
                sensors={moduleSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleModuleDragEnd}
            >
                <SortableContext items={moduleOrder} strategy={verticalListSortingStrategy}>
                    {moduleOrder.map(id => (
                        <SortableModuleRow
                            key={id}
                            id={id}
                            allModuleItems={allModuleItems}
                            features={features}
                            activateFeature={activateFeature}
                            deactivateFeature={deactivateFeature}
                        />
                    ))}
                </SortableContext>
            </DndContext>
        </Group>
    );
};
