/**
 * useEditorDragDrop.ts
 * 编辑区 Tab 拖拽逻辑 Hook — 处理 DnD 事件、碰撞检测和 Tab 重排/分屏。
 * 从 EditorArea.tsx 中拆分出来。
 *
 * 子模块：
 * - editorDragDropHelpers.ts — DragOver/DragEnd 决策纯函数
 */
import { useState, useRef, useMemo } from 'react';
import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LayoutNode } from '../../hooks/useEditorLayout';
import { computeDropIndicator, computeDragEndAction } from './editorDragDropHelpers';

interface UseEditorDragDropParams {
    layout: LayoutNode | null;
    moveView: (sourceGroupId: string, targetGroupId: string, sessionId: string, index: number) => void;
    splitDrop: (sourceGroupId: string, targetGroupId: string, sessionId: string, zone: any) => void;
}

export function useEditorDragDrop({ layout, moveView, splitDrop }: UseEditorDragDropParams) {
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ groupId: string, index: number } | null>(null);

    // 保持 layout 在 ref 中以避免 dnd-kit handler 中的 stale closure
    const layoutRef = useRef(layout);
    layoutRef.current = layout;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
        setDropIndicator(null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { over } = event;
        if (!over) return;

        const activator = event.activatorEvent as any;
        const clientX = activator?.clientX;
        const result = computeDropIndicator(
            layoutRef.current,
            over.id as string,
            over.rect,
            clientX,
            event.delta.x
        );
        setDropIndicator(result);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);
        setDropIndicator(null);
        if (!over) return;

        const activator = event.activatorEvent as any;
        const clientX = activator?.clientX;
        const action = computeDragEndAction(
            layoutRef.current,
            active.id as string,
            over.id as string,
            over.rect,
            clientX,
            event.delta.x
        );

        switch (action.type) {
            case 'move':
                moveView(action.sourceGroupId, action.targetGroupId, action.sessionId, action.index);
                break;
            case 'split':
                splitDrop(action.sourceGroupId, action.targetGroupId, action.sessionId, action.zone as any);
                break;
            case 'noop':
                break;
        }
    };

    const dropAnimation = useMemo(() => ({
        sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.5' } },
        }),
    }), []);

    return {
        activeDragId,
        dropIndicator,
        sensors,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        dropAnimation,
    };
}
