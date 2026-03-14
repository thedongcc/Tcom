/**
 * editorDragDropHelpers.ts
 * 编辑器拖放处理辅助函数 — 从 useEditorDragDrop.ts 中提取。
 * 将 DragOver/DragEnd 的决策逻辑拆为纯函数。
 */
import { parseCompositeId } from './EditorTabComponents';
import { LayoutNode, LeafNode, findNode } from '../../hooks/useEditorLayout';

/** 拖放指示器 */
export interface DropIndicatorInfo {
    groupId: string;
    index: number;
}

/**
 * DragOver 时计算 DropIndicator 位置
 */
export function computeDropIndicator(
    layout: LayoutNode | null,
    overId: string,
    overRect: any,
    clientX: number | undefined,
    deltaX: number
): DropIndicatorInfo | null {
    // Case A: 拖放到 Tab 上（Composite ID）
    const overParsed = parseCompositeId(overId);
    if (overParsed) {
        const targetNode = findNode(layout, overParsed.groupId) as LeafNode;
        if (targetNode && overRect) {
            const hoverIndex = targetNode.views.indexOf(overParsed.sessionId);
            let insertIndex = hoverIndex;
            if (clientX !== undefined) {
                const actualX = clientX + deltaX;
                const midpoint = overRect.left + (overRect.width / 2);
                if (actualX > midpoint) insertIndex = hoverIndex + 1;
            }
            return { groupId: overParsed.groupId, index: insertIndex };
        }
        return null;
    }

    // Case B: 拖放到 DropZone（center/header/start）
    if (overId.includes('-center') || overId.includes('-header') || overId.includes('-start')) {
        const gId = overId.replace('-center', '').replace('-header', '').replace('-start', '');
        const targetNode = findNode(layout, gId) as LeafNode;
        if (!targetNode) return null;

        if (overId.includes('-start')) {
            return { groupId: gId, index: 0 };
        }
        if (overId.includes('-header')) {
            let insertIndex = targetNode.views.length;
            if (clientX !== undefined && overRect) {
                const actualX = clientX + deltaX;
                if (actualX < overRect.left + 60) insertIndex = 0;
            }
            return { groupId: gId, index: insertIndex };
        }
        return { groupId: gId, index: targetNode.views.length };
    }

    return null;
}

/** DragEnd 动作类型 */
export type DragEndAction =
    | { type: 'move'; sourceGroupId: string; targetGroupId: string; sessionId: string; index: number }
    | { type: 'split'; sourceGroupId: string; targetGroupId: string; sessionId: string; zone: string }
    | { type: 'noop' };

/**
 * DragEnd 时计算需要执行的动作
 */
export function computeDragEndAction(
    layout: LayoutNode | null,
    activeId: string,
    overId: string,
    overRect: any,
    clientX: number | undefined,
    deltaX: number
): DragEndAction {
    const activeParsed = parseCompositeId(activeId);
    if (!activeParsed) return { type: 'noop' };
    const { groupId: sourceGroupId, sessionId: activeSessionId } = activeParsed;

    // DropZone（top/bottom/left/right/center/header/start）
    if (overId.includes('-') && !overId.includes('::')) {
        const parts = overId.split('-');
        const zone = parts.pop()!;
        const targetGroupId = parts.join('-');

        if (zone === 'center' || zone === 'header' || zone === 'start') {
            const targetNode = findNode(layout, targetGroupId) as LeafNode;
            let idx = targetNode ? targetNode.views.length : 0;

            if (zone === 'start') {
                idx = 0;
            } else if (zone === 'header' && targetNode) {
                if (clientX !== undefined && overRect) {
                    const actualX = clientX + deltaX;
                    if (actualX < overRect.left + 60) idx = 0;
                }
            }

            return { type: 'move', sourceGroupId, targetGroupId, sessionId: activeSessionId, index: idx };
        }

        if (['top', 'bottom', 'left', 'right'].includes(zone)) {
            return { type: 'split', sourceGroupId, targetGroupId, sessionId: activeSessionId, zone };
        }
        return { type: 'noop' };
    }

    // 拖放到 Tab 上
    const overParsed = parseCompositeId(overId);
    if (overParsed) {
        const targetNode = findNode(layout, overParsed.groupId) as LeafNode;
        if (targetNode) {
            let targetIndex = targetNode.views.indexOf(overParsed.sessionId);
            if (clientX !== undefined && overRect) {
                const actualX = clientX + deltaX;
                const midpoint = overRect.left + (overRect.width / 2);
                if (actualX > midpoint) targetIndex += 1;
            }
            return { type: 'move', sourceGroupId, targetGroupId: overParsed.groupId, sessionId: activeSessionId, index: targetIndex };
        }
    }

    return { type: 'noop' };
}
