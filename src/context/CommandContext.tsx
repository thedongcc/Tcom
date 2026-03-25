import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { CommandEntity, CommandGroup, CommandItem } from '../types/command';
import { useHistory } from '../hooks/useHistory';
import { useConfirm } from './ConfirmContext';
import { useI18n } from './I18nContext';
import { useProfile } from './ProfileContext';
import { cloneRecursive, readCommandsFromFile, downloadCommandsAsJson } from '../hooks/useCommandActions';
import { flushRegistry } from '../hooks/useFlushOnExit';

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
    const { t } = useI18n();
    const { activeProfile, isLoaded: profileLoaded } = useProfile();
    // 使用 useHistory 支持 Undo/Redo
    const { state: commands, set: setCommands, undo, redo, canUndo, canRedo, reset } = useHistory<CommandEntity[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

    // 从 Profile 文件加载命令菜单数据
    useEffect(() => {
        if (!profileLoaded) return;
        let cancelled = false;

        const load = async () => {
            try {
                const res = await window.profileAPI?.getCommands(activeProfile);
                if (cancelled) return;
                if (res?.success && Array.isArray(res.data)) {
                    reset(res.data as CommandEntity[]);
                } else {
                    reset([]);
                }
            } catch (e) {
                console.error('加载命令菜单失败:', e);
                if (!cancelled) reset([]);
            }
            if (!cancelled) setIsLoaded(true);
        };
        setIsLoaded(false);
        load();
        return () => { cancelled = true; };
    }, [activeProfile, profileLoaded, reset]);

    // 防抖保存到 Profile 文件（数据变更后 500ms 写盘）
    useEffect(() => {
        if (!isLoaded) return;

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
            window.profileAPI?.saveCommands(activeProfile, commands).catch(e => {
                console.error('保存命令菜单失败:', e);
            });
        }, 500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [commands, isLoaded, activeProfile]);

    // 注册 Flush 回调（窗口关闭前立即保存防抖中的数据）
    useEffect(() => {
        const flush = async () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = undefined;
            }
            if (isLoaded) {
                await window.profileAPI?.saveCommands(activeProfile, commands);
            }
        };
        flushRegistry.register(flush);
        return () => { flushRegistry.unregister(flush); };
    }, [commands, isLoaded, activeProfile]);

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

    // 批量深复制
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
            title: t('command.clearAllTitle'),
            message: t('command.clearAllMessage'),
            type: 'danger',
            confirmText: t('command.clearAllConfirm')
        });
        if (ok) {
            setCommands([]);
        }
    }, [confirm, setCommands, t]);

    const setAllCommands = useCallback((newCommands: CommandEntity[]) => {
        setCommands(newCommands);
    }, [setCommands]);

    const importCommands = useCallback(() => {
        readCommandsFromFile().then(imported => {
            if (!imported) return;
            confirm({ title: t('command.importTitle'), message: t('command.importMessage'), type: 'info', confirmText: t('command.importMerge'), cancelText: t('command.importReplace') })
                .then(ok => setCommands(prev => ok ? [...prev, ...imported] : imported));
        });
    }, [setCommands, confirm, t]);

    const exportCommands = useCallback(() => {
        downloadCommandsAsJson(commands);
    }, [commands]);

    return (
        <CommandContext.Provider value={{
            commands, addGroup, addCommand, updateEntity, deleteEntity, deleteEntities,
            duplicateEntity, duplicateEntities, clearAll, setAllCommands, importCommands,
            exportCommands, undo, redo, canUndo, canRedo
        }}>
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
