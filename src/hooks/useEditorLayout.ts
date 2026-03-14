/**
 * useEditorLayout.ts
 * 编辑器布局管理 Hook — 状态管理 + 持久化，操作逻辑委托给 editorLayoutActions。
 *
 * 子模块：
 * - editorLayoutTypes.ts    — 布局类型定义和树遍历工具
 * - editorLayoutActions.ts  — 布局树变更纯函数
 */
import { useState, useCallback, useEffect } from 'react';
import {
    Direction,
    SplitNode,
    LeafNode,
    LayoutNode,
    EditorLayoutState,
    findNode,
} from './editorLayoutTypes';
import {
    applyOpenSession,
    applyCloseView,
    applySplitGroup,
    applyMoveView,
    applySplitDrop,
} from './editorLayoutActions';

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

    // ── 持久化 ──
    const [persistenceKey, setPersistenceKey] = useState<string | null>(null);

    // 从 localStorage 加载
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

    // 保存到 localStorage
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

    // ── 操作（委托给纯函数） ──

    const openSession = useCallback((sessionId: string, groupId?: string) => {
        setLayout(prev => {
            const targetId = groupId || activeGroupId;
            const result = applyOpenSession(prev, sessionId, targetId);
            if (result.fallbackGroupId && !groupId) {
                setActiveGroupId(result.fallbackGroupId);
            }
            return result.layout;
        });
        if (groupId) setActiveGroupId(groupId);
    }, [activeGroupId]);

    const closeView = useCallback((groupId: string, sessionId: string) => {
        setLayout(prev => applyCloseView(prev, groupId, sessionId));
    }, []);

    const splitGroup = useCallback((sourceGroupId: string, direction: Direction) => {
        setLayout(prev => applySplitGroup(prev, sourceGroupId, direction));
    }, []);

    const moveView = useCallback((fromGroupId: string, toGroupId: string, sessionId: string, newIndex?: number, allowAutoClose: boolean = true) => {
        setLayout(prev => applyMoveView(prev, fromGroupId, toGroupId, sessionId, newIndex, allowAutoClose));
        setActiveGroupId(toGroupId);
    }, []);

    const splitDrop = useCallback((sourceGroupId: string, targetGroupId: string, sessionId: string, edge: 'top' | 'bottom' | 'left' | 'right') => {
        setLayout(prev => applySplitDrop(prev, sourceGroupId, targetGroupId, sessionId, edge));
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
