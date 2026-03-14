/**
 * editorLayoutActions.ts
 * 编辑器布局树变更操作 — 纯函数，操作 LayoutNode 树结构。
 * 从 useEditorLayout.ts 中拆分出来，以降低 Hook 的复杂度。
 */
import {
    Direction,
    SplitNode,
    LeafNode,
    LayoutNode,
    findNode,
    findParent,
    getAllLeaves,
    normalizeTree,
} from './editorLayoutTypes';

/** 默认空布局 */
const DEFAULT_LEAF: LeafNode = { type: 'leaf', id: 'group-0', views: [], activeViewId: null };

/** 深克隆布局树 */
function clone<T>(node: T): T {
    return JSON.parse(JSON.stringify(node));
}

// ── openSession ──
export function applyOpenSession(
    prev: LayoutNode | null,
    sessionId: string,
    targetGroupId: string,
): { layout: LayoutNode; fallbackGroupId?: string } {
    if (!prev) {
        return {
            layout: { type: 'leaf', id: 'group-0', views: [sessionId], activeViewId: sessionId },
            fallbackGroupId: 'group-0',
        };
    }

    const tree = clone(prev);
    const targetNode = findNode(tree, targetGroupId) as LeafNode;

    if (targetNode && targetNode.type === 'leaf') {
        if (!targetNode.views.includes(sessionId)) {
            targetNode.views.push(sessionId);
        }
        targetNode.activeViewId = sessionId;
        return { layout: tree };
    }

    // Fallback：使用第一个叶节点
    const leaves = getAllLeaves(tree);
    if (leaves.length > 0) {
        const first = leaves[0];
        if (!first.views.includes(sessionId)) first.views.push(sessionId);
        first.activeViewId = sessionId;
        return { layout: tree, fallbackGroupId: first.id };
    }

    return { layout: tree };
}

// ── closeView ──
export function applyCloseView(
    prev: LayoutNode | null,
    groupId: string,
    sessionId: string,
): LayoutNode {
    if (!prev) return DEFAULT_LEAF;

    const tree = clone(prev);
    const group = findNode(tree, groupId);

    if (group && group.type === 'leaf') {
        group.views = group.views.filter(v => v !== sessionId);
        if (group.activeViewId === sessionId) {
            group.activeViewId = group.views.length > 0 ? group.views[group.views.length - 1] : null;
        }

        // 自动关闭空分组（如果不是最后一个）
        if (group.views.length === 0) {
            const totalLeaves = getAllLeaves(tree);
            if (totalLeaves.length > 1) {
                const parentInfo = findParent(tree, groupId);
                if (parentInfo) {
                    parentInfo.parent.children.splice(parentInfo.index, 1);
                }
            }
        }
    }

    return normalizeTree(tree) || DEFAULT_LEAF;
}

// ── splitGroup ──
export function applySplitGroup(
    prev: LayoutNode | null,
    sourceGroupId: string,
    direction: Direction,
): LayoutNode | null {
    if (!prev) return prev;
    const tree = clone(prev);

    // 根节点即源节点且是叶节点
    if (tree.id === sourceGroupId && tree.type === 'leaf') {
        const newGroup: LeafNode = {
            type: 'leaf',
            id: `group-${Date.now()}`,
            views: tree.activeViewId ? [tree.activeViewId] : [],
            activeViewId: tree.activeViewId
        };
        return {
            type: 'split',
            id: `split-${Date.now()}`,
            direction,
            children: [tree, newGroup]
        };
    }

    const parentInfo = findParent(tree, sourceGroupId);
    if (parentInfo) {
        const { parent, index } = parentInfo;
        const sourceNode = parent.children[index] as LeafNode;
        const newGroup: LeafNode = {
            type: 'leaf',
            id: `group-${Date.now()}`,
            views: sourceNode.activeViewId ? [sourceNode.activeViewId] : [],
            activeViewId: sourceNode.activeViewId
        };

        if (parent.direction === direction) {
            parent.children.splice(index + 1, 0, newGroup);
        } else {
            const newSplit: SplitNode = {
                type: 'split',
                id: `split-${Date.now()}`,
                direction,
                children: [sourceNode, newGroup]
            };
            parent.children[index] = newSplit;
        }
    }

    return tree;
}

