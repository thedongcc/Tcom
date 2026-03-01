import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Play, FileText, GripVertical } from 'lucide-react';
import { CommandItem } from '../../types/command';
import { useToast } from '../../context/ToastContext';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';

interface Props {
    item: CommandItem;
    onEdit: (item: CommandItem) => void;
    onSend: (item: CommandItem) => void;
    onContextMenu: (e: React.MouseEvent, item: CommandItem) => void;
    disabled?: boolean;
    selected?: boolean;
    onSelect?: (e: React.MouseEvent) => void;
}

export const CommandItemComponent = ({ item, onEdit, onSend, onContextMenu, disabled, selected, onSelect }: Props) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    // 将 item.html 解析成包含占位符可读标签的预览字符串
    const buildPreview = (item: any): string => {
        if (!item.html) return item.payload || '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(item.html, 'text/html');
            let result = '';
            doc.body.childNodes.forEach((node: any) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    result += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // 递归处理 p / div 包裹
                    const process = (el: Element) => {
                        el.childNodes.forEach((child: any) => {
                            if (child.nodeType === Node.TEXT_NODE) {
                                result += child.textContent;
                            } else if (child.nodeType === Node.ELEMENT_NODE) {
                                const tokenType = child.getAttribute?.('data-token-type');
                                if (tokenType) {
                                    // 解析 token config
                                    let label = '';
                                    try {
                                        const configRaw = child.getAttribute('data-token-config');
                                        const cfg = configRaw ? JSON.parse(decodeURIComponent(configRaw)) : {};
                                        if (tokenType === 'crc') {
                                            label = cfg.algorithm === 'modbus-crc16' ? '[CRC16-Modbus]'
                                                : cfg.algorithm === 'ccitt-crc16' ? '[CRC16-CCITT]'
                                                    : `[CRC:${cfg.algorithm || ''}]`;
                                        } else if (tokenType === 'flag') {
                                            const hex = cfg.hex || '';
                                            label = cfg.name ? `[${cfg.name}:${hex}]` : `[Custom:${hex}]`;
                                        } else if (tokenType === 'timestamp') {
                                            label = cfg.format === 'milliseconds' ? '[Time:ms]' : '[Time:s]';
                                        } else if (tokenType === 'auto_inc') {
                                            label = `[Auto:${cfg.defaultValue || '00'}]`;
                                        } else {
                                            label = `[${tokenType}]`;
                                        }
                                    } catch {
                                        label = `[${tokenType}]`;
                                    }
                                    result += label;
                                } else {
                                    process(child);
                                }
                            }
                        });
                    };
                    process(node);
                }
            });
            return result.trim() || item.payload || '';
        } catch {
            return item.payload || '';
        }
    };

    // Standard Sortable (for dragging THIS item)
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.id });

    // Sub-Droppables for Top/Bottom Line detection
    // Note: We don't need 'data' here unless we use it in global CollisionStrategy,
    // but the simple 'isOver' local state is enough for visual feedback!
    const { setNodeRef: setTopRef, isOver: isOverTop } = useDroppable({
        id: `${item.id}-top`,
        data: { type: 'item-top', item }
    });

    const { setNodeRef: setBottomRef, isOver: isOverBottom } = useDroppable({
        id: `${item.id}-bottom`,
        data: { type: 'item-bottom', item }
    });

    const style = {
        // DISABLE transform for vertical axis to prevent shifting (File explorer style)
        // Keep scale/z-index if needed (but usually sortable handles z-index via overlay)
        // We only apply transform if dragging (or maybe just opacity)
        // Actually, if we disable transform, visual sorting stops.
        // We use opacity 0 for the "ghost" effectively.
        transform: CSS.Transform.toString(transform), // Wait, if I keep this, list moves. 
        // User wants LINE, implying NO SHIFT.
        // So: remove transform.
        // transform: undefined, 
        transition,
        opacity: isDragging ? 0.3 : 1
    };

    // However, if I remove transform, dnd-kit assumes I am rendering list as is.
    // The "Placeholder" will basically be "in place" if I sort? 
    // No, if I don't move items, the gap doesn't open.
    // That's exactly what we want.

    return (
        <div
            ref={setNodeRef}
            style={{ ...style, transform: undefined }} // Explicitly disable transform
            className={`group relative flex items-center gap-2 p-1.5 border border-transparent rounded-sm select-none ${selected
                ? 'bg-[var(--list-active-background)] text-[var(--app-foreground)] border-[var(--focus-border-color)]'
                : 'bg-[var(--widget-background)] hover:bg-[var(--list-hover-background)] hover:border-[var(--focus-border-color)] text-[var(--app-foreground)]'
                }`}
            onClick={onSelect}
            onDoubleClick={(e) => { e.stopPropagation(); onEdit(item); }}
            onContextMenu={(e) => onContextMenu(e, item)}
        >
            {/* Top Drop Zone & Line */}
            <div ref={setTopRef} className="absolute top-0 left-0 right-0 h-1/2 z-10 pointer-events-none group-hover/drag:pointer-events-auto" />
            {isOverTop && !isDragging && (
                <div className="absolute top-[-1px] left-0 right-0 h-[2px] bg-[var(--accent-color)] z-20 pointer-events-none shadow-[0_0_4px_var(--accent-color)]" />
            )}

            {/* Bottom Drop Zone & Line */}
            <div ref={setBottomRef} className="absolute bottom-0 left-0 right-0 h-1/2 z-10 pointer-events-none group-hover/drag:pointer-events-auto" />
            {isOverBottom && !isDragging && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent-color)] z-20 pointer-events-none shadow-[0_0_4px_var(--accent-color)]" />
            )}

            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="text-[var(--activitybar-inactive-foreground)] cursor-grab active:cursor-grabbing hover:text-[var(--app-foreground)] opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <GripVertical size={12} />
            </div>

            {/* Icon */}
            <div className="text-[var(--st-token-crc)]">
                <FileText size={14} />
            </div>

            {/* Name */}
            <Tooltip content={buildPreview(item)} position="top" wrapperClassName={`flex-1 min-w-0 ${selected ? 'text-[var(--app-foreground)]' : 'text-[var(--app-foreground)]'}`}>
                <div className={`text-[13px] truncate font-medium`}>
                    {item.name}
                </div>
            </Tooltip>

            {/* Send Button */}
            <div className={`transition-opacity relative z-20 ${disabled || (!item.payload && (!item.tokens || Object.keys(item.tokens).length === 0)) ? 'opacity-0 group-hover:opacity-40' : 'opacity-0 group-hover:opacity-100'}`}>
                <Tooltip content={disabled ? t('command.connectToSend') : t('command.sendCommand')} position="bottom" wrapperClassName="flex items-center">
                    <button
                        className={`p-1 rounded transition-colors ${disabled || (!item.payload && (!item.tokens || Object.keys(item.tokens).length === 0))
                            ? 'text-[var(--activitybar-inactive-foreground)] hover:bg-[var(--hover-background)] hover:text-[var(--app-foreground)] cursor-not-allowed'
                            : 'hover:bg-[var(--button-hover-background)] text-[var(--app-foreground)] hover:text-[var(--button-foreground)]'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            // Always allow click, parent handles auto-connect logic
                            // But if empty, parent handles blocking too.
                            const isEmpty = !item.payload && (!item.tokens || Object.keys(item.tokens).length === 0);
                            if (isEmpty) {
                                showToast('发送内容不能为空', 'warning');
                                return;
                            }

                            console.log('Send button clicked via UI', item.name);
                            onSend(item);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                    >
                        <Play size={12} fill="currentColor" />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};
