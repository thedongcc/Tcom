import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Folder, ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import { CommandGroup, CommandEntity } from '../../types/command';
import { useState, useEffect, useRef } from 'react';
import { CommandList } from './CommandList';
import { useCommandManager } from '../../hooks/useCommandManager';

interface Props {
    group: CommandGroup;
    onEdit: (item: CommandEntity) => void;
    onSend: (item: CommandEntity) => void;
    onContextMenu: (e: React.MouseEvent, item: CommandEntity) => void;
    canSend: boolean;
    selectedIds: Set<string>;
    onSelect: (e: React.MouseEvent, item: CommandEntity) => void;
}

export const CommandGroupComponent = ({ group, onEdit, onSend, onContextMenu, canSend, selectedIds, onSelect }: Props) => {
    const { commands, updateEntity } = useCommandManager();
    const wasAutoOpened = useRef(false);

    const {
        attributes,
        listeners,
        setNodeRef: setSortableRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: group.id });

    // Group Drop Zone - APPLIED TO HEADER ONLY Now
    // This allows dragging children "out" to the side or bottom without hitting the group container
    const { setNodeRef: setDroppableRef, isOver: isOverGroup } = useDroppable({
        id: `${group.id}-drop`,
        data: { type: 'group-drop', group }
    });

    // Top/Bottom Drop Zones (For Sorting the Group Itself)
    const { setNodeRef: setTopRef, isOver: isOverTop } = useDroppable({
        id: `${group.id}-top`,
        data: { type: 'group-top', group }
    });

    const { setNodeRef: setBottomRef, isOver: isOverBottom } = useDroppable({
        id: `${group.id}-bottom`,
        data: { type: 'group-bottom', group }
    });

    const style = {
        transform: undefined,
        transition,
        opacity: isDragging ? 0.3 : 1
    };

    const isOpen = group.isOpen ?? true;
    const children = commands.filter(c => c.parentId === group.id);

    const toggleOpen = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        updateEntity(group.id, { isOpen: !isOpen });
    };

    // Auto-Expand / Auto-Collapse Logic
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isOverGroup && !isDragging) {
            // Expand after delay if closed
            if (!isOpen) {
                timer = setTimeout(() => {
                    updateEntity(group.id, { isOpen: true });
                    wasAutoOpened.current = true;
                }, 600); // 600ms hover
            }
        } else {
            if (wasAutoOpened.current && !isOverGroup && !isDragging) {
                updateEntity(group.id, { isOpen: false });
                wasAutoOpened.current = false;
            }
        }
        return () => clearTimeout(timer);
    }, [isOverGroup, isOpen, isDragging, group.id, updateEntity]);

    return (
        <div
            ref={setSortableRef} // Sortable Ref generally on container so we can drag the whole group
            style={style}
            className="flex flex-col relative"
            onContextMenu={(e) => onContextMenu(e, group)}
        >
            {/* 
               Visual Wrapper 
               We Highlight this wrapper if Header is hovered (isOverGroup)
            */}
            <div
                className={`flex flex-col rounded-sm transition-colors duration-200 ${isOverGroup && !isDragging ? 'bg-[#2a2d2e] ring-1 ring-[#007acc]' : ''}`}
            >
                {/* 
                   Header Section - THIS IS THE DROP ZONE 
                */}
                <div
                    ref={setDroppableRef}
                    className="relative"
                >
                    {/* Top Sort Zone (Highest z-index within header) */}
                    <div ref={setTopRef} className="absolute top-0 left-0 right-0 h-1/4 z-10" />
                    {isOverTop && !isDragging && (
                        <div className="absolute top-[-1px] left-0 right-0 h-[2px] bg-[#007acc] z-20 shadow-[0_0_4px_#007acc]" />
                    )}

                    {/* Bottom Sort Zone */}
                    <div ref={setBottomRef} className="absolute bottom-0 left-0 right-0 h-1/4 z-10" />
                    {isOverBottom && !isDragging && (
                        <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#007acc] z-20 shadow-[0_0_4px_#007acc]" />
                    )}

                    {/* 
                        Header Content 
                    */}
                    <div
                        className={`flex items-center gap-2 p-1.5 border border-transparent rounded-sm cursor-pointer select-none relative z-20 ${selectedIds.has(group.id) ? 'bg-[#094771] text-white' : 'hover:bg-[#2a2d2e] hover:border-[#3c3c3c]'
                            }`}
                        onClick={(e) => onSelect(e, group)}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            toggleOpen();
                        }}
                    >
                        <div {...attributes} {...listeners} className={`cursor-grab active:cursor-grabbing ${selectedIds.has(group.id) ? 'text-white' : 'text-[#666] hover:text-[#999]'}`}>
                            <GripVertical size={12} />
                        </div>

                        <div
                            className="cursor-pointer p-0.5 rounded hover:bg-black/10"
                            onClick={toggleOpen}
                        >
                            <div className={selectedIds.has(group.id) ? 'text-white' : 'text-[#dcb67a]'}>
                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 flex-1 overflow-hidden">
                            <div className={selectedIds.has(group.id) ? 'text-white' : 'text-[#dcb67a]'}>
                                <Folder size={14} fill="currentColor" fillOpacity={0.2} />
                            </div>
                            <div className={`flex-1 text-[13px] font-bold truncate ${selectedIds.has(group.id) ? 'text-white' : 'text-[#cccccc]'}`}>
                                {group.name}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Nested List - NOT part of Drop Zone anymore */}
                {isOpen && children.length > 0 && (
                    <div className="pl-4 border-l border-[#3c3c3c] ml-2 pb-1">
                        <CommandList
                            items={children}
                            onEdit={onEdit}
                            onSend={onSend}
                            onContextMenu={onContextMenu}
                            dropIndicator={null}
                            canSend={canSend}
                            selectedIds={selectedIds}
                            onSelect={onSelect}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
