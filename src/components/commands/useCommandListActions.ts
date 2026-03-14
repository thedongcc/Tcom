/**
 * useCommandListActions.ts
 * 命令列表的拖放逻辑和发送操作。
 * 从 CommandListSidebar.tsx 中拆分出来。
 *
 * 子模块：
 * - commandDragDrop.ts — 拖放处理纯函数（processRootDrop / processItemDrop）
 */
import { useCallback } from 'react';
import { DragEndEvent, CollisionDetection, closestCenter, pointerWithin } from '@dnd-kit/core';
import { CommandEntity, CommandItem } from '../../types/command';
import { MessagePipeline } from '../../services/MessagePipeline';
import { useToast } from '../../context/ToastContext';
import { useSession } from '../../context/SessionContext';
import { useI18n } from '../../context/I18nContext';
import { processRootDrop, processItemDrop, DragResult } from './commandDragDrop';

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
            c.id.toString().endsWith('-top') || c.id.toString().endsWith('-bottom')
        );
        if (insertionLine) return [insertionLine];

        const dropZone = pointerCollisions.find(c => c.id.toString().endsWith('-drop'));
        if (dropZone) return [dropZone];

        const rootDrop = pointerCollisions.find(c => c.id === 'root-drop');
        if (rootDrop) return [rootDrop];

        return closestCenter(args);
    };

    // 执行拖放结果
    const applyDragResult = useCallback((result: DragResult) => {
        switch (result.type) {
            case 'update':
                updateEntity(result.id, result.updates);
                break;
            case 'reorder':
                setAllCommands(result.newCommands);
                break;
            case 'conflict':
                showToast(t('toast.moveConflict', { name: result.name }), 'warning');
                break;
            case 'noop':
                break;
        }
    }, [updateEntity, setAllCommands, showToast, t]);

    // 拖放结束处理（委托给纯函数）
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id.toString();
        const result = over.id === 'root-drop'
            ? processRootDrop(commands, activeId)
            : processItemDrop(commands, activeId, over.id.toString());
        applyDragResult(result);
    }, [commands, applyDragResult]);

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
