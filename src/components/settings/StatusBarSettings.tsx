/**
 * StatusBarSettings.tsx
 * 状态栏项目配置区 — DnD 拖拽排序、项目开关。
 * 与 ModuleSettings.tsx 同风格，状态持久化在 UIConfig 中。
 */
import { useCallback } from 'react';
import { GripVertical, Info, Cpu, MemoryStick, RefreshCw, Github } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useSettings } from '../../context/SettingsContext';
import { Switch } from '../common/Switch';
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
import type { LucideIcon } from 'lucide-react';

// 状态栏项目定义
interface StatusBarItem {
    id: string;
    nameKey: string;
    icon: LucideIcon;
    configKey: string; // UIConfig 中的 boolean 字段名
}

const STATUS_BAR_ITEMS: StatusBarItem[] = [
    { id: 'version', nameKey: 'settings.layout.statusBarVersion', icon: Info, configKey: 'statusBarVersion' },
    { id: 'cpu', nameKey: 'settings.layout.statusBarCpu', icon: Cpu, configKey: 'statusBarCpu' },
    { id: 'mem', nameKey: 'settings.layout.statusBarMem', icon: MemoryStick, configKey: 'statusBarMem' },
    { id: 'update', nameKey: 'settings.layout.statusBarUpdate', icon: RefreshCw, configKey: 'statusBarUpdate' },
    { id: 'github', nameKey: 'settings.layout.statusBarGithub', icon: Github, configKey: 'statusBarGithub' },
];

const DEFAULT_ORDER = STATUS_BAR_ITEMS.map(i => i.id);

// ─── 可拖拽行 ──────────────────────────────────────────────────────────────
const SortableRow = ({
    id,
    isActive,
    onToggle,
}: {
    id: string;
    isActive: boolean;
    onToggle: (checked: boolean) => void;
}) => {
    const { t } = useI18n();
    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto' as const,
    };

    const item = STATUS_BAR_ITEMS.find(i => i.id === id);
    if (!item) return null;

    const IconComponent = item.icon;

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

            {/* 名称 */}
            <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-medium ${isActive ? 'text-[var(--st-settings-text)]' : 'text-[var(--input-placeholder-color)]'}`}>
                    {t(item.nameKey)}
                </span>
            </div>

            {/* 开关 */}
            <div className="flex-shrink-0">
                <Switch checked={isActive} onChange={onToggle} />
            </div>
        </div>
    );
};

// ─── 状态栏设置内联区域（嵌入界面布局分组中） ────────────────────────────
export const StatusBarSettingsInline = () => {
    const { config, updateUI } = useSettings();

    // 从配置获取排序，兼容没有排序字段的旧配置
    const order = (() => {
        const saved = config.ui.statusBarOrder;
        if (Array.isArray(saved) && saved.length > 0) {
            const validIds = new Set(DEFAULT_ORDER);
            const filtered = saved.filter((id: string) => validIds.has(id));
            DEFAULT_ORDER.forEach(id => { if (!filtered.includes(id)) filtered.push(id); });
            return filtered;
        }
        return [...DEFAULT_ORDER];
    })();

    const saveOrder = useCallback((newOrder: string[]) => {
        updateUI({ statusBarOrder: newOrder });
    }, [updateUI]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = order.indexOf(active.id as string);
            const newIndex = order.indexOf(over?.id as string);
            saveOrder(arrayMove(order, oldIndex, newIndex));
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
                {order.map(id => {
                    const item = STATUS_BAR_ITEMS.find(i => i.id === id);
                    if (!item) return null;
                    const isActive = (config.ui as any)[item.configKey] ?? true;
                    return (
                        <SortableRow
                            key={id}
                            id={id}
                            isActive={isActive}
                            onToggle={(checked) => updateUI({ [item.configKey]: checked })}
                        />
                    );
                })}
            </SortableContext>
        </DndContext>
    );
};
