import { useState, useCallback, useEffect } from 'react';
import {
    Direction,
    SplitNode,
    LeafNode,
    LayoutNode,
    EditorLayoutState,
    findNode,
    findParent,
    getAllLeaves,
    normalizeTree,
} from './editorLayoutTypes';

// 重新导出类型，确保外部引用不断
export type { Direction, SplitNode, LeafNode, LayoutNode, EditorLayoutState };
export { findNode };


export const useEditorLayout = () => {
    const [layout, setLayout] = useState<LayoutNode | null>({
        type: 'leaf',
        id: 'group-0',
        views: [],
        activeViewId: null
    });
    const [activeGroupId, setActiveGroupId] = useState<string>('group-0');

    // -- Persistence --
    const [persistenceKey, setPersistenceKey] = useState<string | null>(null);

    // Load from local storage when key changes
    useEffect(() => {
        if (!persistenceKey) return;

        try {
            const saved = localStorage.getItem(`editor-layout-${persistenceKey}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.root && parsed.activeGroupId) {
                    setLayout(parsed.root);
                    setActiveGroupId(parsed.activeGroupId);
                }
            }
        } catch (e) {
            console.error('Failed to load layout:', e);
        }
    }, [persistenceKey]);

    // Save to local storage when layout changes
    useEffect(() => {
        if (!persistenceKey || !layout) return;

        const state: EditorLayoutState = { root: layout, activeGroupId };
        try {
            localStorage.setItem(`editor-layout-${persistenceKey}`, JSON.stringify(state));
        } catch (e) {
            console.error('Failed to save layout:', e);
        }
    }, [layout, activeGroupId, persistenceKey]);

    const setPersistenceKeyFn = useCallback((key: string | null) => {
        setPersistenceKey(key);
    }, []);

    // -- Actions --

    const openSession = useCallback((sessionId: string, groupId?: string) => {
        setLayout(prev => {
            if (!prev) {
                // Should not happen if we init with one group, but handle recovery
                return { type: 'leaf', id: 'group-0', views: [sessionId], activeViewId: sessionId };
            }

            const targetId = groupId || activeGroupId;

            // Deep clone for mutation (or use immer in future)
            const clone = JSON.parse(JSON.stringify(prev)) as LayoutNode;

            const targetNode = findNode(clone, targetId) as LeafNode;
            if (targetNode && targetNode.type === 'leaf') {
                if (!targetNode.views.includes(sessionId)) {
                    targetNode.views.push(sessionId);
                }
                targetNode.activeViewId = sessionId;
            } else {
                // Fallback: Use first leaf
                const leaves = getAllLeaves(clone);
                if (leaves.length > 0) {
                    const first = leaves[0];
                    if (!first.views.includes(sessionId)) first.views.push(sessionId);
                    first.activeViewId = sessionId;
                    if (!groupId) setActiveGroupId(first.id);
                }
            }
            return clone;
        });
        if (groupId) setActiveGroupId(groupId);
    }, [activeGroupId]);

    const closeView = useCallback((groupId: string, sessionId: string) => {
        setLayout(prev => {
            if (!prev) return null;
            const clone = JSON.parse(JSON.stringify(prev)) as LayoutNode;
            const group = findNode(clone, groupId);

            if (group && group.type === 'leaf') {
                group.views = group.views.filter(v => v !== sessionId);
                if (group.activeViewId === sessionId) {
                    group.activeViewId = group.views.length > 0 ? group.views[group.views.length - 1] : null;
                }

                // Auto-close empty group if it's not the last one
                if (group.views.length === 0) {
                    // Check if total groups > 1
                    const totalLeaves = getAllLeaves(clone);
                    if (totalLeaves.length > 1) {
                        // Remove this node
                        // This is tricky without parent pointer in simple tree. 
                        // Easier: Re-traverse or use findParent helper.
                        // But we are mutating logic inside a clone.
                        // We'll normalize after providing a way to mark "deleted" or just run a clean pass.
                        // Actually, let's strictly remove it if we can find parent.
                        const parentInfo = findParent(clone, groupId);
                        if (parentInfo) {
                            parentInfo.parent.children.splice(parentInfo.index, 1);
                            // Normalize will handle collapsing
                        } else {
                            // It's root and empty? keep it valid but empty
                        }
                    }
                }
            }

            return normalizeTree(clone) || { type: 'leaf', id: 'group-0', views: [], activeViewId: null };
        });
    }, []);

    const splitGroup = useCallback((sourceGroupId: string, direction: Direction) => {
        setLayout(prev => {
            if (!prev) return prev;
            const clone = JSON.parse(JSON.stringify(prev)) as LayoutNode;

            // If root is the source and it's a leaf, easy swap
            if (clone.id === sourceGroupId && clone.type === 'leaf') {
                const newGroup: LeafNode = {
                    type: 'leaf',
                    id: `group-${Date.now()}`,
                    views: clone.activeViewId ? [clone.activeViewId] : [],
                    activeViewId: clone.activeViewId
                };
                return {
                    type: 'split',
                    id: `split-${Date.now()}`,
                    direction,
                    children: [clone, newGroup]
                };
            }

            // Find parent
            const parentInfo = findParent(clone, sourceGroupId);
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
                    // Same direction, just add sibling
                    parent.children.splice(index + 1, 0, newGroup);
                } else {
                    // Different direction, replace node with split
                    const newSplit: SplitNode = {
                        type: 'split',
                        id: `split-${Date.now()}`,
                        direction,
                        children: [sourceNode, newGroup]
                    };
                    parent.children[index] = newSplit;
                }
            }

            return clone;
        });
    }, []);

    // const closeGroup = ... // Implemented via closeView auto-cleaning or explicit button

    // Move view logic for Drag and Drop
    const moveView = useCallback((fromGroupId: string, toGroupId: string, sessionId: string, newIndex?: number, allowAutoClose: boolean = true) => {
        setLayout(prev => {
            if (!prev) return prev;
            const clone = JSON.parse(JSON.stringify(prev)) as LayoutNode;

            const fromGroup = findNode(clone, fromGroupId) as LeafNode;
            const toGroup = findNode(clone, toGroupId) as LeafNode;

            if (!fromGroup || !toGroup) return prev;

            // Remove from source
            if (fromGroup.views.includes(sessionId)) {
                fromGroup.views = fromGroup.views.filter(v => v !== sessionId);
                if (fromGroup.activeViewId === sessionId) {
                    fromGroup.activeViewId = fromGroup.views.length > 0 ? fromGroup.views[fromGroup.views.length - 1] : null;
                }
            }

            // Add to target
            // Check if exists
            if (toGroup.views.includes(sessionId)) {
                // Already exists, just move index
                toGroup.views = toGroup.views.filter(v => v !== sessionId);
            }

            const safeIndex = newIndex !== undefined ? newIndex : toGroup.views.length;
            toGroup.views.splice(safeIndex, 0, sessionId);
            toGroup.activeViewId = sessionId;

            // Check if source group became empty -> auto close
            if (allowAutoClose && fromGroup.views.length === 0 && fromGroup.id !== toGroup.id) {
                const total = getAllLeaves(clone);
                if (total.length > 1) {
                    const p = findParent(clone, fromGroup.id);
                    if (p) p.parent.children.splice(p.index, 1);
                }
            }

            return normalizeTree(clone) || prev;
        });
        setActiveGroupId(toGroupId);
    }, []);

    // New action: Drop to Edge (Split)
    const splitDrop = useCallback((sourceGroupId: string, targetGroupId: string, sessionId: string, edge: 'top' | 'bottom' | 'left' | 'right') => {
        setLayout(prev => {
            if (!prev) return prev;
            const clone = JSON.parse(JSON.stringify(prev)) as LayoutNode;

            // 1. Remove from source
            const fromGroup = findNode(clone, sourceGroupId) as LeafNode;
            if (!fromGroup) return prev;

            fromGroup.views = fromGroup.views.filter(v => v !== sessionId);
            if (fromGroup.activeViewId === sessionId) {
                fromGroup.activeViewId = fromGroup.views.length > 0 ? fromGroup.views[fromGroup.views.length - 1] : null;
            }
            // Auto close source if empty later

            // 2. Wrap target in split
            const toGroup = findNode(clone, targetGroupId) as LeafNode;
            if (!toGroup) return prev; // Should not happen

            // STANDARD semantics (final attempt):
            // 'vertical' = vertical arrangement (top/bottom), 'horizontal' = horizontal arrangement (left/right)
            const direction: Direction = (edge === 'top' || edge === 'bottom') ? 'vertical' : 'horizontal';

            // New Group
            const newGroup: LeafNode = {
                type: 'leaf',
                id: `group-${Date.now()}`,
                views: [sessionId],
                activeViewId: sessionId
            };

            // Order: Top/Left -> [New, Old], Bottom/Right -> [Old, New]
            const children = (edge === 'top' || edge === 'left') ? [newGroup, toGroup] : [toGroup, newGroup];

            // Replace toGroup with newSplit
            // We need parent of toGroup
            const parentInfo = findParent(clone, targetGroupId);
            if (parentInfo) {
                const { parent, index } = parentInfo;
                if (parent.direction === direction) {
                    // Same direction, inject neighbor
                    const insertIndex = (edge === 'top' || edge === 'left') ? index : index + 1;
                    parent.children.splice(insertIndex, 0, newGroup);
                } else {
                    // Different direction, wrap
                    const newSplit: SplitNode = {
                        type: 'split',
                        id: `split-${Date.now()}`,
                        direction,
                        children
                    };
                    parent.children[index] = newSplit;
                }
            } else {
                // Root is the toGroup
                const newSplit: SplitNode = {
                    type: 'split',
                    id: `split-${Date.now()}`,
                    direction,
                    children
                };
                // We are replacing root, so return new root
                // Check source empty removal
                if (fromGroup.views.length === 0 && fromGroup.id !== newGroup.id && fromGroup.id !== toGroup.id) {
                    // Source was somewhere deep? Wait, if we replaced root, fromGroup is inside it? 
                    // No, "clone" is the Draft. We modified "clone" in place.
                    // But if we return newSplit, we lose changes to fromGroup if fromGroup was outside toGroup (which is impossible if toGroup was Root).
                    // If toGroup is Root, then fromGroup MUST be toGroup (Drag from self to edge? edge case).

                    // If toGroup is Root, and fromGroup != toGroup, impossible unless multiple roots? No.
                    // So if toGroup is Root, fromGroup IS toGroup.
                    // So we took the last tab of root and split it? 
                    // In that case fromGroup (which is toGroup) views are updated.
                }
                return newSplit;
            }

            // Check if source group became empty -> auto close (if it wasn't destroyed by split logic?)
            if (fromGroup.views.length === 0 && fromGroup.id !== newGroup.id && fromGroup.id !== toGroup.id) {
                const p = findParent(clone, fromGroup.id);
                if (p) {
                    p.parent.children.splice(p.index, 1);
                }
            }

            return normalizeTree(clone) || clone;
        });
    }, []);

    return {
        layout,
        activeGroupId,
        getActiveGroup: () => activeGroupId,
        setActiveGroupId,
        openSession,
        closeView,
        splitGroup,
        moveView,
        splitDrop,
        findNode,
        setPersistenceKey: setPersistenceKeyFn
    };
};
