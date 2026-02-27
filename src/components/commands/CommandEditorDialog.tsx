import { useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CommandEntity, CommandItem } from '../../types/command';
import { SerialInput } from '../serial/SerialInput';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

interface Props {
    item: CommandEntity;
    onClose: () => void;
    onSave: (updates: Partial<CommandEntity>) => void;
    existingNames: string[];
}

export const CommandEditorDialog = ({ item, onClose, onSave, existingNames }: Props) => {
    const [name, setName] = useState(item.name);
    const { showToast } = useToast();
    const { t } = useI18n();
    // State to hold current input state from SerialInput
    const inputStateRef = useRef<{ content: string; html: string; tokens: any; mode: 'text' | 'hex'; lineEnding: any } | null>(null);

    // Initial state
    const isCommand = item.type === 'command';
    const commandItem = isCommand ? (item as CommandItem) : null;

    const handleSave = () => {
        if (!name.trim()) {
            showToast(t('toast.nameEmpty'), 'warning');
            return;
        }
        if (existingNames.includes(name.trim())) {
            showToast(t('toast.nameExists', { name }), 'warning');
            return;
        }

        const updates: Partial<CommandEntity> = { name: name.trim() };
        if (isCommand) {
            const cmdUpdates = updates as Partial<CommandItem>;
            if (inputStateRef.current) {
                cmdUpdates.payload = inputStateRef.current.content;
                cmdUpdates.html = inputStateRef.current.html;
                cmdUpdates.tokens = inputStateRef.current.tokens;
                cmdUpdates.mode = inputStateRef.current.mode;
                cmdUpdates.lineEnding = inputStateRef.current.lineEnding;
            } else if (commandItem) {
                // Fallback to existing item values if no interaction happened
                cmdUpdates.payload = commandItem.payload;
                cmdUpdates.html = commandItem.html;
                cmdUpdates.tokens = commandItem.tokens;
                cmdUpdates.mode = commandItem.mode;
                cmdUpdates.lineEnding = commandItem.lineEnding;
            }
        }
        onSave(updates);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const activeEl = document.activeElement;
        const isInInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';
        const isInContentEditable = activeEl?.getAttribute('contenteditable') === 'true';
        const isEditing = isInInput || isInContentEditable;

        // Save on Enter ONLY when not editing (clicked on background or dialog)
        if (e.key === 'Enter' && !isEditing) {
            e.preventDefault();
            handleSave();
            return;
        }

        // Save on Ctrl+Enter or Cmd+Enter (works anywhere, even in editor)
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSave();
            return;
        }

        // Close on Escape
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    // 标题文本：编辑命令 / 编辑分组
    const dialogTitle = isCommand ? t('command.editCommand') : t('command.editGroup');

    return (
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onKeyDown={handleKeyDown}
        /* 移除点击蒙版关闭行为 */
        >
            <div
                className="bg-[var(--app-background)] border border-[var(--widget-border-color)] shadow-2xl w-[600px] flex flex-col rounded-md overflow-hidden animate-in zoom-in-95 fade-in duration-300"
                tabIndex={-1}
                style={{ outline: 'none' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div className="flex items-center justify-between p-2.5 border-b border-[var(--widget-border-color)] bg-[var(--sidebar-background)]">
                    <span className="text-[11px] font-bold text-[var(--app-foreground)] uppercase tracking-wider">{dialogTitle}</span>
                    <button onClick={onClose} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors">
                        <X size={14} />
                    </button>
                </div>

                {/* 内容区 */}
                <div className="p-5 flex flex-col gap-5 bg-[var(--app-background)]">
                    {/* 命令名称 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wide">{t('command.commandName')}</label>
                        <input
                            className="bg-[var(--input-background)] border border-[var(--widget-border-color)] text-[var(--app-foreground)] rounded-sm px-3 py-1.5 outline-none focus:border-[var(--focus-border-color)] text-[13px] transition-all"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* 命令内容 - 仅命令类型显示 */}
                    {isCommand && commandItem && (
                        <div className="flex flex-col gap-1.5 pt-1">
                            <label className="text-[11px] font-bold text-[var(--activitybar-inactive-foreground)] uppercase tracking-wide">Content</label>
                            <div className="border border-[var(--widget-border-color)] rounded-sm bg-[var(--input-background)] p-1 shadow-inner">
                                <SerialInput
                                    onSend={() => { }} // 编辑器模式不发送
                                    initialContent={commandItem.payload}
                                    initialHTML={commandItem.html}
                                    initialTokens={commandItem.tokens}
                                    initialMode={commandItem.mode}
                                    initialLineEnding={commandItem.lineEnding}
                                    onStateChange={(state) => {
                                        inputStateRef.current = state;
                                    }}
                                    hideExtras
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="p-3 border-t border-[var(--widget-border-color)] flex justify-end gap-2 bg-[var(--sidebar-background)]">
                    <button
                        className="px-4 py-1.5 text-xs text-[var(--app-foreground)] hover:bg-[var(--hover-background)] rounded-sm transition-colors"
                        onClick={onClose}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        className="px-4 py-1.5 text-xs text-[var(--button-foreground)] bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] rounded-sm font-medium transition-all shadow-md active:scale-95"
                        onClick={handleSave}
                    >
                        {t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};
