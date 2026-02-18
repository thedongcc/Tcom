import { Plus, FolderPlus, Upload, Trash2, MoreHorizontal, FileText, Folder, Play, CornerDownLeft, Copy } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useCommandManager } from '../../hooks/useCommandManager';
import { CommandList } from './CommandList';
import { CommandEntity, CommandItem } from '../../types/command';
import { CommandEditorDialog } from './CommandEditorDialog';
import { useSession } from '../../context/SessionContext';
import { parseDOM, compileSegments, parseHex } from '../../utils/InputParser';
import { ContextMenu } from '../common/ContextMenu';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter, CollisionDetection, pointerWithin, rectIntersection, useDroppable } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { MessagePipeline } from '../../services/MessagePipeline';
import { useToast } from '../../context/ToastContext';
import { generateUniqueName } from '../../utils/commandUtils';
import { useI18n } from '../../context/I18nContext';

// Helper component for the scrollable list area
const CommandScrollArea = ({
    items,
    onEdit,
    onSend,
    onContextMenu,
    canSend,
    selectedIds,
    onSelect,
    onClearSelection
}: {
    items: CommandEntity[];
    onEdit: (item: CommandEntity) => void;
    onSend: (item: CommandItem) => void;
    onContextMenu: (e: React.MouseEvent, item?: CommandEntity) => void;
    canSend: boolean;
    selectedIds: Set<string>;
    onSelect: (e: React.MouseEvent, item: CommandEntity) => void;
    onClearSelection: () => void;
}) => {
    const { t } = useI18n();
    const { setNodeRef: setRootDropRef, isOver, active } = useDroppable({
        id: 'root-drop',
        data: { type: 'root' }
    });

    const showLine = isOver && active;

    return (
        <div
            ref={setRootDropRef}
            className="flex-1 overflow-y-auto p-1 min-h-0 relative"
            onContextMenu={(e) => onContextMenu(e)}
            onClick={onClearSelection}
        >
            <CommandList
                items={items}
                onEdit={onEdit}
                onSend={onSend}
                onContextMenu={onContextMenu}
                dropIndicator={null}
                canSend={canSend}
                selectedIds={selectedIds}
                onSelect={onSelect}
            />

            {showLine && (
                <div className="mx-1 mt-0.5 h-[2px] bg-[#007acc] shadow-[0_0_4px_#007acc] rounded-full" />
            )}

            {items.length === 0 && !showLine && (
                <div className="p-4 text-center text-[13px] text-[#969696] opacity-60">
                    {t('command.noCommands')}<br />{t('command.noCommandsHint')}
                </div>
            )}
        </div>
    );
};

