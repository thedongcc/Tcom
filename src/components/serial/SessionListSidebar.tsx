/**
 * SessionListSidebar.tsx
 * 会话列表侧边栏 — 工作区头部 + 会话列表 + 右键菜单。
 *
 * 子模块：
 * - useSessionListActions.ts — 拖拽排序、新建/重命名/删除会话逻辑
 * - WorkspaceHeader.tsx — 工作区头部区域
 * - RecentWorkspacesMenu.tsx — 最近工作区弹出菜单
 */
import { useState, useEffect, useRef } from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { NewSessionDialog } from '../session/NewSessionDialog';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SessionListItem } from './SessionListItem';
import { useI18n } from '../../context/I18nContext';
import { useSessionListActions } from './useSessionListActions';
import { useSession } from '../../context/SessionContext';
import { SessionConfig } from '../../types/session';
import { WorkspaceHeader } from './WorkspaceHeader';
import { RecentWorkspacesMenu } from './RecentWorkspacesMenu';

interface SessionListSidebarProps {
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SessionListSidebar = ({ editorLayout }: SessionListSidebarProps) => {
    const sessionManager = useSession();
    const { t } = useI18n();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, sessionId: string } | null>(null);
    const [recentMenu, setRecentMenu] = useState<{ x: number, y: number } | null>(null);
    const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
    const addButtonRef = useRef<HTMLDivElement>(null);
    const recentButtonRef = useRef<HTMLDivElement>(null);

    // 操作逻辑
    const {
        editingId, setEditingId, editName, setEditName,
        handleDragEnd, handleSelectSessionType: onSelectType,
        startEditing, saveEdit, deleteSession,
    } = useSessionListActions({ editorLayout });

    // 关闭右键菜单
    useEffect(() => {
        const handleClick = () => {
            setContextMenu(null);
            setRecentMenu(null);
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
    };

    const workspaceFolderName = sessionManager.workspacePath
        ? sessionManager.workspacePath.split(/[\\/]/).pop() || '...'
        : null;

    return (
        <div className="flex flex-col h-full bg-[var(--session-list-sidebar-bg)] text-[var(--session-list-sidebar-text)] relative" data-component="session-list-sidebar">
            {/* 工作区头部 */}
            <WorkspaceHeader
                workspacePath={sessionManager.workspacePath}
                workspaceFolderName={workspaceFolderName}
                onRefreshWorkspace={() => {
                    if (sessionManager.workspacePath) {
                        sessionManager.openWorkspace(sessionManager.workspacePath);
                    }
                }}
                onShowRecentMenu={(e) => {
                    e.stopPropagation();
                    const rect = recentButtonRef.current?.getBoundingClientRect();
                    if (rect) setRecentMenu({ x: rect.left, y: rect.bottom + 5 });
                }}
                onShowNewSession={() => setShowNewSessionDialog(true)}
                onBrowseWorkspace={() => sessionManager.browseAndOpenWorkspace()}
                recentButtonRef={recentButtonRef}
                addButtonRef={addButtonRef}
                t={t}
            />

            {/* 最近工作区菜单 */}
            {recentMenu && (
                <RecentWorkspacesMenu
                    position={recentMenu}
                    currentWorkspacePath={sessionManager.workspacePath}
                    recentWorkspaces={sessionManager.recentWorkspaces}
                    onOpenWorkspace={(ws) => sessionManager.openWorkspace(ws)}
                    onBrowseWorkspace={() => sessionManager.browseAndOpenWorkspace()}
                    onClose={() => setRecentMenu(null)}
                    t={t}
                />
            )}

            {/* 会话列表 */}
            <div className="flex flex-col flex-1 overflow-y-auto" onClick={() => setEditingId(null)}>
                {sessionManager.workspacePath && sessionManager.savedSessions.length === 0 && (
                    <div className="p-4 text-[11px] text-[var(--activitybar-inactive-foreground)] italic text-center">
                        {t('session.noSessions')}
                    </div>
                )}
                <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    sensors={sensors}
                >
                    <SortableContext
                        items={sessionManager.savedSessions.filter(s => s.type !== 'settings').map(s => s.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {sessionManager.savedSessions.filter(s => s.type !== 'settings').map(session => (
                            <SessionListItem
                                key={session.id}
                                session={session}
                                portInfo={sessionManager.ports.find(p => p.path === session.connection?.path)}
                                isActive={sessionManager.activeSessionId === session.id}
                                isConnected={sessionManager.sessions.find(s => s.id === session.id)?.isConnected || false}
                                isEditing={editingId === session.id}
                                editName={editName}
                                onEditNameChange={setEditName}
                                onSaveEdit={saveEdit}
                                onCancelEdit={() => setEditingId(null)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (editingId !== session.id) {
                                        sessionManager.openSavedSession(session);
                                        editorLayout.openSession(session.id);
                                    }
                                }}
                                onContextMenu={(e) => handleContextMenu(e, session.id)}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>

            {showNewSessionDialog && (
                <NewSessionDialog
                    onSelect={(type) => {
                        setShowNewSessionDialog(false);
                        onSelectType(type as SessionConfig['type']);
                    }}
                    onClose={() => setShowNewSessionDialog(false)}
                    position={{
                        x: (addButtonRef.current?.getBoundingClientRect().left || 0) + 20,
                        y: (addButtonRef.current?.getBoundingClientRect().top || 0) + 20
                    }}
                />
            )}

            {/* 右键菜单 */}
            {contextMenu && (
                <div
                    className="fixed z-[5000] bg-[var(--st-menu-bg)] border border-[var(--menu-border-color)] shadow-2xl rounded-sm py-1 w-[160px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div
                        className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer transition-colors group"
                        onClick={() => {
                            const session = sessionManager.savedSessions.find(s => s.id === contextMenu.sessionId);
                            if (session) {
                                startEditing(session);
                                setContextMenu(null);
                            }
                        }}
                    >
                        <Edit2 size={13} className="opacity-60 group-hover:opacity-100" />
                        {t('common.edit')}
                    </div>
                    <div className="h-[1px] bg-[var(--menu-border-color)] my-1 mx-1" />
                    <div
                        className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[var(--st-status-error-bg)] hover:text-[var(--st-status-error)] cursor-pointer text-[var(--st-status-error)] transition-colors group"
                        onClick={async () => {
                            await deleteSession(contextMenu.sessionId);
                        }}
                    >
                        <Trash2 size={13} className="opacity-60 group-hover:opacity-100" />
                        {t('common.delete')}
                    </div>
                </div>
            )}
        </div>
    );
};
