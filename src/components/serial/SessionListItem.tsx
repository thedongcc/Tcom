import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SessionConfig, SessionType } from '../../types/session';
import { FolderOpen, Network, Cpu } from 'lucide-react';

import { SerialPortInfo } from '../../vite-env';
import { formatPortInfo } from '../../utils/format';
interface SessionListItemProps {
    session: SessionConfig;
    portInfo?: SerialPortInfo;
    isActive: boolean;
    isEditing: boolean;
    editName: string;
    onEditNameChange: (name: string) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onClick: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

const getIconForType = (type: SessionType) => {
    switch (type) {
        case 'mqtt': return <Network size={14} />;
        case 'serial': return <Cpu size={14} />;
        default: return <FolderOpen size={14} />;
    }
};

export const SessionListItem = ({
    session,
    portInfo,
    isActive,
    isEditing,
    editName,
    onEditNameChange,
    onSaveEdit,
    onCancelEdit,
    onClick,
    onContextMenu
}: SessionListItemProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: session.id, disabled: isEditing });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`px-4 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center gap-2 group border-l-4 ${isActive ? 'border-[var(--vscode-accent)] bg-[var(--vscode-list-active)]' : 'border-transparent'}`}
            onClick={onClick}
            onContextMenu={onContextMenu}
            title="Click to open, Right-click for options. Drag to reorder."
        >
            <span className={`${session.type === 'mqtt' ? 'text-[#4ec9b0]' : 'text-[#e8b575]'}`}>
                {getIconForType(session.type)}
            </span>

            {isEditing ? (
                <input
                    autoFocus
                    className="bg-[var(--vscode-input-bg)] text-[13px] text-[var(--vscode-input-fg)] border border-[var(--vscode-focusBorder)] outline-none flex-1 min-w-0"
                    value={editName}
                    onChange={(e) => onEditNameChange(e.target.value)}
                    onBlur={onSaveEdit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onSaveEdit();
                        if (e.key === 'Escape') onCancelEdit();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                />
            ) : (
                <div className="flex flex-col overflow-hidden flex-1">
                    <span className="truncate font-medium">{session.name}</span>
                    <span className="text-[10px] text-[#858585] truncate">
                        {session.type === 'serial'
                            ? (portInfo
                                ? formatPortInfo(portInfo)
                                : (session as any).lastDescription || (session as any).connection?.path || 'No Port')
                            : session.type === 'mqtt'
                                ? ((session as any).host && (session as any).port ? `${(session as any).host}:${(session as any).port}` : 'Not Configured')
                                : (session as any).brokerUrl || session.type}
                    </span>
                </div>
            )}
        </div>
    );
};


