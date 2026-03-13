import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CommandEntity, CommandGroup, CommandItem } from '../types/command';
import { useHistory } from '../hooks/useHistory';
import { useConfirm } from './ConfirmContext';
import { cloneRecursive, readCommandsFromFile, downloadCommandsAsJson } from '../hooks/useCommandActions';

const STORAGE_KEY = 'tcom-commands';

interface CommandContextType {
    commands: CommandEntity[];
    addGroup: (name: string, parentId?: string | null) => void;
    addCommand: (item: Omit<CommandItem, 'id' | 'type'>) => void;
    updateEntity: (id: string, updates: Partial<CommandEntity>) => void;
    deleteEntity: (id: string) => void;
    deleteEntities: (ids: string[]) => void;
    duplicateEntity: (id: string, newParentId?: string) => void;
    duplicateEntities: (ids: string[], newParentId?: string) => void;
    clearAll: () => void;
    setAllCommands: (newCommands: CommandEntity[]) => void;
    importCommands: () => void;
    exportCommands: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const CommandContext = createContext<CommandContextType | undefined>(undefined);

export const CommandProvider = ({ children }: { children: ReactNode }) => {
    const { confirm } = useConfirm();
    // using useHistory for Undo/Redo support
    const { state: commands, set: setCommands, undo, redo, canUndo, canRedo, reset } = useHistory<CommandEntity[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                reset(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to load commands', e);
            }
        }
        setIsLoaded(true);
    }, [reset]);

    // Save to local storage whenever commands change
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
        }
    }, [commands, isLoaded]);

    const addGroup = useCallback((name: string, parentId: string | null = null) => {
        const newGroup: CommandGroup = {
            id: `group-${Date.now()}`,
            type: 'group',
            name,
            parentId,
            isOpen: true
        };
        setCommands(prev => [...prev, newGroup]);
    }, [setCommands]);

    const addCommand = useCallback((item: Omit<CommandItem, 'id' | 'type'>) => {
        const newCommand: CommandItem = {
            ...item,
            id: `cmd-${Date.now()}`,
            type: 'command'
        };
        setCommands(prev => [...prev, newCommand]);
    }, [setCommands]);

    const updateEntity = useCallback((id: string, updates: Partial<CommandEntity>) => {
        setCommands(prev => prev.map(item => item.id === id ? { ...item, ...updates } as CommandEntity : item));
    }, [setCommands]);

    const deleteEntity = useCallback((id: string) => {
        deleteEntities([id]);
    }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

    const deleteEntities = useCallback((ids: string[]) => {
        setCommands(prev => {
            const allToDelete = new Set<string>();

            const collectDescendants = (parentId: string) => {
                const children = prev.filter(c => c.parentId === parentId);
                children.forEach(c => {
                    allToDelete.add(c.id);
                    if (c.type === 'group') {
                        collectDescendants(c.id);
                    }
                });
            };

            ids.forEach(id => {
                allToDelete.add(id);
                // Also delete descendants of groups
                const item = prev.find(p => p.id === id);
                if (item && item.type === 'group') {
                    collectDescendants(id);
                }
            });

            return prev.filter(c => !allToDelete.has(c.id));
        });
    }, [setCommands]);

    // 深复制
    const duplicateEntity = useCallback((id: string, newParentId?: string) => {
        setCommands(prev => {
            const itemToClone = prev.find(c => c.id === id);
            if (!itemToClone) return prev;

            const clones = cloneRecursive(
                itemToClone,
                newParentId !== undefined ? newParentId : itemToClone.parentId,
                prev,
                prev,
            );

            // 插入策略：分组或跨 parent 追加到末尾，同 parent 命令插入到原项后面
            const isCrossParent = newParentId !== undefined && newParentId !== itemToClone.parentId;
            if (itemToClone.type === 'group' || isCrossParent) {
                return [...prev, ...clones];
            }
            const index = prev.findIndex(c => c.id === id);
            if (index !== -1) {
                const newCommands = [...prev];
                newCommands.splice(index + 1, 0, ...clones);
                return newCommands;
            }
            return [...prev, ...clones];
        });
    }, [setCommands]);

    // 批量深复制（一次性在单个历史记录中完成，支持一次撤回）
    const duplicateEntities = useCallback((ids: string[], newParentId?: string) => {
        setCommands(prev => {
            let accumulated = [...prev];
            for (const id of ids) {
                const itemToClone = accumulated.find(c => c.id === id);
                if (!itemToClone) continue;
                const targetParent = newParentId !== undefined ? newParentId : itemToClone.parentId;
                const clones = cloneRecursive(itemToClone, targetParent, accumulated, prev);
                accumulated = [...accumulated, ...clones];
            }
            return accumulated;
        });
    }, [setCommands]);

    const clearAll = useCallback(async () => {
        const ok = await confirm({
            title: '清空指令',
            message: '确定要清空所有指令吗？此操作不可撤销。',
            type: 'danger',
            confirmText: '清空全部'
        });
        if (ok) {
            setCommands([]);
        }
    }, [confirm, setCommands]);

    const setAllCommands = useCallback((newCommands: CommandEntity[]) => {
        setCommands(newCommands);
    }, [setCommands]);

    const importCommands = useCallback(() => {
        readCommandsFromFile().then(imported => {
            if (!imported) return;
            confirm({
                title: '导入指令',
                message: '是否将导入的指令合并到现有列表中？点击取消将替换现有指令。',
                type: 'info',
                confirmText: '合并',
                cancelText: '替换'
            }).then(ok => {
                if (ok) {
                    setCommands(prev => [...prev, ...imported]);
                } else {
                    setCommands(imported);
                }
            });
        });
    }, [setCommands, confirm]);

    const exportCommands = useCallback(() => {
        downloadCommandsAsJson(commands);
    }, [commands]);

    const value = {
        commands,
        addGroup,
        addCommand,
        updateEntity,
        deleteEntity,
        deleteEntities,
        duplicateEntity,
        duplicateEntities,
        clearAll,
        setAllCommands,
        importCommands,
        exportCommands,
        undo,
        redo,
        canUndo,
        canRedo
    };

    return (
        <CommandContext.Provider value={value}>
            {children}
        </CommandContext.Provider>
    );
};

export const useCommandContext = () => {
    const context = useContext(CommandContext);
    if (!context) {
        throw new Error('useCommandContext must be used within a CommandProvider');
    }
    return context;
};
