/**
 * CommandListSidebar.tsx
 * 命令列表侧边栏 — 命令管理、拖放排序、右键菜单。
 *
 * 子模块：
 * - useCommandKeyboardActions.ts — 键盘快捷键和选择逻辑
 * - useCommandListActions.ts — 拖放和发送操作
 * - CommandScrollArea — 可滚动列表区域
 */
import { Plus, FolderPlus, Upload, Trash2, MoreHorizontal, FileText, Folder, Play, CornerDownLeft, Copy, CopyPlus, ClipboardPaste, Pencil } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCommandManager } from '../../hooks/useCommandManager';
import { CommandList } from './CommandList';
import { CommandEntity, CommandItem } from '../../types/command';
import { CommandEditorDialog } from './CommandEditorDialog';
import { useSession } from '../../context/SessionContext';
import { ContextMenu } from '../common/ContextMenu';
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { useToast } from '../../context/ToastContext';
import { generateUniqueName } from '../../utils/commandUtils';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { useCommandListActions } from './useCommandListActions';
import { useCommandKeyboardActions } from './useCommandKeyboardActions';

// ── 滚动列表区域 ──
const CommandScrollArea = ({
    items, onEdit, onSend, onContextMenu, canSend, selectedIds, onSelect, onClearSelection
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
                items={items} onEdit={onEdit} onSend={onSend}
                onContextMenu={onContextMenu} dropIndicator={null}
                canSend={canSend} selectedIds={selectedIds} onSelect={onSelect}
            />
            {showLine && (
                <div className="mx-1 mt-0.5 h-[2px] bg-[var(--st-command-drop-indicator)] shadow-[0_0_4px_var(--st-command-drop-indicator)] rounded-full" />
            )}
            {items.length === 0 && !showLine && (
                <div className="p-4 text-center text-[13px] text-[var(--st-command-empty-text)] opacity-60">
                    {t('command.noCommands')}<br />{t('command.noCommandsHint')}
                </div>
            )}
        </div>
    );
};

