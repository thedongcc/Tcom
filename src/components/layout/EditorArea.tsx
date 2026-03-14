/**
 * EditorArea.tsx
 * 编辑器主区域 — 递归布局渲染 + DnD 拖拽排版。
 *
 * 子模块：
 * - useEditorDragDrop.ts   — DnD 事件处理和碰撞检测逻辑
 * - EditorGroupPanel.tsx   — 叶节点面板渲染
 */
import React, { type ReactNode } from 'react';
import { useI18n } from '../../context/I18nContext';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { DndContext, pointerWithin, DragOverlay } from '@dnd-kit/core';
import { parseCompositeId } from './EditorTabComponents';
import { GroupPanel } from './EditorGroupPanel';
import { useEditorDragDrop } from './useEditorDragDrop';


// --- 布局递归渲染器 ---
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

    // 叶节点
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

// --- 主编辑区 ---

interface EditorAreaProps {
    children?: ReactNode;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
    onShowSettings?: (view: string) => void;
}

export const EditorArea = ({ children, sessionManager, editorLayout, onShowSettings }: EditorAreaProps) => {
    const { layout, activeGroupId, moveView, splitDrop } = editorLayout;
    const { t } = useI18n();
    const { sessions } = sessionManager;

    // DnD 逻辑
    const {
        activeDragId, dropIndicator, sensors,
        handleDragStart, handleDragOver, handleDragEnd, dropAnimation,
    } = useEditorDragDrop({ layout, moveView, splitDrop });

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
                            if (activator.clientX !== undefined && activator.clientY !== undefined) {
                                const offsetX = activator.clientX - draggingNodeRect.left;
                                const offsetY = activator.clientY - draggingNodeRect.top;
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
