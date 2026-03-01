import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SessionConfig, SessionType } from '../../types/session';
import { FolderOpen, Network, Cpu } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

import { SerialPortInfo } from '../../vite-env';
import { formatPortInfo } from '../../utils/format';
interface SessionListItemProps {
    session: SessionConfig;
    portInfo?: SerialPortInfo;
    isActive: boolean;
    isConnected: boolean;
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
    isConnected,
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

    const isPortBusy = !isConnected && portInfo?.busy;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`px-4 py-1.5 text-[13px] hover:bg-[var(--list-hover-background)] cursor-pointer flex items-center gap-2 group border-l-4 focus:outline-none outline-none ${isActive ? 'border-[var(--accent-color)] bg-[var(--list-active-background)]' : 'border-transparent'}`}
            onClick={onClick}
            onContextMenu={onContextMenu}
        >
            <span className={`${session.type === 'mqtt' ? 'text-[#4ec9b0]' : 'text-[#e8b575]'}`}>
                {getIconForType(session.type)}
            </span>

            {isEditing ? (
                <input
                    autoFocus
                    className="bg-[var(--input-background)] text-[13px] text-[var(--input-foreground)] border border-[var(--focus-border-color)] outline-none flex-1 min-w-0"
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
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="truncate font-medium">{session.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-hidden min-h-[16px]">
                        {session.type === 'serial' && portInfo && (
                            <span className="flex items-center justify-center flex-shrink-0 mb-[1.5px]">
                                <Tooltip content={isPortBusy ? `Occupied: ${portInfo.error || 'Accessed by another program'}` : (isConnected ? 'Connected' : 'Available')} position="top" wrapperClassName="flex items-center justify-center">
                                    <span
                                        className={`size-1.5 rounded-full ${isPortBusy ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]' : 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'}`}
                                    />
                                </Tooltip>
                            </span>
                        )}
                        <span className="text-[10px] text-[#858585] truncate font-mono opacity-80 leading-tight">
                            {session.type === 'serial'
                                ? (portInfo
                                    ? formatPortInfo(portInfo)
                                    : (session as any).lastDescription || (session as any).connection?.path || 'No Port')
                                : session.type === 'mqtt'
                                    ? ((session as any).host && (session as any).port ? `${(session as any).host}:${(session as any).port}` : 'Not Configured')
                                    : (session as any).brokerUrl || session.type}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};


