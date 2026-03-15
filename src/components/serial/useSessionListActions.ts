/**
 * useSessionListActions.ts
 * 会话列表操作逻辑 Hook — 拖拽排序、新建会话、重命名、删除。
 * 从 SessionListSidebar.tsx 中拆分出来。
 */
import { useState, useCallback } from 'react';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useSession } from '../../context/SessionContext';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { SessionType } from '../../types/session';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

interface UseSessionListActionsParams {
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export function useSessionListActions({ editorLayout }: UseSessionListActionsParams) {
    const sessionManager = useSession();
    const { confirm } = useConfirm();
    const { showToast } = useToast();
    const { t } = useI18n();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // 拖拽排序
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = sessionManager.savedSessions.findIndex((s) => s.id === active.id);
            const newIndex = sessionManager.savedSessions.findIndex((s) => s.id === over?.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(sessionManager.savedSessions, oldIndex, newIndex);
                sessionManager.reorderSessions(newOrder);
            }
        }
    }, [sessionManager]);

    // 新建会话
    const handleSelectSessionType = useCallback((type: SessionType) => {
        const newId = sessionManager.createSession(type as any);
        newId.then(id => {
            const newSession = sessionManager.sessions.find(s => s.id === id);
            if (newSession) {
                setEditingId(id);
                setEditName(newSession.config.name);
                editorLayout.openSession(id);
            }
        });
    }, [sessionManager, editorLayout]);

    // 开始重命名
    const startEditing = useCallback((session: { id: string; name: string }) => {
        setEditingId(session.id);
        setEditName(session.name);
    }, []);

    // 保存重命名
    const saveEdit = useCallback(() => {
        if (editingId) {
            const session = sessionManager.savedSessions.find(s => s.id === editingId);
            const trimmedName = editName.trim();
            if (session && trimmedName !== '') {
                const isDuplicate = sessionManager.savedSessions.some(s => s.id !== editingId && s.name === trimmedName);
                if (isDuplicate) {
                    showToast(t('toast.sessionNameExists', { name: trimmedName }), 'error');
                    return;
                }
                if (trimmedName !== session.name) {
                    const isOpen = sessionManager.sessions.some(s => s.id === editingId);
                    if (isOpen) {
                        void sessionManager.updateSessionConfig(editingId, { name: trimmedName });
                    } else {
                        const updatedConfig = { ...session, name: trimmedName };
                        sessionManager.saveSession(updatedConfig);
                    }
                }
            }
            setEditingId(null);
        }
    }, [editingId, editName, sessionManager, showToast, t]);

    // 删除会话
    const deleteSession = useCallback(async (sessionId: string) => {
        const session = sessionManager.savedSessions.find(s => s.id === sessionId);
        if (!session) return;

        const ok = await confirm({
            title: t('session.deleteTitle'),
            message: t('session.deleteConfirm', { name: session.name }),
            type: 'danger',
            confirmText: t('common.delete')
        });

        if (ok) {
            await sessionManager.deleteSession(session.id);
            editorLayout.closeView('group-0', session.id);
            // 处理分屏视图
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
    }, [sessionManager, editorLayout, confirm, t]);

    return {
        editingId, setEditingId,
        editName, setEditName,
        handleDragEnd,
        handleSelectSessionType,
        startEditing,
        saveEdit,
        deleteSession,
    };
}
