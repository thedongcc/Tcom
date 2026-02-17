import { useRef, useEffect } from 'react';
import { X, Network, FileText, Monitor, Cpu, Server, Activity } from 'lucide-react';
import { SessionType } from '../../types/session';

interface NewSessionDialogProps {
    onSelect: (type: SessionType) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

interface SessionTypeOption {
    type: SessionType;
    label: string;
    icon: any;
    description: string;
}

const OPTIONS: SessionTypeOption[] = [
    { type: 'serial', label: 'Serial Port', icon: Cpu, description: 'Connect to COM ports' },
    { type: 'mqtt', label: 'MQTT Client', icon: Network, description: 'Subscribe/Publish to brokers' },
    { type: 'tcp', label: 'TCP Client', icon: Server, description: 'Raw TCP socket connection' },
    { type: 'udp', label: 'UDP Socket', icon: Network, description: 'Datagram communication' },
    { type: 'ssh', label: 'SSH Terminal', icon: Monitor, description: 'Secure Shell connection' },
    { type: 'monitor', label: 'Serial Monitor', icon: Activity, description: 'Bridge & Monitor Serial Ports' },
    { type: 'file', label: 'File Monitor', icon: FileText, description: 'Watch and read files' },
];

export const NewSessionDialog = ({ onSelect, onClose, position }: NewSessionDialogProps) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="fixed z-50 w-64 bg-[#252526] border border-[var(--vscode-widget-border)] shadow-xl rounded-md flex flex-col text-[var(--vscode-fg)] animate-fade-in"
            style={{ left: position.x, top: position.y }}
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-border)] bg-[#2d2d2d]">
                <span className="text-xs font-bold uppercase tracking-wide">New Session</span>
                <X size={14} className="cursor-pointer hover:text-white" onClick={onClose} />
            </div>

            <div className="flex flex-col p-1 max-h-[300px] overflow-y-auto">
                {OPTIONS.map(opt => (
                    <div
                        key={opt.type}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--vscode-list-hover)] rounded-sm group"
                        onClick={() => onSelect(opt.type)}
                    >
                        <div className="text-[var(--vscode-foreground)] opacity-70 group-hover:opacity-100">
                            <opt.icon size={16} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[13px] font-medium">{opt.label}</span>
                            <span className="text-[10px] opacity-60">{opt.description}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
