/**
 * useCommandKeyboardActions.ts
 * 命令列表键盘快捷键和选择逻辑 — 从 CommandListSidebar.tsx 中提取。
 * 管理 Ctrl+Z 撤消/重做、Ctrl+C/V 复制粘贴、Delete 删除、
 * Shift/Ctrl 多选以及焦点追踪。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { CommandEntity } from '../../types/command';

interface UseCommandKeyboardActionsParams {
    commands: CommandEntity[];
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    deleteEntities: (ids: string[]) => void;
    duplicateEntities: (ids: string[], newParentId?: string) => void;
}

/**
 * 获取展开状态下的所有可见命令项（扁平化递归）
 */
function getVisibleItems(commands: CommandEntity[], parentId?: string | null): CommandEntity[] {
    const effectiveParentId = parentId === undefined ? null : parentId;
    const children = commands.filter(c => c.parentId === effectiveParentId || (effectiveParentId === null && !c.parentId));
    let flat: CommandEntity[] = [];
    for (const child of children) {
        flat.push(child);
        if (child.type === 'group' && (child.isOpen ?? true)) {
            flat = [...flat, ...getVisibleItems(commands, child.id)];
        }
    }
    return flat;
}

/**
 * 判断当前是否处于可快捷键操作的焦点状态
 */
function isShortcutBlocked(): boolean {
    const activeEl = document.activeElement;
    const isInput = ['INPUT', 'TEXTAREA'].includes(activeEl?.tagName || '');
    const isEditable = activeEl?.getAttribute('contenteditable') === 'true';
    const hasModal = !!document.querySelector('.fixed.z-50') || !!document.querySelector('dialog[open]');
    return isInput || isEditable || hasModal;
}

export function useCommandKeyboardActions({
    commands, undo, redo, deleteEntities, duplicateEntities
}: UseCommandKeyboardActionsParams) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<CommandEntity[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const isFocused = useRef(false);

    // ── 复制选中项 ──
    const handleCopy = useCallback(() => {
        if (selectedIds.size > 0) {
            const selected = commands.filter(c => selectedIds.has(c.id));
            const topLevel = selected.filter(c => !selectedIds.has(c.parentId || ''));
            if (topLevel.length > 0) setClipboard(topLevel);
        } else if (lastSelectedId) {
            const item = commands.find(c => c.id === lastSelectedId);
            if (item) setClipboard([item]);
        }
    }, [commands, selectedIds, lastSelectedId]);

    // ── 粘贴 ──
    const handlePasteAction = useCallback(() => {
        if (clipboard.length === 0) return;
        let targetId: string | undefined;
        if (lastSelectedId) {
            const sel = commands.find(c => c.id === lastSelectedId);
            targetId = sel?.type === 'group' ? sel.id : (sel?.parentId || undefined);
        }
        duplicateEntities(clipboard.map(i => i.id), targetId);
    }, [clipboard, lastSelectedId, commands, duplicateEntities]);

    // ── 删除选中项 ──
    const handleDelete = useCallback(() => {
        if (selectedIds.size > 0) {
            deleteEntities(Array.from(selectedIds));
            setSelectedIds(new Set());
        }
    }, [selectedIds, deleteEntities]);

    // ── 键盘快捷键 ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isFocused.current || isShortcutBlocked()) return;
            const mod = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
            if (mod && key === 'y') { e.preventDefault(); redo(); return; }
            if (mod && key === 'c') { e.preventDefault(); handleCopy(); return; }
            if (mod && key === 'v') { e.preventDefault(); handlePasteAction(); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
        };

        // 点击命令菜单外部时清除选择
        const handleMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                isFocused.current = false;
                setSelectedIds(new Set());
                setLastSelectedId(null);
            } else {
                isFocused.current = true;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mousedown', handleMouseDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleMouseDown);
        };
    }, [handleCopy, handlePasteAction, handleDelete, undo, redo]);

    // ── 项目点击选择（支持 Ctrl/Shift 多选） ──
    const handleItemClick = useCallback((e: React.MouseEvent, item: CommandEntity) => {
        e.stopPropagation();
        let newSelection = new Set(selectedIds);

        if (e.ctrlKey || e.metaKey) {
            // Ctrl 切换选中
            if (newSelection.has(item.id)) {
                newSelection.delete(item.id);
            } else {
                newSelection.add(item.id);
                setLastSelectedId(item.id);
            }
        } else if (e.shiftKey && lastSelectedId) {
            // Shift 范围选中
            const visibleItems = getVisibleItems(commands);
            const startIndex = visibleItems.findIndex(i => i.id === lastSelectedId);
            const endIndex = visibleItems.findIndex(i => i.id === item.id);

            if (startIndex !== -1 && endIndex !== -1) {
                const start = Math.min(startIndex, endIndex);
                const end = Math.max(startIndex, endIndex);
                visibleItems.slice(start, end + 1).forEach(i => newSelection.add(i.id));
            }
        } else {
            // 单击选中
            newSelection = new Set([item.id]);
            setLastSelectedId(item.id);
        }

        setSelectedIds(newSelection);
    }, [selectedIds, lastSelectedId, commands]);

    // ── 清除选择 ──
    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setLastSelectedId(null);
    }, []);

    return {
        selectedIds,
        lastSelectedId,
        clipboard,
        containerRef,
        handleItemClick,
        clearSelection,
        setClipboard,
        handlePaste: (targetParentId?: string) => {
            if (clipboard.length === 0) return;
            duplicateEntities(clipboard.map(i => i.id), targetParentId);
        },
    };
}
