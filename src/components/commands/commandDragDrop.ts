/**
 * commandDragDrop.ts
 * 命令列表拖放处理纯函数 — 从 useCommandListActions.ts 中提取。
 * 将 handleDragEnd 的复杂逻辑拆为 processRootDrop 和 processItemDrop 两个函数，
 * 它们只操作数据结构，不依赖 React 状态。
 */

import { arrayMove } from '@dnd-kit/sortable';
import { CommandEntity } from '../../types/command';

/** 拖放结果类型 */
export type DragResult =
    | { type: 'update'; id: string; updates: Partial<CommandEntity> }
    | { type: 'reorder'; newCommands: CommandEntity[] }
    | { type: 'conflict'; name: string }
    | { type: 'noop' };

/**
 * 处理拖放到根区域（root-drop）
 */
export function processRootDrop(
    commands: CommandEntity[],
    activeId: string
): DragResult {
    const activeItem = commands.find(c => c.id === activeId);
    if (!activeItem) return { type: 'noop' };

    // 检查重名冲突
    if (activeItem.parentId !== undefined) {
        const hasCollision = commands.some(c =>
            c.parentId === undefined &&
            c.name === activeItem.name &&
            c.id !== activeItem.id
        );
        if (hasCollision) return { type: 'conflict', name: activeItem.name };
    }

    if (activeItem.parentId) {
        return { type: 'update', id: activeItem.id, updates: { parentId: undefined } };
    } else {
        const oldIndex = commands.findIndex(c => c.id === activeId);
        const newIndex = commands.length - 1;
        if (oldIndex !== newIndex) {
            return { type: 'reorder', newCommands: arrayMove(commands, oldIndex, newIndex) };
        }
    }
    return { type: 'noop' };
}

/**
 * 处理拖放到具体项目/组（非 root-drop）
 */
export function processItemDrop(
    commands: CommandEntity[],
    activeId: string,
    overIdFull: string
): DragResult {
    const isDropInto = overIdFull.endsWith('-drop');
    const isInsertTop = overIdFull.endsWith('-top');
    const isInsertBottom = overIdFull.endsWith('-bottom');
    const overIdClean = overIdFull.replace(/-drop|-top|-bottom/, '');

    if (activeId === overIdClean) return { type: 'noop' };

    const activeItem = commands.find(c => c.id === activeId);
    const overItem = commands.find(c => c.id === overIdClean);
    if (!activeItem || !overItem) return { type: 'noop' };

    // 计算目标 parentId
    let targetParentId: string | undefined = undefined;
    if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
        targetParentId = overItem.id;
    } else if (activeItem.parentId !== overItem.parentId) {
        targetParentId = overItem.parentId || undefined;
    }

    // 检查重名冲突
    if (targetParentId !== activeItem.parentId) {
        const hasCollision = commands.some(c =>
            c.parentId === targetParentId &&
            c.name === activeItem.name &&
            c.id !== activeItem.id
        );
        if (hasCollision) return { type: 'conflict', name: activeItem.name };
    }

    // 拖入组
    if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
        return { type: 'update', id: activeItem.id, updates: { parentId: overItem.id } };
    }

    // 跨组移动
    if (activeItem.parentId !== overItem.parentId) {
        let newCommands = [...commands];
        const activeIndex = newCommands.findIndex(c => c.id === activeId);
        const [movedItem] = newCommands.splice(activeIndex, 1);
        movedItem.parentId = overItem.parentId;
        const overIndex = newCommands.findIndex(c => c.id === overIdClean);
        let insertIndex = overIndex;
        if (isInsertBottom) insertIndex = overIndex + 1;
        newCommands.splice(insertIndex, 0, movedItem);
        return { type: 'reorder', newCommands };
    }

    // 同组排序
    const activeIndex = commands.findIndex(c => c.id === activeId);
    const overIndex = commands.findIndex(c => c.id === overIdClean);

    if (!isInsertTop && !isInsertBottom) {
        return { type: 'reorder', newCommands: arrayMove(commands, activeIndex, overIndex) };
    }

    let newCommands = [...commands];
    const [movedItem] = newCommands.splice(activeIndex, 1);
    let insertIndex = newCommands.findIndex(c => c.id === overIdClean);
    if (isInsertBottom) insertIndex++;
    newCommands.splice(insertIndex, 0, movedItem);
    return { type: 'reorder', newCommands };
}
