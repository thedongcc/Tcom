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

// Helper component for the scrollable list area
// This needs to be a separate component so it can validly consume useDroppable context from DndContext
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
    // 1. Root Drop Hook (Catches drags to empty space)
    const { setNodeRef: setRootDropRef, isOver, active } = useDroppable({
        id: 'root-drop',
        data: { type: 'root' }
    });

    // 2. Visual Logic: Show line if we are dragging something over the root zone
    // `active` is non-null when dragging. `isOver` is true when pointer is over this div.
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
                dropIndicator={null} // Pass null, using local state in items
                canSend={canSend}
                selectedIds={selectedIds}
                onSelect={onSelect}
            />

            {/* Visual Insertion Line at Bottom (For Root Drop) */}
            {/* We position it after the list to indicate "Insert at End / Root" */}
            {showLine && (
                <div className="mx-1 mt-0.5 h-[2px] bg-[#007acc] shadow-[0_0_4px_#007acc] rounded-full" />
            )}

            {/* Empty State Message */}
            {items.length === 0 && !showLine && (
                <div className="p-4 text-center text-[13px] text-[#969696] opacity-60">
                    No commands.<br />Use the menu to add groups or commands.
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

    const { activeSessionId, sessions, writeToSession, publishMqtt, connectSession } = useSession();
    const [showMenu, setShowMenu] = useState(false);
    const [editingItem, setEditingItem] = useState<CommandEntity | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: CommandEntity | null } | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<CommandEntity | null>(null);

    // Global Key Bindings
    // Global Key Bindings
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if we're in an input/textarea or contenteditable element (TipTap editor)
            const activeEl = document.activeElement;
            const isInput = ['INPUT', 'TEXTAREA'].includes(activeEl?.tagName || '');
            const isContentEditable = activeEl?.getAttribute('contenteditable') === 'true';

            // Also check if a modal dialog is open (has z-50 class or is a DIALOG)
            const hasModalOpen = document.querySelector('.fixed.z-50') || document.querySelector('dialog[open]');

            if (isInput || isContentEditable || !!hasModalOpen) return;

            // Undo / Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    if (canRedo) redo();
                } else {
                    if (canUndo) undo();
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                if (canRedo) redo();
                return;
            }

            // Copy
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                if (lastSelectedId) {
                    const item = commands.find(c => c.id === lastSelectedId);
                    if (item) setClipboard(item);
                }
                return;
            }

            // Paste
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                if (clipboard) {
                    let targetId: string | undefined = undefined;
                    // If selection exists, paste effectively into proper context
                    if (lastSelectedId) {
                        const sel = commands.find(c => c.id === lastSelectedId);
                        if (sel?.type === 'group') {
                            targetId = sel.id; // Into selected group
                        } else if (sel) {
                            targetId = sel.parentId || undefined; // Next to selected item
                        }
                    }
                    duplicateEntity(clipboard.id, targetId);
                }
                return;
            }

            // Delete
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

    // Selection Handler
    const handleItemClick = (e: React.MouseEvent, item: CommandEntity) => {
        e.stopPropagation();
        let newSelection = new Set(selectedIds);

        if (e.ctrlKey || e.metaKey) {
            // Toggle
            if (newSelection.has(item.id)) {
                newSelection.delete(item.id);
            } else {
                newSelection.add(item.id);
                setLastSelectedId(item.id);
            }
        } else if (e.shiftKey && lastSelectedId) {
            // Range Selection
            // 1. Flatten visible items in visual order
            const getVisibleItems = (parentId?: string | null): CommandEntity[] => {
                // Handle Root: parentId can be undefined or null
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
            // Single Select
            newSelection = new Set([item.id]);
            setLastSelectedId(item.id);
        }

        setSelectedIds(newSelection);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const rootItems = useMemo(() => commands.filter(c => !c.parentId), [commands]);

    // Custom collision strategy to support "File Explorer" feel:
    // - Middle 60% of Group -> Drop Into (Returns '-drop' ID)
    // - Edges (Top/Bottom 20%) -> Sort Next (Returns Sortable ID via closestCenter)
    const customCollisionStrategy: CollisionDetection = (args) => {
        // 1. Check direct pointer intersection first
        const pointerCollisions = pointerWithin(args);

        // 1. Priority: Insertion Lines (Top/Bottom) - Explicit ordering
        const insertionLine = pointerCollisions.find(c =>
            c.id.toString().endsWith('-top') ||
            c.id.toString().endsWith('-bottom')
        );

        if (insertionLine) {
            return [insertionLine];
        }

        // 2. Priority: Group Drop Zones (Drop Into)
        const dropZone = pointerCollisions.find(c =>
            c.id.toString().endsWith('-drop')
        );

        if (dropZone) {
            return [dropZone];
        }

        // 3. Fallback: Check if we are over Root Drop
        const rootDrop = pointerCollisions.find(c => c.id === 'root-drop');
        if (rootDrop) {
            return [rootDrop];
        }

        // 4. Fallback to standard sorting collision (closest center) for edges
        return closestCenter(args);
    };



    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return; // Note: active.id === over.id check is less relevant with alias IDs

        // Handle Root Drop explicitly
        if (over.id === 'root-drop') {
            const activeId = active.id.toString();
            const activeItem = commands.find(c => c.id === activeId);

            if (activeItem) {
                // Check name collision for Root (parentId: undefined)
                if (activeItem.parentId !== undefined) { // Only check if moving TO root
                    const hasCollision = commands.some(c =>
                        c.parentId === undefined && // Target is root
                        c.name === activeItem.name &&
                        c.id !== activeItem.id
                    );
                    if (hasCollision) {
                        showToast(`Operation cancelled: A command with name "${activeItem.name}" already exists in the root.`, 'warning');
                        return;
                    }
                }

                if (activeItem.parentId) {
                    // Moving out of group -> Root
                    updateEntity(activeItem.id, { parentId: undefined });
                } else {
                    // Already at root.
                    const oldIndex = commands.findIndex(c => c.id === activeId);
                    const newIndex = commands.length - 1;
                    if (oldIndex !== newIndex) {
                        setAllCommands(arrayMove(commands, oldIndex, newIndex));
                    }
                }
            }
            return;
        }

        // Resolve real IDs (handle -drop alias)
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

        // Determine target parent
        if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
            targetParentId = overItem.id;
        } else if (activeItem.parentId !== overItem.parentId) {
            // Cross-level drop
            targetParentId = overItem.parentId || undefined;
        } else {
            // Same level - check collision only if dragging to same level (redundant check but safe)
            // Actually if same level, name collision is impossible unless we are cloning.
            // But we are moving. So same name exists (itself).
            // We only check collision if parent changes.
        }

        // Check collision if parent changing
        if (targetParentId !== activeItem.parentId) {
            const hasCollision = commands.some(c =>
                c.parentId === targetParentId &&
                c.name === activeItem.name &&
                c.id !== activeItem.id
            );
            if (hasCollision) {
                showToast(`Operation cancelled: A command with name "${activeItem.name}" already exists in the destination.`, 'warning');
                return;
            }
        }

        // 1. Drop ON Group (via -drop zone) -> Reparent
        // Or strict strict check if we are treating it as parent
        if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
            updateEntity(activeItem.id, { parentId: overItem.id });
            return;
        }

        // 2. Cross-level Drop / Standard Sort
        if (activeItem.parentId !== overItem.parentId) {
            let newCommands = [...commands];
            const activeIndex = newCommands.findIndex(c => c.id === activeId);

            // Remove active item
            const [movedItem] = newCommands.splice(activeIndex, 1);

            // Set parentId to matched target
            movedItem.parentId = overItem.parentId;

            // Find new index
            // We need to find index relative to the FULL list
            const overIndex = newCommands.findIndex(c => c.id === overIdClean);

            let insertIndex = overIndex;
            if (isInsertBottom) {
                insertIndex = overIndex + 1;
            }

            newCommands.splice(insertIndex, 0, movedItem);
            setAllCommands(newCommands);
            return;
        }

        // 3. Sorting (Same level)
        const activeIndex = commands.findIndex(c => c.id === activeId);
        const overIndex = commands.findIndex(c => c.id === overIdClean);

        // Use manual splice to handle precise top/bottom insertion
        let newCommands = [...commands];
        const [movedItem] = newCommands.splice(activeIndex, 1);
        const newOverIndex = newCommands.findIndex(c => c.id === overIdClean);

        let insertIndex = newOverIndex;
        if (isInsertBottom) insertIndex++;

        if (!isInsertTop && !isInsertBottom) {
            // Fallback
            setAllCommands(arrayMove(commands, activeIndex, overIndex));
            return;
        }

        newCommands.splice(insertIndex, 0, movedItem);
        setAllCommands(newCommands);
    };

    const handleSend = async (cmd: CommandItem) => {
        // Empty check
        const isEmpty = !cmd.payload?.trim() && (!cmd.tokens || Object.keys(cmd.tokens).length === 0);
        if (isEmpty) return;

        console.log('handleSend called for:', cmd.name, cmd.payload);
        if (!activeSessionId) {
            console.warn('Send failed: No active session selected');
            return;
        }
        const session = sessions.find(s => s.id === activeSessionId);
        if (!session.isConnected) {
            console.log('Auto-Connect: Session is disconnected. Attempting to connect...', session.id);
            if (activeSessionId) {
                console.log('Auto-Connect: Calling connectSession for', activeSessionId);
                try {
                    // Try to connect
                    const success = await connectSession(activeSessionId);
                    console.log('Auto-Connect: connectSession result:', success);

                    if (success === true) {
                        console.log('Auto-Connect: Connection successful. Stying on page.');
                        // Success!
                        // return; // Wait, if success, we should proceed to send? 
                        // The original code returned here? 
                        // Original: "return;" -> effectively cancelling send after connect?
                        // "Stying on page" typo -> Staying on page.
                        // If logic was to just connect, then user has to click again?
                        // User request didn't mention this. I'll leave existing logic alone for now (it returns).
                        return;
                    } else {
                        console.warn('Auto-Connect: Connection failed (returned false). Navigating to config.');
                        if (onNavigate) onNavigate('serial');
                        return;
                    }
                } catch (e) {
                    console.error('Auto-Connect: Exception during connection attempt:', e);
                    if (onNavigate) onNavigate('serial');
                    return;
                }
            } else {
                console.warn('Auto-Connect: No active session ID. Navigating to config.');
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
                // MQTT
                await publishMqtt(session.id, 'command', data, { qos: 0, retain: false });
            } else {
                // Serial
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

        // Background Menu
        if (!item) {
            return [
                {
                    label: 'New Command',
                    icon: <FileText size={13} />,
                    onClick: () => addCommand({ name: generateUniqueName(commands, 'command', undefined), payload: '', mode: 'text', tokens: {}, parentId: undefined })
                },
                {
                    label: 'New Group',
                    icon: <FolderPlus size={13} />,
                    onClick: () => addGroup(generateUniqueName(commands, 'New Group', undefined))
                },
                { separator: true },
                {
                    label: 'Paste',
                    icon: <CornerDownLeft size={13} className="rotate-180" />, // Icon placeholder
                    onClick: () => handlePaste(undefined),
                    disabled: !clipboard
                }
            ];
        }

        // Item Context Menu
        const items: any[] = [
            {
                label: 'Edit',
                onClick: () => setEditingItem(item)
            },
            {
                label: 'Duplicate',
                icon: <Copy size={13} />,
                onClick: () => handleDuplicate(item)
            },
            {
                label: 'Copy',
                icon: <Copy size={13} />,
                onClick: () => handleCopy(item)
            },
            { separator: true },
            {
                label: 'Delete',
                icon: <Trash2 size={13} />,
                color: 'red',
                onClick: () => deleteEntity(item.id)
            }
        ];

        if (item.type === 'group') {
            // Add paste option for groups
            items.splice(3, 0, {
                label: 'Paste',
                onClick: () => handlePaste(item.id),
                disabled: !clipboard
            }, { separator: true });

            items.unshift({ separator: true });
            items.unshift({
                label: 'New Group',
                icon: <FolderPlus size={13} />,
                onClick: () => addGroup(generateUniqueName(commands, 'New Group', item.id))
            });
            items.unshift({
                label: 'New Command',
                icon: <FileText size={13} />,
                onClick: () => addCommand({ name: generateUniqueName(commands, 'command', item.id), payload: '', mode: 'text', tokens: {}, parentId: item.id })
            });
        }

        return items;
    };

    return (
        <div className="flex flex-col h-full bg-[#252526] text-[#cccccc]" onContextMenu={(e) => { e.preventDefault(); }}>
            {/* Header / Toolbar */}
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold bg-[#252526] border-b border-[#3c3c3c]">
                <span className="uppercase tracking-wide">Command Menu</span>
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
                                        onClick={() => { addGroup('New Group'); setShowMenu(false); }}>
                                        <FolderPlus size={14} /> New Group
                                    </div>
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { addCommand({ name: generateUniqueName(commands, 'command', undefined), payload: '', mode: 'text', tokens: {}, parentId: undefined }); setShowMenu(false); }}>
                                        <FileText size={14} /> New Command
                                    </div>
                                    <div className="h-[1px] bg-[#3c3c3c] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { importCommands(); setShowMenu(false); }}>
                                        <Upload size={14} /> Import...
                                    </div>
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { exportCommands(); setShowMenu(false); }}>
                                        <Upload size={14} className="rotate-180" /> Export
                                    </div>
                                    <div className="h-[1px] bg-[#3c3c3c] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2 text-red-400"
                                        onClick={() => { clearAll(); setShowMenu(false); }}>
                                        <Trash2 size={14} /> Clear All
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* List Content */}
            {/* We enable DndContext at this level so CommandScrollArea can define a valid Droppable */}
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
