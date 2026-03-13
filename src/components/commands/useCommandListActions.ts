/**
 * useCommandListActions.ts
 * 命令列表的拖放逻辑和发送操作。
 * 从 CommandListSidebar.tsx 中拆分出来。
 */
import { useCallback } from 'react';
import { DragEndEvent, CollisionDetection, closestCenter, pointerWithin } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { CommandEntity, CommandItem } from '../../types/command';
import { MessagePipeline } from '../../services/MessagePipeline';
import { useToast } from '../../context/ToastContext';
import { useSession } from '../../context/SessionContext';
import { useI18n } from '../../context/I18nContext';

interface UseCommandListActionsParams {
    commands: CommandEntity[];
    setAllCommands: (cmds: CommandEntity[]) => void;
    updateEntity: (id: string, updates: Partial<CommandEntity>) => void;
    onNavigate?: (view: string) => void;
}

export const useCommandListActions = ({
    commands, setAllCommands, updateEntity, onNavigate,
}: UseCommandListActionsParams) => {
    const { showToast } = useToast();
    const { t } = useI18n();
    const { activeSessionId, sessions, writeToSession, publishMqtt, connectSession } = useSession();

    // 自定义碰撞检测策略
    const customCollisionStrategy: CollisionDetection = (args) => {
        const pointerCollisions = pointerWithin(args);
        const insertionLine = pointerCollisions.find(c =>
            c.id.toString().endsWith('-top') ||
            c.id.toString().endsWith('-bottom')
        );

        if (insertionLine) {
            return [insertionLine];
        }

        const dropZone = pointerCollisions.find(c =>
            c.id.toString().endsWith('-drop')
        );

        if (dropZone) {
            return [dropZone];
        }

        const rootDrop = pointerCollisions.find(c => c.id === 'root-drop');
        if (rootDrop) {
            return [rootDrop];
        }

        return closestCenter(args);
    };

    // 拖放结束处理
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        if (over.id === 'root-drop') {
            const activeId = active.id.toString();
            const activeItem = commands.find(c => c.id === activeId);

            if (activeItem) {
                if (activeItem.parentId !== undefined) {
                    const hasCollision = commands.some(c =>
                        c.parentId === undefined &&
                        c.name === activeItem.name &&
                        c.id !== activeItem.id
                    );
                    if (hasCollision) {
                        showToast(t('toast.moveConflict', { name: activeItem.name }), 'warning');
                        return;
                    }
                }

                if (activeItem.parentId) {
                    updateEntity(activeItem.id, { parentId: undefined });
                } else {
                    const oldIndex = commands.findIndex(c => c.id === activeId);
                    const newIndex = commands.length - 1;
                    if (oldIndex !== newIndex) {
                        setAllCommands(arrayMove(commands, oldIndex, newIndex));
                    }
                }
            }
            return;
        }

        const activeId = active.id.toString();
        const overIdFull = over.id.toString();
        const isDropInto = overIdFull.endsWith('-drop');
        const isInsertTop = overIdFull.endsWith('-top');
        const isInsertBottom = overIdFull.endsWith('-bottom');
        const overIdClean = overIdFull.replace(/-drop|-top|-bottom/, '');

        if (activeId === overIdClean) return;

        const activeItem = commands.find(c => c.id === activeId);
        const overItem = commands.find(c => c.id === overIdClean);

        if (!activeItem || !overItem) return;

        let targetParentId: string | undefined = undefined;

        if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
            targetParentId = overItem.id;
        } else if (activeItem.parentId !== overItem.parentId) {
            targetParentId = overItem.parentId || undefined;
        }

        if (targetParentId !== activeItem.parentId) {
            const hasCollision = commands.some(c =>
                c.parentId === targetParentId &&
                c.name === activeItem.name &&
                c.id !== activeItem.id
            );
            if (hasCollision) {
                showToast(t('toast.moveConflict', { name: activeItem.name }), 'warning');
                return;
            }
        }

        if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
            updateEntity(activeItem.id, { parentId: overItem.id });
            return;
        }

        if (activeItem.parentId !== overItem.parentId) {
            let newCommands = [...commands];
            const activeIndex = newCommands.findIndex(c => c.id === activeId);
            const [movedItem] = newCommands.splice(activeIndex, 1);
            movedItem.parentId = overItem.parentId;
            const overIndex = newCommands.findIndex(c => c.id === overIdClean);
            let insertIndex = overIndex;
            if (isInsertBottom) insertIndex = overIndex + 1;
            newCommands.splice(insertIndex, 0, movedItem);
            setAllCommands(newCommands);
            return;
        }

        const activeIndex = commands.findIndex(c => c.id === activeId);
        const overIndex = commands.findIndex(c => c.id === overIdClean);
        let newCommands = [...commands];
        const [movedItem] = newCommands.splice(activeIndex, 1);
        const newOverIndex = newCommands.findIndex(c => c.id === overIdClean);
        let insertIndex = newOverIndex;
        if (isInsertBottom) insertIndex++;

        if (!isInsertTop && !isInsertBottom) {
            setAllCommands(arrayMove(commands, activeIndex, overIndex));
            return;
        }

        newCommands.splice(insertIndex, 0, movedItem);
        setAllCommands(newCommands);
    }, [commands, setAllCommands, updateEntity, showToast, t]);

    // 发送命令
    const handleSend = useCallback(async (cmd: CommandItem) => {
        const isEmpty = !cmd.payload?.trim() && (!cmd.tokens || Object.keys(cmd.tokens).length === 0);
        if (isEmpty) return;

        if (!activeSessionId) return;
        const session = sessions.find(s => s.id === activeSessionId);
        if (!session.isConnected) {
            if (activeSessionId) {
                try {
                    const success = await connectSession(activeSessionId);
                    if (success === true) {
                        return;
                    } else {
                        if (onNavigate) onNavigate('serial');
                        return;
                    }
                } catch (e) {
                    if (onNavigate) onNavigate('serial');
                    return;
                }
            } else {
                if (onNavigate) onNavigate('serial');
                return;
            }
        }

        try {
            const { data } = MessagePipeline.process(
                cmd.payload,
                cmd.html || null,
                cmd.mode,
                cmd.tokens,
                cmd.lineEnding || ''
            );
            if (!data || data.length === 0) return;

            let groupName = '';
            if (cmd.parentId) {
                const parent = commands.find(c => c.id === cmd.parentId);
                if (parent) groupName = parent.name;
            }
            const encodedName = `${cmd.name}::::${groupName}`;

            if (session.config.type === 'mqtt') {
                await publishMqtt(session.id, 'command', data, { qos: 0, retain: false, commandName: encodedName });
            } else {
                await writeToSession(session.id, data, { commandName: encodedName });
            }
        } catch (e) {
            console.error('Failed to send command', e);
        }
    }, [activeSessionId, sessions, writeToSession, publishMqtt, connectSession, commands, onNavigate]);

    return { customCollisionStrategy, handleDragEnd, handleSend };
};
