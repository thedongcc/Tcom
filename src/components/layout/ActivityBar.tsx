import { type ReactNode, useState, useRef, useEffect, useMemo } from 'react';
import { Files, Search, GitGraph, Box, Settings, Monitor, Check } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { usePluginManager } from '../../context/PluginContextShared';
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
    active?: boolean;
    onClick?: () => void;
    className?: string;
    // For context menu usage
    onContextMenu?: (e: React.MouseEvent) => void;
}

const ActivityItem = ({ icon, active, onClick, className, onContextMenu }: ActivityItemProps) => (
    <div
        className={`w-[48px] h-[48px] flex items-center justify-center cursor-pointer relative hover:text-[var(--app-foreground)] transition-colors border-l-4 ${active ? 'text-[var(--app-foreground)] border-[var(--accent-color)]' : 'text-[var(--activitybar-inactive-foreground)] border-transparent'} ${className}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
    >
        {icon}
    </div>
);

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
    { id: 'extensions', icon: <Box size={24} />, label: 'Extensions' },
];

export const ActivityBar = ({ activeView, onViewChange, onOpenSettings }: ActivityBarProps) => {
    const { plugins } = usePluginManager();

    // --- State for Drag & Drop and Visibility ---
    // Merge default items + plugin items
    // Using a simple state initialization for now. In a real app we might persist this.
    const allKnownItems = useMemo(() => {
        const pluginItems = plugins
            .filter(p => p.isActive && p.plugin.sidebarComponent)
            .map(p => ({
                id: p.plugin.id,
                icon: p.plugin.icon ? <p.plugin.icon size={24} /> : <Box size={24} />,
                label: p.plugin.name || p.plugin.id
            }));
        return [...DEFAULT_ITEMS, ...pluginItems];
    }, [plugins]);

    const [orderedIds, setOrderedIds] = useState<string[]>([]);
    const [visibleIds, setVisibleIds] = useState<Record<string, boolean>>({});

    // Initialize state (Load from localStorage or default)
    useEffect(() => {
        // Only run once on mount (or if known items change radically, but mainly once)
        if (orderedIds.length > 0) return; // Already initialized

        const savedOrder = localStorage.getItem('activitybar-order');
        const savedVis = localStorage.getItem('activitybar-visibility');

        if (savedOrder && savedVis) {
            try {
                const parsedOrder = JSON.parse(savedOrder) as string[];
                const parsedVis = JSON.parse(savedVis) as Record<string, boolean>;

                // Merge with current known items (handle new/removed plugins)
                const validIds = new Set(allKnownItems.map(i => i.id));
                const finalOrder = parsedOrder.filter(id => validIds.has(id));
                // Append any new items that weren't in saved order
                allKnownItems.forEach(i => {
                    if (!finalOrder.includes(i.id)) finalOrder.push(i.id);
                });

                setOrderedIds(finalOrder);
                setVisibleIds(parsedVis);
                return;
            } catch (e) {
                console.error('Failed to parse sidebar state', e);
            }
        }

        // Default Fallback
        setOrderedIds(allKnownItems.map(i => i.id));
        const initialVis: Record<string, boolean> = {};
        allKnownItems.forEach(i => initialVis[i.id] = true);
        setVisibleIds(initialVis);
    }, [allKnownItems, orderedIds.length]);

    // Persist State
    useEffect(() => {
        if (orderedIds.length > 0) {
            localStorage.setItem('activitybar-order', JSON.stringify(orderedIds));
        }
    }, [orderedIds]);

    useEffect(() => {
        if (Object.keys(visibleIds).length > 0) {
            localStorage.setItem('activitybar-visibility', JSON.stringify(visibleIds));
        }
    }, [visibleIds]);

    // Context Menu State
    const [contextMenuState, setContextMenuState] = useState<{ x: number, y: number, show: boolean }>({ x: 0, y: 0, show: false });
    const contextMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                setContextMenuState(prev => ({ ...prev, show: false }));
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenuState({
            x: e.clientX,
            y: e.clientY,
            show: true
        });
    };

    const toggleVisibility = (id: string) => {
        setVisibleIds(prev => ({ ...prev, [id]: !prev[id] }));
        // If hiding active view, switch to first visible? Or just leave empty? VSCode leaves it but hides icon.
    };

    return (
        <div
            className="w-[48px] bg-[var(--activitybar-background)] flex flex-col justify-between py-2 border-r border-[var(--border-color)] z-40"
            onContextMenu={handleContextMenu}
        >
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="flex flex-col gap-0">
                    <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                        {orderedIds.map(id => {
                            if (!visibleIds[id]) return null;
                            const itemDef = allKnownItems.find(i => i.id === id);
                            if (!itemDef) return null;

                            return (
                                <SortableActivityItem
                                    key={id}
                                    id={id}
                                    icon={itemDef.icon}
                                    active={activeView === id}
                                    onClick={() => onViewChange(activeView === id ? '' : id)}
                                />
                            );
                        })}
                    </SortableContext>
                </div>
            </DndContext>

            {/* Bottom Actions (Settings) */}
            <div className="flex flex-col gap-0">
                <ActivityItem
                    icon={<Settings size={24} />}
                    active={false}
                    onClick={() => {
                        if (onOpenSettings) onOpenSettings();
                    }}
                />
            </div>

            {/* Context Menu for Visibility */}
            {contextMenuState.show && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[100] bg-[var(--menu-background)] border border-[var(--menu-border-color)] shadow-xl rounded py-1 min-w-[150px]"
                    style={{ left: contextMenuState.x, top: contextMenuState.y }}
                >
                    {allKnownItems.map(item => (
                        <div
                            key={item.id}
                            className="px-3 py-1.5 text-[13px] hover:bg-[var(--list-hover-background)] cursor-pointer flex items-center gap-2 text-[var(--app-foreground)]"
                            onClick={() => toggleVisibility(item.id)}
                        >
                            <div className={`w-4 flex items-center justify-center opacity-80`}>
                                {visibleIds[item.id] && <Check size={14} />}
                            </div>
                            <span>{item.label}</span>
                        </div>
                    ))}
                    <div className="h-[1px] bg-[var(--menu-border-color)] my-1 opacity-50"></div>
                    <div
                        className="px-3 py-1.5 text-[13px] hover:bg-[var(--list-hover-background)] cursor-pointer flex items-center gap-2 text-[var(--app-foreground)]"
                        onClick={() => {
                            // Reset everything
                            const defaultOrder = allKnownItems.map(i => i.id);
                            const defaultVis: Record<string, boolean> = {};
                            allKnownItems.forEach(i => defaultVis[i.id] = true);

                            setOrderedIds(defaultOrder);
                            setVisibleIds(defaultVis);
                            setContextMenuState(prev => ({ ...prev, show: false }));

                            // Clear storage
                            localStorage.removeItem('activitybar-order');
                            localStorage.removeItem('activitybar-visibility');
                        }}
                    >
                        <div className="w-4"></div>
                        <span>Reset Location</span>
                    </div>
                </div>
            )}
        </div>
    );
};
