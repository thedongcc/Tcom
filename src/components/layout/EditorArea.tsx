import React, { type ReactNode, useState } from 'react';
import { X, LayoutTemplate, Plus, Columns } from 'lucide-react';
// Use legacy matching imports to ensure compatibility with user's environment
import { Group, Panel, Separator } from 'react-resizable-panels';
import { SerialMonitor } from '../serial/SerialMonitor';
import { MqttMonitor } from '../mqtt/MqttMonitor';
import { MonitorTerminal } from '../serial-monitor/MonitorTerminal';
import { GraphEditor } from '../graph-editor/GraphEditor';
import { SettingsEditor } from '../settings/SettingsEditor';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout, LayoutNode, LeafNode, findNode } from '../../hooks/useEditorLayout';
import {
    DndContext,
    closestCenter,
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
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Helpers for Composite IDs (GroupId::SessionId) ---
const getCompositeId = (groupId: string, sessionId: string) => `${groupId}::${sessionId}`;
const parseCompositeId = (id: string): { groupId: string, sessionId: string } | null => {
    if (!id || !id.includes('::')) return null;
    const parts = id.split('::');
    return { groupId: parts[0], sessionId: parts[1] };
};

// --- Icons ---

// --- Components ---



// --- Tab Component ---
interface TabProps {
    label: string;
    active?: boolean;
    isGroupActive?: boolean;
    unsaved?: boolean;
    onClose: (e: React.MouseEvent) => void;
    onClick: (e: React.MouseEvent) => void;
}

const Tab = ({ label, active, isGroupActive, unsaved, onClose, onClick }: TabProps) => (
    <div
        onClick={onClick}
        className={`
    h-full px-3 min-w-[120px] max-w-[200px] flex items-center justify-between cursor-pointer border-r border-[var(--vscode-border)] select-none group
    ${active
                ? `bg-[var(--vscode-bg)] ${isGroupActive ? 'text-[var(--vscode-fg)] border-t-[2px] border-t-[var(--vscode-accent)] font-bold tracking-wide' : 'text-[#777] border-t-2 border-t-transparent'}`
                : 'bg-[var(--vscode-editor-widget-bg)] text-[#666] hover:bg-[var(--vscode-bg)]'
            }
`}
        title={label}
    >
        <div className="flex items-center gap-2 truncate flex-1">
            <span className="text-[13px] truncate">{label}</span>
            {unsaved && <div className="w-2 h-2 rounded-full bg-white opacity-60"></div>}
        </div>
        <div className="flex items-center">
            <div
                onClick={onClose}
                className="p-0.5 rounded-md hover:bg-[var(--vscode-hover)]">
                <X size={14} />
            </div>
        </div>
    </div>
);

// --- Sortable Tab Wrapper ---
const SortableTab = ({ id, ...props }: TabProps & { id: string }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        // transform: CSS.Transform.toString(transform), // Disable visual sorting
        transition,
        opacity: 1, // Keep original fully visible during drag
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="h-full">
            <Tab {...props} />
        </div>
    );
};

// --- Group Header ---
interface GroupHeaderProps {
    group: LeafNode;
    isActiveGroup: boolean;
    setActiveGroupId: (id: string) => void;
    children: ReactNode;
}

const GroupHeader = ({ group, isActiveGroup, setActiveGroupId, children }: GroupHeaderProps) => {
    return (
        <div
            className={`relative z-50 flex h-9 bg-[#252526] border-b border-[#2b2b2b] select-none items-center overflow-hidden ${isActiveGroup ? '' : 'opacity-80'}`}
            onClick={() => setActiveGroupId(group.id)}
        >
            {children}
        </div>
    );
};

// --- Drop Zone Overlay ---
const DropZone = ({ id, className, activeClassName }: { id: string, className?: string, activeClassName?: string }) => {
    const { isOver, setNodeRef } = useDroppable({ id });
    const activeClass = activeClassName || 'bg-[var(--vscode-accent)] opacity-20';
    return (
        <div
            ref={setNodeRef}
            className={`${className} transition-colors ${isOver ? activeClass : 'bg-transparent'}`}
        />
    );
};

