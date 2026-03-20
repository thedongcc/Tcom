import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SessionConfig, SessionType } from '../../types/session';
import { FolderOpen, Network, Cpu } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

import { SerialPortInfo } from '../../vite-env';
import { formatPortInfo } from '../../utils/format';
import { useI18n } from '../../context/I18nContext';
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
    const { t } = useI18n();
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
            className={`px-4 py-1.5 text-[13px] bg-[var(--st-list-item-bg,transparent)] text-[var(--session-item-foreground,inherit)] hover:bg-[var(--session-item-hover-bg)] cursor-pointer flex items-center gap-2 group border-l-4 focus:outline-none outline-none ${isActive ? 'border-[var(--session-item-active-border)] bg-[var(--session-item-active-bg)]' : 'border-transparent'}`}
            onClick={onClick}
            onContextMenu={onContextMenu}
            data-component="session-list-item"
        >
            <span className={`${session.type === 'mqtt' ? 'text-[var(--st-config-success-text)]' : 'text-[var(--st-session-serial-text)]'}`}>
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
                                <Tooltip content={isPortBusy ? t('session.portOccupied', { error: portInfo.error || t('session.portOccupiedDefault') }) : (isConnected ? t('session.portConnected') : t('session.portAvailable'))} position="top" wrapperClassName="flex items-center justify-center">
                                    <span
                                        className={`size-1.5 rounded-full ${isPortBusy ? 'bg-[var(--st-status-error)] shadow-[0_0_4px_var(--st-status-error)]' : 'bg-[var(--st-status-success)] shadow-[0_0_4px_var(--st-status-success)]'}`}
                                    />
                                </Tooltip>
                            </span>
                        )}
                        <span className="text-[10px] text-[var(--st-config-muted-text)] truncate font-mono opacity-80 leading-tight">
                            {session.type === 'serial'
                                ? (portInfo
                                    ? formatPortInfo(portInfo)
                                    : (session.type === 'serial' ? (session.lastDescription || session.connection?.path || t('session.noPort')) : t('session.noPort')))
                                : session.type === 'mqtt'
                                    ? (session.host && session.port ? `${session.host}:${session.port}` : t('session.notConfigured'))
                                    : session.type}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};