const CommandListSidebarContent = ({ onNavigate }: { onNavigate?: (view: string) => void }) => {
    const {
        commands, addGroup, addCommand, clearAll, importCommands, exportCommands,
        setAllCommands, deleteEntity, deleteEntities, updateEntity, duplicateEntity,
        undo, redo, canUndo, canRedo
    } = useCommandManager();
    const { showToast } = useToast();
    const { t } = useI18n();

    const { activeSessionId, sessions, writeToSession, publishMqtt, connectSession } = useSession();
    const [showMenu, setShowMenu] = useState(false);
    const [editingItem, setEditingItem] = useState<CommandEntity | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: CommandEntity | null } | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<CommandEntity | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            const isInput = ['INPUT', 'TEXTAREA'].includes(activeEl?.tagName || '');
            const isContentEditable = activeEl?.getAttribute('contenteditable') === 'true';
            const hasModalOpen = document.querySelector('.fixed.z-50') || document.querySelector('dialog[open]');

            if (isInput || isContentEditable || !!hasModalOpen) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                if (lastSelectedId) {
                    const item = commands.find(c => c.id === lastSelectedId);
                    if (item) setClipboard(item);
                }
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                if (clipboard) {
                    let targetId: string | undefined = undefined;
                    if (lastSelectedId) {
                        const sel = commands.find(c => c.id === lastSelectedId);
                        if (sel?.type === 'group') {
                            targetId = sel.id;
                        } else if (sel) {
                            targetId = sel.parentId || undefined;
                        }
                    }
                    duplicateEntity(clipboard.id, targetId);
                }
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIds.size > 0) {
                    deleteEntities(Array.from(selectedIds));
                    setSelectedIds(new Set());
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds, lastSelectedId, clipboard, commands, undo, redo, canUndo, canRedo, deleteEntities, duplicateEntity]);

    const handleItemClick = (e: React.MouseEvent, item: CommandEntity) => {
        e.stopPropagation();
        let newSelection = new Set(selectedIds);

        if (e.ctrlKey || e.metaKey) {
            if (newSelection.has(item.id)) {
                newSelection.delete(item.id);
            } else {
                newSelection.add(item.id);
                setLastSelectedId(item.id);
            }
        } else if (e.shiftKey && lastSelectedId) {
            const getVisibleItems = (parentId?: string | null): CommandEntity[] => {
                const effectiveParentId = parentId === undefined ? null : parentId;
                const children = commands.filter(c => c.parentId === effectiveParentId || (effectiveParentId === null && !c.parentId));
                let flat: CommandEntity[] = [];
                for (const child of children) {
                    flat.push(child);
                    if (child.type === 'group' && (child.isOpen ?? true)) {
                        flat = [...flat, ...getVisibleItems(child.id)];
                    }
                }
                return flat;
            };

            const visibleItems = getVisibleItems(undefined);
            const startIndex = visibleItems.findIndex(i => i.id === lastSelectedId);
            const endIndex = visibleItems.findIndex(i => i.id === item.id);

            if (startIndex !== -1 && endIndex !== -1) {
                const start = Math.min(startIndex, endIndex);
                const end = Math.max(startIndex, endIndex);
                const range = visibleItems.slice(start, end + 1);
                range.forEach(i => newSelection.add(i.id));
            }
        } else {
            newSelection = new Set([item.id]);
            setLastSelectedId(item.id);
        }

        setSelectedIds(newSelection);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const rootItems = useMemo(() => commands.filter(c => !c.parentId), [commands]);

    const customCollisionStrategy: CollisionDetection = (args) => {
        const pointerCollisions = pointerWithin(args);
        const insertionLine = pointerCollisions.find(c =>
            c.id.toString().endsWith('-top') ||
            c.id.toString().endsWith('-bottom')
        );

        if (insertionLine) {
            return [insertionLine];
        }

        const dropZone = pointerCollisions.find(c =>
            c.id.toString().endsWith('-drop')
        );

        if (dropZone) {
            return [dropZone];
        }

        const rootDrop = pointerCollisions.find(c => c.id === 'root-drop');
        if (rootDrop) {
            return [rootDrop];
        }

        return closestCenter(args);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        if (over.id === 'root-drop') {
            const activeId = active.id.toString();
            const activeItem = commands.find(c => c.id === activeId);

            if (activeItem) {
                if (activeItem.parentId !== undefined) {
                    const hasCollision = commands.some(c =>
                        c.parentId === undefined &&
                        c.name === activeItem.name &&
                        c.id !== activeItem.id
                    );
                    if (hasCollision) {
                        showToast(t('toast.moveConflict', { name: activeItem.name }), 'warning');
                        return;
                    }
                }

                if (activeItem.parentId) {
                    updateEntity(activeItem.id, { parentId: undefined });
                } else {
                    const oldIndex = commands.findIndex(c => c.id === activeId);
                    const newIndex = commands.length - 1;
                    if (oldIndex !== newIndex) {
                        setAllCommands(arrayMove(commands, oldIndex, newIndex));
                    }
                }
            }
            return;
        }

        const activeId = active.id.toString();
        const overIdFull = over.id.toString();
        const isDropInto = overIdFull.endsWith('-drop');
        const isInsertTop = overIdFull.endsWith('-top');
        const isInsertBottom = overIdFull.endsWith('-bottom');
        const overIdClean = overIdFull.replace(/-drop|-top|-bottom/, '');

        if (activeId === overIdClean) return;

        const activeItem = commands.find(c => c.id === activeId);
        const overItem = commands.find(c => c.id === overIdClean);

        if (!activeItem || !overItem) return;

        let targetParentId: string | undefined = undefined;

        if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
            targetParentId = overItem.id;
        } else if (activeItem.parentId !== overItem.parentId) {
            targetParentId = overItem.parentId || undefined;
        }

        if (targetParentId !== activeItem.parentId) {
            const hasCollision = commands.some(c =>
                c.parentId === targetParentId &&
                c.name === activeItem.name &&
                c.id !== activeItem.id
            );
            if (hasCollision) {
                showToast(t('toast.moveConflict', { name: activeItem.name }), 'warning');
                return;
            }
        }

        if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
            updateEntity(activeItem.id, { parentId: overItem.id });
            return;
        }

        if (activeItem.parentId !== overItem.parentId) {
            let newCommands = [...commands];
            const activeIndex = newCommands.findIndex(c => c.id === activeId);
            const [movedItem] = newCommands.splice(activeIndex, 1);
            movedItem.parentId = overItem.parentId;
            const overIndex = newCommands.findIndex(c => c.id === overIdClean);
            let insertIndex = overIndex;
            if (isInsertBottom) insertIndex = overIndex + 1;
            newCommands.splice(insertIndex, 0, movedItem);
            setAllCommands(newCommands);
            return;
        }

        const activeIndex = commands.findIndex(c => c.id === activeId);
        const overIndex = commands.findIndex(c => c.id === overIdClean);
        let newCommands = [...commands];
        const [movedItem] = newCommands.splice(activeIndex, 1);
        const newOverIndex = newCommands.findIndex(c => c.id === overIdClean);
        let insertIndex = newOverIndex;
        if (isInsertBottom) insertIndex++;

        if (!isInsertTop && !isInsertBottom) {
            setAllCommands(arrayMove(commands, activeIndex, overIndex));
            return;
        }

        newCommands.splice(insertIndex, 0, movedItem);
        setAllCommands(newCommands);
    };

    const handleSend = async (cmd: CommandItem) => {
        const isEmpty = !cmd.payload?.trim() && (!cmd.tokens || Object.keys(cmd.tokens).length === 0);
        if (isEmpty) return;

        if (!activeSessionId) return;
        const session = sessions.find(s => s.id === activeSessionId);
        if (!session.isConnected) {
            if (activeSessionId) {
                try {
                    const success = await connectSession(activeSessionId);
                    if (success === true) {
                        return;
                    } else {
                        if (onNavigate) onNavigate('serial');
                        return;
                    }
                } catch (e) {
                    if (onNavigate) onNavigate('serial');
                    return;
                }
            } else {
                if (onNavigate) onNavigate('serial');
                return;
            }
        }

        try {
            const { data } = MessagePipeline.process(
                cmd.payload,
                cmd.html || null,
                cmd.mode,
                cmd.tokens,
                cmd.lineEnding || ''
            );
            if (!data || data.length === 0) return;
            if (session.config.type === 'mqtt') {
                await publishMqtt(session.id, 'command', data, { qos: 0, retain: false });
            } else {
                await writeToSession(session.id, data);
            }
        } catch (e) {
            console.error('Failed to send command', e);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, item?: CommandEntity) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item: item || null
        });
    };

    const handleDuplicate = (item: CommandEntity) => {
        duplicateEntity(item.id, item.parentId || undefined);
    };

    const handleCopy = (item: CommandEntity) => {
        setClipboard(item);
    };

    const handlePaste = (targetParentId?: string) => {
        if (!clipboard) return;
        duplicateEntity(clipboard.id, targetParentId);
    };

    const getMenuItems = () => {
        if (!contextMenu) return [];
        const { item } = contextMenu;

        if (!item) {
            return [
                {
                    label: t('command.newCommand'),
                    icon: <FileText size={13} />,
                    onClick: () => addCommand({ name: generateUniqueName(commands, t('command.newCommand'), undefined), payload: '', mode: 'text', tokens: {}, parentId: undefined })
                },
                {
                    label: t('command.newGroup'),
                    icon: <FolderPlus size={13} />,
                    onClick: () => addGroup(generateUniqueName(commands, t('command.newGroup'), undefined))
                },
                { separator: true },
                {
                    label: t('common.paste'),
                    icon: <CornerDownLeft size={13} className="rotate-180" />,
                    onClick: () => handlePaste(undefined),
                    disabled: !clipboard
                }
            ];
        }

        const items: any[] = [
            {
                label: t('common.edit'),
                onClick: () => setEditingItem(item)
            },
            {
                label: t('common.duplicate'),
                icon: <Copy size={13} />,
                onClick: () => handleDuplicate(item)
            },
            {
                label: t('common.copy'),
                icon: <Copy size={13} />,
                onClick: () => handleCopy(item)
            },
            { separator: true },
            {
                label: t('common.delete'),
                icon: <Trash2 size={13} />,
                color: 'red',
                onClick: () => deleteEntity(item.id)
            }
        ];

        if (item.type === 'group') {
            items.splice(3, 0, {
                label: t('common.paste'),
                onClick: () => handlePaste(item.id),
                disabled: !clipboard
            }, { separator: true });

            items.unshift({ separator: true });
            items.unshift({
                label: t('command.newGroup'),
                icon: <FolderPlus size={13} />,
                onClick: () => addGroup(generateUniqueName(commands, t('command.newGroup'), item.id))
            });
            items.unshift({
                label: t('command.newCommand'),
                icon: <FileText size={13} />,
                onClick: () => addCommand({ name: generateUniqueName(commands, t('command.newCommand'), item.id), payload: '', mode: 'text', tokens: {}, parentId: item.id })
            });
        }

        return items;
    };

    return (
        <div className="flex flex-col h-full bg-[#252526] text-[#cccccc]" onContextMenu={(e) => { e.preventDefault(); }}>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold bg-[#252526] border-b border-[#3c3c3c]">
                <span className="uppercase tracking-wide">{t('command.commandMenu')}</span>
                <div className="flex items-center gap-1 relative">
                    <button
                        className="p-1 hover:bg-[#3c3c3c] rounded text-[#cccccc]"
                        title="Menu"
                        onClick={() => setShowMenu(!showMenu)}
                    >
                        <MoreHorizontal size={14} />
                    </button>

                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-[#252526] border border-[#3c3c3c] shadow-lg rounded-sm z-50 text-[13px]">
                                <div className="py-1">
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { addGroup(generateUniqueName(commands, t('command.newGroup'), undefined)); setShowMenu(false); }}>
                                        <FolderPlus size={14} /> {t('command.newGroup')}
                                    </div>
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { addCommand({ name: generateUniqueName(commands, t('command.newCommand'), undefined), payload: '', mode: 'text', tokens: {}, parentId: undefined }); setShowMenu(false); }}>
                                        <FileText size={14} /> {t('command.newCommand')}
                                    </div>
                                    <div className="h-[1px] bg-[#3c3c3c] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { importCommands(); setShowMenu(false); }}>
                                        <Upload size={14} /> {t('command.import')}
                                    </div>
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { exportCommands(); setShowMenu(false); }}>
                                        <Upload size={14} className="rotate-180" /> {t('command.export')}
                                    </div>
                                    <div className="h-[1px] bg-[#3c3c3c] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2 text-red-400"
                                        onClick={() => { clearAll(); setShowMenu(false); }}>
                                        <Trash2 size={14} /> {t('command.clearAll')}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
                <DndContext
                    sensors={sensors}
                    collisionDetection={customCollisionStrategy}
                    onDragEnd={handleDragEnd}
                >
                    <CommandScrollArea
                        items={rootItems}
                        onEdit={setEditingItem}
                        onSend={(cmd) => handleSend(cmd as CommandItem)}
                        onContextMenu={handleContextMenu}
                        canSend={!!activeSessionId}
                        selectedIds={selectedIds}
                        onSelect={handleItemClick}
                        onClearSelection={() => {
                            setSelectedIds(new Set());
                            setLastSelectedId(null);
                        }}
                    />
                </DndContext>
            </div>

            {editingItem && (
                <CommandEditorDialog
                    item={editingItem}
                    onClose={() => setEditingItem(null)}
                    onSave={(updates) => {
                        updateEntity(editingItem.id, updates);
                        setEditingItem(null);
                    }}
                    existingNames={commands
                        .filter(c => c.parentId === editingItem.parentId && c.id !== editingItem.id)
                        .map(c => c.name)}
                />
            )}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={getMenuItems()}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    );
};

export const CommandListSidebar = ({ onNavigate }: { onNavigate?: (view: string) => void }) => {
    return (
        <CommandListSidebarContent onNavigate={onNavigate} />
    );
};