// ── 主组件 ──
const CommandListSidebarContent = ({ onNavigate }: { onNavigate?: (view: string) => void }) => {
    const {
        commands, addGroup, addCommand, clearAll, importCommands, exportCommands,
        setAllCommands, deleteEntity, deleteEntities, updateEntity, duplicateEntity, duplicateEntities,
        undo, redo, canUndo, canRedo
    } = useCommandManager();
    const { showToast } = useToast();
    const { t } = useI18n();
    const { activeSessionId } = useSession();

    const [showMenu, setShowMenu] = useState(false);
    const [editingItem, setEditingItem] = useState<CommandEntity | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: CommandEntity | null } | null>(null);

    // ── 键盘快捷键和选择逻辑（委托给 Hook） ──
    const {
        selectedIds, clipboard, containerRef, handleItemClick, clearSelection, setClipboard, handlePaste
    } = useCommandKeyboardActions({
        commands, undo, redo, canUndo, canRedo, deleteEntities, duplicateEntities
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );
    const rootItems = useMemo(() => commands.filter(c => !c.parentId), [commands]);

    // ── 拖放和发送（委托给 Hook） ──
    const { customCollisionStrategy, handleDragEnd, handleSend } = useCommandListActions({
        commands, setAllCommands, updateEntity, onNavigate,
    });

    // ── 右键菜单 ──
    const handleContextMenu = (e: React.MouseEvent, item?: CommandEntity) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item: item || null });
    };

    const getMenuItems = () => {
        if (!contextMenu) return [];
        const { item } = contextMenu;

        if (!item) {
            return [
                { label: t('command.newCommand'), icon: <FileText size={13} />, onClick: () => addCommand({ name: generateUniqueName(commands, t('command.newCommand'), undefined), payload: '', mode: 'text', tokens: {}, parentId: undefined }) },
                { label: t('command.newGroup'), icon: <FolderPlus size={13} />, onClick: () => addGroup(generateUniqueName(commands, t('command.newGroup'), undefined)) },
                { separator: true },
                { label: t('common.paste'), icon: <CornerDownLeft size={13} className="rotate-180" />, onClick: () => handlePaste(undefined), disabled: clipboard.length === 0 }
            ];
        }

        const items: any[] = [
            { label: t('common.edit'), icon: <Pencil size={13} />, onClick: () => setEditingItem(item) },
            { label: t('common.duplicate'), icon: <CopyPlus size={13} />, onClick: () => duplicateEntity(item.id, item.parentId || undefined) },
            { label: t('common.copy'), icon: <Copy size={13} />, onClick: () => setClipboard([item]) },
            { separator: true },
            { label: t('common.delete'), icon: <Trash2 size={13} />, color: 'red', onClick: () => deleteEntity(item.id) }
        ];

        if (item.type === 'group') {
            items.splice(3, 0, { label: t('common.paste'), icon: <ClipboardPaste size={13} />, onClick: () => handlePaste(item.id), disabled: clipboard.length === 0 });
            items.unshift({ separator: true });
            items.unshift({ label: t('command.newGroup'), icon: <FolderPlus size={13} />, onClick: () => addGroup(generateUniqueName(commands, t('command.newGroup'), item.id)) });
            items.unshift({ label: t('command.newCommand'), icon: <FileText size={13} />, onClick: () => addCommand({ name: generateUniqueName(commands, t('command.newCommand'), item.id), payload: '', mode: 'text', tokens: {}, parentId: item.id }) });
        }

        return items;
    };

    return (
        <div ref={containerRef} className="flex flex-col h-full bg-[var(--command-sidebar-bg)] text-[var(--command-sidebar-text)]" onContextMenu={(e) => { e.preventDefault(); }} data-component="command-sidebar">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold bg-[var(--command-sidebar-bg)] border-b border-[var(--command-sidebar-border)]">
                <span className="uppercase tracking-wide">{t('command.commandMenu')}</span>
                <div className="flex items-center gap-1 relative">
                    <Tooltip content={t('command.menu')} position="bottom">
                        <button className="p-1 hover:bg-[var(--list-hover-background)] rounded text-[var(--st-sidebar-text)]" onClick={() => setShowMenu(!showMenu)}>
                            <MoreHorizontal size={14} />
                        </button>
                    </Tooltip>

                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-[var(--menu-background)] border border-[var(--menu-border-color)] shadow-lg rounded-sm z-50 text-[13px]">
                                <div className="py-1">
                                    <div className="px-3 py-1.5 hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer flex items-center gap-2" onClick={() => { addGroup(generateUniqueName(commands, t('command.newGroup'), undefined)); setShowMenu(false); }}><FolderPlus size={14} /> {t('command.newGroup')}</div>
                                    <div className="px-3 py-1.5 hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer flex items-center gap-2" onClick={() => { addCommand({ name: generateUniqueName(commands, t('command.newCommand'), undefined), payload: '', mode: 'text', tokens: {}, parentId: undefined }); setShowMenu(false); }}><FileText size={14} /> {t('command.newCommand')}</div>
                                    <div className="h-[1px] bg-[var(--menu-border-color)] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer flex items-center gap-2" onClick={() => { importCommands(); setShowMenu(false); }}><Upload size={14} /> {t('command.import')}</div>
                                    <div className="px-3 py-1.5 hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer flex items-center gap-2" onClick={() => { exportCommands(); setShowMenu(false); }}><Upload size={14} className="rotate-180" /> {t('command.export')}</div>
                                    <div className="h-[1px] bg-[var(--menu-border-color)] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer flex items-center gap-2 text-[var(--st-error-text)]" onClick={() => { clearAll(); setShowMenu(false); }}><Trash2 size={14} /> {t('command.clearAll')}</div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
                <DndContext sensors={sensors} collisionDetection={customCollisionStrategy} onDragEnd={handleDragEnd}>
                    <CommandScrollArea
                        items={rootItems} onEdit={setEditingItem}
                        onSend={(cmd) => handleSend(cmd as CommandItem)}
                        onContextMenu={handleContextMenu} canSend={!!activeSessionId}
                        selectedIds={selectedIds} onSelect={handleItemClick}
                        onClearSelection={clearSelection}
                    />
                </DndContext>
            </div>

            {editingItem && (
                <CommandEditorDialog
                    item={editingItem} onClose={() => setEditingItem(null)}
                    onSave={(updates) => { updateEntity(editingItem.id, updates); setEditingItem(null); }}
                    existingNames={commands.filter(c => c.parentId === editingItem.parentId && c.id !== editingItem.id).map(c => c.name)}
                />
            )}

            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} items={getMenuItems()} onClose={() => setContextMenu(null)} />
            )}
        </div>
    );
};

export const CommandListSidebar = ({ onNavigate }: { onNavigate?: (view: string) => void }) => {
    return (
        <CommandListSidebarContent onNavigate={onNavigate} />
    );
};