// ── moveView ──
export function applyMoveView(
    prev: LayoutNode | null,
    fromGroupId: string,
    toGroupId: string,
    sessionId: string,
    newIndex?: number,
    allowAutoClose: boolean = true,
): LayoutNode | null {
    if (!prev) return prev;
    const tree = clone(prev);

    const fromGroup = findNode(tree, fromGroupId) as LeafNode;
    const toGroup = findNode(tree, toGroupId) as LeafNode;
    if (!fromGroup || !toGroup) return prev;

    // 从源移除
    if (fromGroup.views.includes(sessionId)) {
        fromGroup.views = fromGroup.views.filter(v => v !== sessionId);
        if (fromGroup.activeViewId === sessionId) {
            fromGroup.activeViewId = fromGroup.views.length > 0 ? fromGroup.views[fromGroup.views.length - 1] : null;
        }
    }

    // 添加到目标
    if (toGroup.views.includes(sessionId)) {
        toGroup.views = toGroup.views.filter(v => v !== sessionId);
    }
    const safeIndex = newIndex !== undefined ? newIndex : toGroup.views.length;
    toGroup.views.splice(safeIndex, 0, sessionId);
    toGroup.activeViewId = sessionId;

    // 源分组为空时自动关闭
    if (allowAutoClose && fromGroup.views.length === 0 && fromGroup.id !== toGroup.id) {
        const total = getAllLeaves(tree);
        if (total.length > 1) {
            const p = findParent(tree, fromGroup.id);
            if (p) p.parent.children.splice(p.index, 1);
        }
    }

    return normalizeTree(tree) || prev;
}

// ── splitDrop ──
export function applySplitDrop(
    prev: LayoutNode | null,
    sourceGroupId: string,
    targetGroupId: string,
    sessionId: string,
    edge: 'top' | 'bottom' | 'left' | 'right',
): LayoutNode | null {
    if (!prev) return prev;
    const tree = clone(prev);

    // 1. 从源移除
    const fromGroup = findNode(tree, sourceGroupId) as LeafNode;
    if (!fromGroup) return prev;

    fromGroup.views = fromGroup.views.filter(v => v !== sessionId);
    if (fromGroup.activeViewId === sessionId) {
        fromGroup.activeViewId = fromGroup.views.length > 0 ? fromGroup.views[fromGroup.views.length - 1] : null;
    }

    // 2. 在目标处分屏
    const toGroup = findNode(tree, targetGroupId) as LeafNode;
    if (!toGroup) return prev;

    const direction: Direction = (edge === 'top' || edge === 'bottom') ? 'vertical' : 'horizontal';

    const newGroup: LeafNode = {
        type: 'leaf',
        id: `group-${Date.now()}`,
        views: [sessionId],
        activeViewId: sessionId
    };

    const children = (edge === 'top' || edge === 'left') ? [newGroup, toGroup] : [toGroup, newGroup];

    const parentInfo = findParent(tree, targetGroupId);
    if (parentInfo) {
        const { parent, index } = parentInfo;
        if (parent.direction === direction) {
            const insertIndex = (edge === 'top' || edge === 'left') ? index : index + 1;
            parent.children.splice(insertIndex, 0, newGroup);
        } else {
            const newSplit: SplitNode = {
                type: 'split',
                id: `split-${Date.now()}`,
                direction,
                children
            };
            parent.children[index] = newSplit;
        }
    } else {
        // 根节点即目标
        const newSplit: SplitNode = {
            type: 'split',
            id: `split-${Date.now()}`,
            direction,
            children
        };
        // 源分组为空时的清理
        if (fromGroup.views.length === 0 && fromGroup.id !== newGroup.id && fromGroup.id !== toGroup.id) {
            // fromGroup 在新的 split 外部，不做处理
        }
        return newSplit;
    }

    // 源分组为空时自动关闭
    if (fromGroup.views.length === 0 && fromGroup.id !== newGroup.id && fromGroup.id !== toGroup.id) {
        const p = findParent(tree, fromGroup.id);
        if (p) {
            p.parent.children.splice(p.index, 1);
        }
    }

    return normalizeTree(tree) || tree;
}
