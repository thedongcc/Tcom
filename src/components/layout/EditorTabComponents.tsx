/**
 * EditorTabComponents.tsx
 * 编辑器区域的标签页和拖放相关子组件。
 * 从 EditorArea.tsx 中拆分出来。
 */
import React, { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';

// ── Composite ID 工具函数 ──
export const getCompositeId = (groupId: string, sessionId: string) => `${groupId}::${sessionId}`;
export const parseCompositeId = (id: string): { groupId: string, sessionId: string } | null => {
    if (!id || !id.includes('::')) return null;
    const parts = id.split('::');
    return { groupId: parts[0], sessionId: parts[1] };
};

// ── Tab 组件 ──
export interface TabProps {
    label: string;
    active?: boolean;
    isGroupActive?: boolean;
    unsaved?: boolean;
    onClose: (e: React.MouseEvent) => void;
    onClick: (e: React.MouseEvent) => void;
}

export const Tab = ({ label, active, isGroupActive, unsaved, onClose, onClick }: TabProps) => (
    <Tooltip content={label} position="bottom" wrapperClassName="h-full flex-shrink-0 min-w-0" className="max-w-[300px] whitespace-normal">
        <div
            onClick={onClick}
            className={`focus:outline-none outline-none
        h-full w-full px-3 min-w-[120px] max-w-[200px] flex items-center justify-between cursor-pointer border-r border-[var(--st-tab-border)] select-none group
        ${active
                    ? `bg-[var(--st-tab-active-bg)] ${isGroupActive ? 'text-[var(--st-tab-active-text)] shadow-[inset_0_2px_0_0_var(--accent-color)]' : 'text-[var(--input-placeholder-color)]'}`
                    : 'bg-[var(--st-tab-inactive-bg)] text-[var(--st-tab-inactive-text)] hover:bg-[var(--st-tab-active-bg)]'
                }
    `}
        >
            <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                <span className="text-[13px] truncate leading-none">{label}</span>
                {unsaved && <div className="w-2 h-2 rounded-full bg-white opacity-60 shrink-0"></div>}
            </div>
            <div className="flex items-center shrink-0 ml-2">
                <div
                    onClick={onClose}
                    className="p-0.5 rounded-md hover:bg-[var(--hover-background)] text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-panel-action-hover)]"
                >
                    <X size={14} />
                </div>
            </div>
        </div>
    </Tooltip>
);

// ── SortableTab 组件 ──
export const SortableTab = ({ id, ...props }: TabProps & { id: string }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform: _transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transition,
        opacity: 1,
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="h-full focus:outline-none outline-none">
            <Tab {...props} />
        </div>
    );
};

// ── GroupHeader 组件 ──
export interface GroupHeaderProps {
    group: { id: string };
    isActiveGroup: boolean;
    setActiveGroupId: (id: string) => void;
    children: ReactNode;
}

export const GroupHeader = ({ group, isActiveGroup, setActiveGroupId, children }: GroupHeaderProps) => {
    return (
        <div
            className={`relative z-50 flex h-9 bg-[var(--st-editor-tabs-bg)] border-b border-[var(--widget-border-color)] select-none items-center overflow-hidden ${isActiveGroup ? '' : 'opacity-80'}`}
            onClick={() => setActiveGroupId(group.id)}
        >
            {children}
        </div>
    );
};

// ── DropZone 组件 ──
export const DropZone = ({ id, className, activeClassName }: { id: string, className?: string, activeClassName?: string }) => {
    const { isOver, setNodeRef } = useDroppable({ id });
    const activeClass = activeClassName || 'bg-[var(--accent-color)] opacity-20';
    return (
        <div
            ref={setNodeRef}
            className={`${className} transition-colors ${isOver ? activeClass : 'bg-transparent'}`}
        />
    );
};

// ── HeaderDropZone 组件 ──
export const HeaderDropZone = ({ id, children, className }: { id: string, children: ReactNode, className?: string }) => {
    const { isOver: _isOver, setNodeRef } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`${className}`}
        >
            {children}
        </div>
    );
};

// ── DropIndicator 组件 ──
export const DropIndicator = () => (
    <div className="w-[3px] h-full bg-[var(--accent-color)] absolute z-[2000] pointer-events-none shadow-[0_0_4px_rgba(0,0,0,0.5)] transform -translate-x-1/2" />
);
