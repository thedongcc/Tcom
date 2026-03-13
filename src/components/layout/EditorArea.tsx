import React, { type ReactNode, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { LayoutTemplate } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout, LayoutNode, LeafNode, findNode } from '../../hooks/useEditorLayout';
import {
    DndContext,
    pointerWithin,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
} from '@dnd-kit/core';
import {
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { parseCompositeId } from './EditorTabComponents';
import { GroupPanel } from './EditorGroupPanel';


// --- Layout Renderer (Recursive) ---
const LayoutRenderer = ({ node, activeGroupId, sessions, sessionManager, layoutActions, onShowSettings, activeDragId, dropIndicator }: any) => {
    if (!node) return null;

    if (node.type === 'split') {
        return (
            <Group
                key={`${node.id}-${node.direction}`}
                id={node.id}
                // @ts-ignore
                direction={node.direction}
                className={`h-full w-full ${node.direction === 'vertical' ? '!flex-col' : '!flex-row'}`}
                style={{ display: 'flex' }}
            >
                {node.children.map((child: { id: string }, index: number) => (
                    <React.Fragment key={child.id}>
                        <Panel minSize={10} className="flex flex-col min-w-0 min-h-0">
                            <LayoutRenderer
                                node={child}
                                activeGroupId={activeGroupId}
                                sessions={sessions}
                                sessionManager={sessionManager}
                                layoutActions={layoutActions}
                                onShowSettings={onShowSettings}
                                activeDragId={activeDragId}
                                dropIndicator={dropIndicator}
                            />
                        </Panel>
                        {index < node.children.length - 1 && (
                            <Separator
                                data-direction={node.direction}
                                className={`bg-[var(--widget-border-color)] hover:bg-[var(--focus-border-color)] transition-all z-10
                                    ${node.direction === 'vertical'
                                        ? 'h-[1px] hover:h-[2px] w-full'
                                        : 'w-[1px] hover:w-[2px] h-full'
                                    }`}
                            />
                        )}
                    </React.Fragment>
                ))}
            </Group>
        );
    }

    // Leaf
    return (
        <GroupPanel
            node={node}
            isActive={activeGroupId === node.id}
            sessions={sessions}
            sessionManager={sessionManager}
            layoutActions={layoutActions}
            onShowSettings={onShowSettings}
            activeDragId={activeDragId}
            dropIndicator={dropIndicator}
        />
    );
};

// --- Main Editor Area ---

interface EditorAreaProps {
    children?: ReactNode;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
    onShowSettings?: (view: string) => void;
}

export const EditorArea = ({ children, sessionManager, editorLayout, onShowSettings }: EditorAreaProps) => {
    const { layout, activeGroupId, moveView, splitDrop } = editorLayout;
    const { t } = useI18n();

    // NOTE: We need sessions to find labels
    const { sessions } = sessionManager;

    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ groupId: string, index: number } | null>(null);

    // Keep layout in ref to avoid stale closures in dnd-kit handlers
    const layoutRef = React.useRef(layout);
    layoutRef.current = layout;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Helper to find group by session ID (Legacy, might still be needed for other lookups if any)
    const findGroupWithSession = (node: LayoutNode, sessionId: string): string | null => {
        // ... (existing implementation if needed, but we rely on composite IDs now)
        // Actually, if we use composite IDs strictly for tabs, we might not need this for drag events.
        // But let's keep it safe.
        if (node.type === 'leaf') {
            if (node.views.includes(sessionId)) return node.id;
            return null;
        }
        if (node.type === 'split') {
            for (const c of node.children) {
                const res = findGroupWithSession(c, sessionId);
                if (res) return res;
            }
        }
        return null;
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
        setDropIndicator(null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const overId = over.id as string;

        // 1. Determine Target Group and Insertion Index
        let targetGroupId: string | null = null;

        // Case A: Dropped on a Tab (Composite ID)
        const overParsed = parseCompositeId(overId);
        if (overParsed) {
            targetGroupId = overParsed.groupId;

            // Find index in target group
            const targetNode = findNode(layoutRef.current, targetGroupId) as LeafNode;
            if (targetNode) {
                const hoverIndex = targetNode.views.indexOf(overParsed.sessionId);

                // Active Rect (dragged)
                const activeRect = active.rect.current.translated;
                // Over Rect (target tab)
                const overRect = over.rect; // { left, top, width, height }

                if (overRect) {
                    // Check collision with mouse cursor (activatorEvent) is most reliable for "left/right" half
                    const activator = event.activatorEvent as any;
                    let insertIndex = hoverIndex;

                    if (activator && activator.clientX !== undefined) {
                        const clientX = activator.clientX + event.delta.x; // Correctly calculate current position
                        const midpoint = overRect.left + (overRect.width / 2);
                        // If cursor is to the right of midpoint, insert AFTER
                        if (clientX > midpoint) {
                            insertIndex = hoverIndex + 1;
                        }
                    }

                    setDropIndicator({ groupId: targetGroupId, index: insertIndex });
                }
            }
        }
        // Case B: Dropped on a DropZone (e.g. Center, Header, or Start)
        else {
            if (overId.includes('-center') || overId.includes('-header') || overId.includes('-start')) {
                const gId = overId.replace('-center', '').replace('-header', '').replace('-start', '');
                const targetNode = findNode(layoutRef.current, gId) as LeafNode;
                if (targetNode) {
                    if (overId.includes('-start')) {
                        // Explicit insertion at start
                        setDropIndicator({ groupId: gId, index: 0 });
                    } else if (overId.includes('-header')) {
                        // Header drop
                        // Check for left-edge proximity as fallback for "Start Zone" misses
                        const activator = event.activatorEvent as any;
                        const overRect = over.rect;
                        let insertIndex = targetNode.views.length;

                        if (activator && activator.clientX !== undefined && overRect) {
                            // Use a generous threshold (e.g., 60px) to catch "near start" drops that miss the explicit zone
                            const currentClientX = activator.clientX + event.delta.x;
                            if (currentClientX < overRect.left + 60) {
                                insertIndex = 0;
                            }
                        }
                        setDropIndicator({ groupId: gId, index: insertIndex });
                    } else {
                        // Center drop -> Append
                        setDropIndicator({ groupId: gId, index: targetNode.views.length });
                    }
                }
            } else {
                setDropIndicator(null);
            }
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);
        setDropIndicator(null);
        if (!over) return;

        const overId = over.id as string;

        const activeParsed = parseCompositeId(active.id as string);
        if (!activeParsed) return;
        const { groupId: sourceGroupId, sessionId: activeSessionId } = activeParsed;

        // If overId contains -top/bottom/left/right/center (DropZone)
        if (overId.includes('-') && !overId.includes('::')) {
            const parts = overId.split('-');
            const zone = parts.pop();
            const targetGroupId = parts.join('-');

            if (zone === 'center' || zone === 'header' || zone === 'start') {
                const targetNode = findNode(layoutRef.current, targetGroupId) as LeafNode;
                let idx = targetNode ? targetNode.views.length : 0;

                if (zone === 'start') {
                    idx = 0;
                } else if (zone === 'header' && targetNode) {
                    // Fallback for header background drops
                    const activator = event.activatorEvent as any;
                    const overRect = over.rect;
                    if (activator && activator.clientX !== undefined && overRect) {
                        const currentClientX = activator.clientX + event.delta.x;
                        if (currentClientX < overRect.left + 60) {
                            idx = 0;
                        }
                    }
                }

                moveView(sourceGroupId, targetGroupId, activeSessionId, idx);
            } else if (['top', 'bottom', 'left', 'right'].includes(zone!)) {
                splitDrop(sourceGroupId, targetGroupId, activeSessionId, zone as any);
            }
            return;
        }

        // Case: Dropped on a Tab
        const overParsed = parseCompositeId(overId);
        if (overParsed) {
            const targetGroupId = overParsed.groupId;
            const targetNode = findNode(layoutRef.current, targetGroupId) as LeafNode;

            if (targetNode) {
                let targetIndex = targetNode.views.indexOf(overParsed.sessionId);

                // Adjust index based on side (re-calculate or use stored indicator? Indicator state is cleared)
                // We should re-calc using activator event if possible, or reliable rect logic
                const activator = event.activatorEvent as any;
                if (activator && activator.clientX !== undefined) {
                    const clientX = activator.clientX + event.delta.x; // Correctly calculate current position
                    const overRect = over.rect;
                    const midpoint = overRect.left + (overRect.width / 2);
                    if (clientX > midpoint) {
                        targetIndex += 1;
                    }
                }

                moveView(sourceGroupId, targetGroupId, activeSessionId, targetIndex);
            }
            return;
        }
    };

    const dropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.5' } },
        }),
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex-1 flex flex-col bg-[var(--editor-area-bg)] overflow-hidden" data-component="editor-area">
                {layout ? (
                    <LayoutRenderer
                        node={layout}
                        activeGroupId={activeGroupId}
                        sessions={sessions}
                        sessionManager={sessionManager}
                        layoutActions={editorLayout}
                        onShowSettings={onShowSettings}
                        activeDragId={activeDragId}
                        dropIndicator={dropIndicator}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        {t('editor.noEditorOpen')}
                    </div>
                )}

                <DragOverlay className="pointer-events-none" dropAnimation={dropAnimation} modifiers={[
                    ({ activatorEvent, draggingNodeRect, transform }) => {
                        if (draggingNodeRect && activatorEvent) {
                            const activator = activatorEvent as any;
                            // Ensure we have coordinates (PointerEvent)
                            if (activator.clientX !== undefined && activator.clientY !== undefined) {
                                // Calculate the offset of the grab point relative to the element's top-left
                                const offsetX = activator.clientX - draggingNodeRect.left;
                                const offsetY = activator.clientY - draggingNodeRect.top;

                                // We want the element's top-left to jump to the cursor.
                                // Currently, dnd-kit preserves the offset.
                                // dnd-kit calculates: Position = InitialRect + Delta.
                                // Delta = CurrentCursor - InitialCursor.
                                // So Position = InitialRect + CurrentCursor - InitialCursor.
                                // We want Position = CurrentCursor.
                                // So we need to add (InitialCursor - InitialRect) to the Delta.
                                // InitialCursor - InitialRect is exactly offsetX/Y.

                                return {
                                    ...transform,
                                    x: transform.x + offsetX,
                                    y: transform.y + offsetY,
                                };
                            }
                        }
                        return transform;
                    }
                ]}>
                    {activeDragId ? (
                        <div className="h-full px-3 bg-[var(--widget-background)] text-[var(--st-panel-header-text)] border-t-2 border-[var(--accent-color)] flex items-center min-w-[120px] pointer-events-none shadow-lg opacity-90">
                            <span className="text-[13px]">
                                {(() => {
                                    const parsed = parseCompositeId(activeDragId);
                                    const sid = parsed ? parsed.sessionId : activeDragId;
                                    return sessions.find(s => s.id === sid)?.config.name || 'Tab';
                                })()}
                            </span>
                        </div>
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
};
