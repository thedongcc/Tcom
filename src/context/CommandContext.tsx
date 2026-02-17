import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CommandEntity, CommandGroup, CommandItem } from '../types/command';
import { useHistory } from '../hooks/useHistory';
import { useConfirm } from './ConfirmContext';

const STORAGE_KEY = 'tcom-commands';

interface CommandContextType {
    commands: CommandEntity[];
    addGroup: (name: string, parentId?: string | null) => void;
    addCommand: (item: Omit<CommandItem, 'id' | 'type'>) => void;
    updateEntity: (id: string, updates: Partial<CommandEntity>) => void;
    deleteEntity: (id: string) => void;
    deleteEntities: (ids: string[]) => void;
    duplicateEntity: (id: string, newParentId?: string) => void;
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

    // Deep duplicate
    const duplicateEntity = useCallback((id: string, newParentId?: string) => {
        setCommands(prev => {
            const itemToClone = prev.find(c => c.id === id);
            if (!itemToClone) return prev;

            // Recursive Cloner
            const cloneRecursive = (item: CommandEntity, parentId: string | null): CommandEntity[] => {
                const newId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

                // Deep Copy Object
                // Note: command tokens or other nested objects need explicit copy if not primitive
                let clone = { ...item, id: newId, parentId };

                if (clone.type === 'command') {
                    const cmd = clone as CommandItem;
                    if (cmd.tokens) {
                        // deep copy tokens
                        clone = { ...clone, tokens: JSON.parse(JSON.stringify(cmd.tokens)) } as CommandItem;
                    }
                }

                let result = [clone];

                // If group, find children and clone them
                if (item.type === 'group') {
                    const children = prev.filter(c => c.parentId === item.id);
                    children.forEach(child => {
                        result = [...result, ...cloneRecursive(child, newId)];
                    });
                }
                return result;
            };

            const clones = cloneRecursive(itemToClone, newParentId !== undefined ? newParentId : itemToClone.parentId);

            // Determine insertion strategy
            // 1. Groups: Always append to end (User preference for ordering)
            // 2. Cross-parent paste: Append to end (Avoid confusion with source index)
            // 3. Same-parent Command: Insert adjacent (Standard duplicate behavior)

            const isCrossParent = newParentId !== undefined && newParentId !== itemToClone.parentId;

            if (itemToClone.type === 'group' || isCrossParent) {
                return [...prev, ...clones];
            }

            // Insert after the original item (for better UX)
            const index = prev.findIndex(c => c.id === id);
            if (index !== -1) {
                const newCommands = [...prev];
                newCommands.splice(index + 1, 0, ...clones);
                return newCommands;
            }

            return [...prev, ...clones];
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
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string);
                    if (Array.isArray(imported)) {
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
                    } else {
                        alert('Invalid format');
                    }
                } catch (e) {
                    alert('Failed to parse file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, [setCommands]);

    const exportCommands = useCallback(() => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(commands, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "serial_tool_commands.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }, [commands]);

    const value = {
        commands,
        addGroup,
        addCommand,
        updateEntity,
        deleteEntity,
        deleteEntities,
        duplicateEntity,
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