// --- Header Drop Zone (For empty space in header) ---
const HeaderDropZone = ({ id, children, className }: { id: string, children: ReactNode, className?: string }) => {
    const { isOver, setNodeRef } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`${className}`}
        >
            {children}
        </div>
    );
};

// --- Drop Indicator ---
const DropIndicator = () => (
    <div className="w-[3px] h-full bg-[#007fd4] absolute z-[2000] pointer-events-none shadow-[0_0_4px_rgba(0,0,0,0.5)] transform -translate-x-1/2" />
);

// --- Group Panel ---
interface GroupPanelProps {
    node: LeafNode;
    isActive: boolean;
    sessions: any[];
    sessionManager: any;
    layoutActions: any;
    onShowSettings?: (view: string) => void;
    activeDragId: string | null;
    dropIndicator: { groupId: string; index: number } | null;
}

const GroupPanel = ({ node, isActive, sessions, sessionManager, layoutActions, onShowSettings, activeDragId, dropIndicator }: GroupPanelProps) => {
    const { setActiveGroupId, openSession, closeView, splitGroup } = layoutActions;

    return (
        <div className="flex flex-col h-full w-full relative group min-w-0" onClick={() => {
            setActiveGroupId(node.id);
            if (node.activeViewId) sessionManager.setActiveSessionId(node.activeViewId);
        }}>
            {/* Drop Indicators */}
            {activeDragId && (
                <>
                    {/* Center: Merge (Full area, subtle highlight) */}
                    <DropZone
                        id={`${node.id}-center`}
                        className="absolute inset-0 z-30"
                        activeClassName="bg-[var(--vscode-accent)] opacity-10 border-2 border-[var(--vscode-focusBorder)]"
                    />
                </>
            )}

            <GroupHeader group={node} isActiveGroup={isActive} setActiveGroupId={setActiveGroupId}>
                <HeaderDropZone id={`${node.id}-header`} className="flex-1 flex items-center overflow-x-auto scrollbar-hide h-full px-1 relative">
                    {activeDragId && (
                        <DropZone
                            id={`${node.id}-start`}
                            className="absolute left-0 top-0 bottom-0 w-8 z-[60]"
                            activeClassName="bg-transparent"
                        />
                    )}
                    <SortableContext items={node.views.map(v => getCompositeId(node.id, v))} strategy={horizontalListSortingStrategy}>
                        {node.views.map((viewId, idx) => {
                            const session = sessions.find(s => s.id === viewId);
                            if (!session) return null;
                            const isTabActive = node.activeViewId === viewId;
                            const compositeId = getCompositeId(node.id, viewId);
                            const showIndicatorBefore = dropIndicator?.groupId === node.id && dropIndicator.index === idx;

                            // Better approach: Wrap in Fragment, conditionally show indicator
                            return (
                                <React.Fragment key={compositeId}>
                                    {showIndicatorBefore && <div className="h-full w-[3px] relative flex flex-shrink-0 items-center justify-center overflow-visible z-[2000] -mr-[1.5px] -ml-[1.5px] pointer-events-none"><DropIndicator /></div>}
                                    <SortableTab
                                        id={compositeId}
                                        active={isTabActive}
                                        isGroupActive={isActive}
                                        label={session.config.name || '(Unknown)'}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            sessionManager.setActiveSessionId(viewId);
                                            openSession(viewId, node.id);
                                        }}
                                        onClose={(e) => {
                                            e.stopPropagation();
                                            closeView(node.id, viewId);
                                        }}
                                        unsaved={false} // Todo: track saved state
                                    />
                                </React.Fragment>
                            );
                        })}
                        {/* Indicator at the very end */}
                        {dropIndicator?.groupId === node.id && dropIndicator.index === node.views.length && (
                            <div className="h-full w-[3px] relative flex flex-shrink-0 items-center justify-center overflow-visible z-[2000] -ml-[1.5px] pointer-events-none"><DropIndicator /></div>
                        )}
                    </SortableContext>



                    {/* Actions - Only visible if there are tabs */}
                    {node.views && node.views.length > 0 && (
                        <div className="flex items-center px-1 gap-1 ml-auto">
                            <div
                                className="p-1 hover:bg-[var(--vscode-hover)] rounded cursor-pointer text-[var(--vscode-fg)]"
                                title="Split Editor Right"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    splitGroup(node.id, 'horizontal');
                                }}
                            >
                                <Columns size={14} />
                            </div>
                        </div>
                    )}
                </HeaderDropZone>
            </GroupHeader>

            {/* Content */}
            <div className="flex-1 relative bg-[var(--vscode-bg)]">
                {node.activeViewId ? (
                    (() => {
                        const session = sessions.find(s => s.id === node.activeViewId);
                        if (!session) return <div className="p-4 text-center text-gray-500">Session not found</div>;

                        if (session.config.type === 'settings') {
                            return <div key={session.id} className="absolute inset-0"><SettingsEditor /></div>;
                        }
                        if (session.config.type === 'graph') {
                            return <div key={session.id} className="absolute inset-0"><GraphEditor sessionId={session.id} /></div>;
                        }
                        if (session.config.type === 'mqtt') {
                            return <MqttMonitor
                                key={session.id}
                                session={session as any}
                                onShowSettings={onShowSettings}
                                onPublish={(topic, payload, qos, retain) => sessionManager.publishMqtt(session.id, topic, payload, { qos, retain })}
                                onUpdateConfig={(updates) => sessionManager.updateSessionConfig(session.id, updates)}
                                onClearLogs={() => sessionManager.clearLogs(session.id)}
                                onConnectRequest={() => {
                                    sessionManager.setActiveSessionId(session.id);
                                    return sessionManager.connectSession(session.id);
                                }}
                            />;
                        }
                        if (session.config.type === 'monitor') {
                            return <MonitorTerminal
                                key={session.id}
                                session={session}
                                onShowSettings={onShowSettings}
                                onConnectRequest={() => {
                                    sessionManager.setActiveSessionId(session.id);
                                    return sessionManager.connectSession(session.id);
                                }}
                            />;
                        }
                        return <SerialMonitor
                            key={session.id}
                            session={session}
                            onShowSettings={onShowSettings}
                            onSend={(data) => sessionManager.writeToSession(session.id, data)}
                            onUpdateConfig={(updates) => sessionManager.updateSessionConfig(session.id, updates)}
                            onInputStateChange={(inputState) => sessionManager.updateUIState(session.id, inputState)}
                            onClearLogs={() => sessionManager.clearLogs(session.id)}
                            onConnectRequest={() => {
                                sessionManager.setActiveSessionId(session.id);
                                return sessionManager.connectSession(session.id);
                            }}
                        />;
                    })()
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none text-center p-4">
                        <LayoutTemplate size={64} className="mb-4 text-[var(--vscode-fg)] opacity-50" />
                        <p className="text-lg font-medium text-[var(--vscode-fg)]">No Editor Open</p>
                        <p className="text-sm text-[#888] mt-2 max-w-[300px]">Select a session from the sidebar or create a new one to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


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
                                className={`bg-[var(--vscode-widget-border)] hover:bg-[var(--vscode-focusBorder)] transition-all z-10
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
            <div className="flex-1 flex flex-col bg-[var(--vscode-bg)] overflow-hidden">
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
                        No Editors Open
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
                        <div className="h-full px-3 bg-[var(--vscode-editor-widget-bg)] text-[var(--vscode-fg)] border-t-2 border-[var(--vscode-accent)] flex items-center min-w-[120px] pointer-events-none shadow-lg opacity-90">
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
