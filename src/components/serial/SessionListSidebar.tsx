import { useState, useEffect, useRef } from 'react';
import { FolderOpen, Plus, Trash2, Edit2, Network, Cpu, FolderClosed, X, MoreHorizontal, Check } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { NewSessionDialog } from '../session/NewSessionDialog';
import { SessionType } from '../../types/session';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SessionListItem } from './SessionListItem';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

interface SessionListSidebarProps {
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SessionListSidebar = ({ sessionManager, editorLayout }: SessionListSidebarProps) => {
    const { confirm } = useConfirm();
    const { showToast } = useToast();
    const { t } = useI18n();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, sessionId: string } | null>(null);
    const [recentMenu, setRecentMenu] = useState<{ x: number, y: number } | null>(null);
    const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
    const addButtonRef = useRef<HTMLDivElement>(null);
    const recentButtonRef = useRef<HTMLDivElement>(null);

    // Close context menu on click elsewhere
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

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = sessionManager.savedSessions.findIndex((s) => s.id === active.id);
            const newIndex = sessionManager.savedSessions.findIndex((s) => s.id === over?.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(sessionManager.savedSessions, oldIndex, newIndex);
                sessionManager.reorderSessions(newOrder);
            }
        }
    };

    const handleSelectSessionType = (type: SessionType) => {
        setShowNewSessionDialog(false);
        const newId = sessionManager.createSession(type as any); // Promise<string>

        // Handle promise to open
        newId.then(id => {
            const newSession = sessionManager.sessions.find(s => s.id === id);
            if (newSession) {
                setEditingId(id);
                setEditName(newSession.config.name);
                editorLayout.openSession(id);
            }
        });
    };

    const startEditing = (session: typeof sessionManager.savedSessions[0]) => {
        setEditingId(session.id);
        setEditName(session.name);
        setContextMenu(null);
    };

    const saveEdit = () => {
        if (editingId) {
            const session = sessionManager.savedSessions.find(s => s.id === editingId);
            const trimmedName = editName.trim();
            if (session && trimmedName !== '') {
                // Uniqueness check
                const isDuplicate = sessionManager.savedSessions.some(s => s.id !== editingId && s.name === trimmedName);
                if (isDuplicate) {
                    showToast(t('toast.sessionNameExists', { name: trimmedName }), 'error');
                    return; // Don't close editing if duplicate
                }

                if (trimmedName !== session.name) {
                    const isOpen = sessionManager.sessions.some(s => s.id === editingId);
                    if (isOpen) {
                        sessionManager.updateSessionConfig(editingId, { name: trimmedName });
                    } else {
                        const updatedConfig = { ...session, name: trimmedName };
                        sessionManager.saveSession(updatedConfig);
                    }
                }
            }
            setEditingId(null);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
    };

    const workspaceFolderName = sessionManager.workspacePath
        ? sessionManager.workspacePath.split(/[\\/]/).pop() || '...'
        : null;

    return (
        <div className="flex flex-col h-full bg-[var(--sidebar-background)] text-[var(--app-foreground)] relative">
            {/* Workspace Header */}
            <div className="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--sidebar-background)]">
                {sessionManager.workspacePath ? (
                    <div className="flex items-center justify-between">
                        <div
                            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-80 min-w-0 flex-1 cursor-default"
                            title={sessionManager.workspacePath}
                        >
                            <FolderOpen size={13} className="shrink-0 opacity-70" />
                            <span className="truncate">{workspaceFolderName}</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                            <div
                                ref={recentButtonRef}
                                className="cursor-pointer p-1 rounded hover:bg-[var(--list-hover-background)]"
                                title={t('session.recentWorkspaces')}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = recentButtonRef.current?.getBoundingClientRect();
                                    if (rect) setRecentMenu({ x: rect.left, y: rect.bottom + 5 });
                                }}
                            >
                                <MoreHorizontal size={14} className="opacity-70 hover:opacity-100" />
                            </div>
                            <div
                                ref={addButtonRef}
                                className="cursor-pointer p-1 rounded hover:bg-[var(--list-hover-background)]"
                                title={t('session.newSession')}
                                onClick={() => setShowNewSessionDialog(true)}
                            >
                                <Plus size={14} className="opacity-70 hover:opacity-100" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                        <FolderOpen size={32} className="opacity-30" />
                        <span className="text-[11px] opacity-50 text-center">{t('session.noWorkspaceOpen')}</span>
                        <button
                            className="text-[12px] px-3 py-1.5 rounded bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)] cursor-pointer transition-colors"
                            onClick={() => sessionManager.browseAndOpenWorkspace()}
                        >
                            {t('session.openWorkspace')}
                        </button>
                    </div>
                )}
            </div>

            {/* Recent Workspaces Menu */}
            {recentMenu && (
                <div
                    className="fixed z-50 bg-[var(--app-background)] border border-[var(--widget-border-color)] shadow-lg rounded py-1 min-w-[200px]"
                    style={{ top: recentMenu.y, left: recentMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1.5 text-[11px] font-semibold opacity-50 select-none uppercase">
                        {t('session.recentWorkspaces')}
                    </div>
                    {sessionManager.recentWorkspaces.map(ws => (
                        <div
                            key={ws}
                            className="px-3 py-1.5 text-[12px] hover:bg-[var(--list-hover-background)] hover:text-[var(--app-foreground)] cursor-pointer flex items-center gap-2"
                            onClick={() => {
                                sessionManager.openWorkspace(ws);
                                setRecentMenu(null);
                            }}
                        >
                            <span className="truncate flex-1" title={ws}>
                                {ws.split(/[\\/]/).pop()}
                            </span>
                            {sessionManager.workspacePath === ws && <Check size={12} className="opacity-70" />}
                        </div>
                    ))}
                    {sessionManager.recentWorkspaces.length > 0 && (
                        <div className="h-[1px] bg-[var(--border-color)] my-1 opacity-50" />
                    )}
                    <div
                        className="px-3 py-1.5 text-[12px] hover:bg-[var(--list-hover-background)] hover:text-[var(--app-foreground)] cursor-pointer"
                        onClick={() => {
                            sessionManager.browseAndOpenWorkspace();
                            setRecentMenu(null);
                        }}
                    >
                        {t('session.openOther')}
                    </div>
                </div>
            )}

            {/* Session List */}
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
                                portInfo={sessionManager.ports.find(p => p.path === (session as any).connection?.path)}
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
                    onSelect={handleSelectSessionType}
                    onClose={() => setShowNewSessionDialog(false)}
                    position={{
                        x: (addButtonRef.current?.getBoundingClientRect().left || 0) + 20,
                        y: (addButtonRef.current?.getBoundingClientRect().top || 0) + 20
                    }}
                />
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-[5000] bg-[var(--menu-background)] border border-[var(--menu-border-color)] shadow-2xl rounded-sm py-1 w-[160px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div
                        className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[var(--list-hover-background)] hover:text-[var(--app-foreground)] cursor-pointer transition-colors group"
                        onClick={() => {
                            const session = sessionManager.savedSessions.find(s => s.id === contextMenu.sessionId);
                            if (session) startEditing(session);
                        }}
                    >
                        <Edit2 size={13} className="opacity-60 group-hover:opacity-100" />
                        {t('common.edit')}
                    </div>
                    <div className="h-[1px] bg-[var(--menu-border-color)] my-1 mx-1" />
                    <div
                        className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-red-500/10 hover:text-red-400 cursor-pointer text-red-500/80 transition-colors group"
                        onClick={async () => {
                            const session = sessionManager.savedSessions.find(s => s.id === contextMenu.sessionId);
                            if (session) {
                                const ok = await confirm({
                                    title: t('session.deleteTitle'),
                                    message: t('session.deleteConfirm', { name: session.name }),
                                    type: 'danger',
                                    confirmText: t('common.delete')
                                });
                                if (ok) {
                                    // 1. Delete config and cleanup manager state
                                    await sessionManager.deleteSession(session.id);
                                    // 2. Force cleanup from editor layout across all groups
                                    const allGroups = editorLayout.layout ? (editorLayout.layout.type === 'leaf' ? [editorLayout.layout] : []) : [];
                                    // This is a bit brute-force but ensures UI consistency
                                    // EditorLayout's normalizeTree will handle the rest
                                    Object.keys(localStorage).forEach(key => {
                                        if (key.startsWith('editor-layout-')) {
                                            // The hook itself will handle internal state, 
                                            // but we need to ensure closeView is called if visible
                                        }
                                    });
                                    // Proper way: closeView needs groupId. In most cases it's in the active group or we can find it.
                                    // But sessionManager.deleteSession -> closeSession already handles disconnecting.
                                    // We just need to make sure the UI part (EditorLayout) is triggered.
                                    editorLayout.closeView('group-0', session.id); // Default group
                                    // Handle split views if any (more robust check)
                                    const leaves = (node: any): any[] => node.type === 'leaf' ? [node] : node.children.flatMap(leaves);
                                    if (editorLayout.layout) {
                                        const allLeaves = leaves(editorLayout.layout);
                                        allLeaves.forEach(leaf => {
                                            if (leaf.views.includes(session.id)) {
                                                editorLayout.closeView(leaf.id, session.id);
                                            }
                                        });
                                    }
                                }
                            }
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
