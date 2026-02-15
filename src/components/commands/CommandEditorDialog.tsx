import { useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CommandEntity, CommandItem } from '../../types/command';
import { SerialInput } from '../serial/SerialInput';
import { useToast } from '../../context/ToastContext';

interface Props {
    item: CommandEntity;
    onClose: () => void;
    onSave: (updates: Partial<CommandEntity>) => void;
    existingNames: string[];
}

export const CommandEditorDialog = ({ item, onClose, onSave, existingNames }: Props) => {
    const [name, setName] = useState(item.name);
    const { showToast } = useToast();
    // State to hold current input state from SerialInput
    const inputStateRef = useRef<{ content: string; html: string; tokens: any; mode: 'text' | 'hex'; lineEnding: any } | null>(null);

    // Initial state
    const isCommand = item.type === 'command';
    const commandItem = isCommand ? (item as CommandItem) : null;

    const handleSave = () => {
        if (!name.trim()) {
            showToast('Name cannot be empty', 'warning');
            return;
        }
        if (existingNames.includes(name.trim())) {
            showToast(`Name "${name}" already exists in this group.`, 'warning');
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

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onKeyDown={handleKeyDown}
            onClick={onClose} // Click backdrop to close
        >
            <div
                className="bg-[#252526] border border-[#3c3c3c] shadow-xl w-[600px] flex flex-col rounded-sm"
                tabIndex={-1}
                style={{ outline: 'none' }}
                onClick={(e) => {
                    // Prevent closing when clicking inside the dialog
                    e.stopPropagation();
                }}
            >
                <div className="flex items-center justify-between p-2 border-b border-[#3c3c3c]">
                    <span className="text-xs font-bold text-[#cccccc] uppercase">Edit {isCommand ? 'Command' : 'Group'}</span>
                    <button onClick={onClose} className="text-[#969696] hover:text-white">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696]">Name</label>
                        <input
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] rounded-sm px-2 py-1 outline-none focus:border-[var(--vscode-focusBorder)] text-xs"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {isCommand && commandItem && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-[#969696]">Content</label>
                            <SerialInput
                                onSend={() => { }} // We don't send from editor
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
                    )}
                </div>

                <div className="p-2 border-t border-[#3c3c3c] flex justify-end gap-2">
                    <button
                        className="px-3 py-1 text-xs text-[#cccccc] hover:bg-[#3c3c3c] rounded-sm"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="px-3 py-1 text-xs text-white bg-[#007acc] hover:bg-[#0098ff] rounded-sm"
                        onClick={handleSave}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
