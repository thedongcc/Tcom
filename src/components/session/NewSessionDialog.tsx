import { useRef, useEffect } from 'react';
import { X, Network, FileText, Monitor, Cpu, Server, Activity } from 'lucide-react';
import { SessionType } from '../../types/session';
import { useI18n } from '../../context/I18nContext';

interface NewSessionDialogProps {
    onSelect: (type: SessionType) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

interface SessionTypeOption {
    type: SessionType;
    labelKey: string;
    descKey: string;
    icon: any;
}

const OPTIONS: SessionTypeOption[] = [
    { type: 'serial', labelKey: 'session.serial', descKey: 'session.serialDesc', icon: Cpu },
    { type: 'mqtt', labelKey: 'session.mqtt', descKey: 'session.mqttDesc', icon: Network },
    { type: 'monitor', labelKey: 'session.monitor', descKey: 'session.monitorDesc', icon: Activity },
];

export const NewSessionDialog = ({ onSelect, onClose, position }: NewSessionDialogProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const { t } = useI18n();

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
            className="fixed z-[1000] w-72 bg-[var(--menu-background)] border border-[var(--menu-border-color)] shadow-2xl rounded-md flex flex-col text-[var(--app-foreground)] animate-in fade-in zoom-in-95 duration-200"
            style={{ left: position.x, top: position.y }}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-color)] bg-[var(--widget-background)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--app-foreground)]">{t('session.newSession')}</span>
                <button
                    onClick={onClose}
                    className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            <div className="flex flex-col p-1.5 max-h-[400px] overflow-y-auto custom-scrollbar bg-[var(--app-background)]">
                {OPTIONS.map(opt => (
                    <div
                        key={opt.type}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--list-hover-background)] rounded-sm group transition-colors"
                        onClick={() => onSelect(opt.type)}
                    >
                        <div className="text-[var(--vscode-foreground)] opacity-70 group-hover:opacity-100 transition-opacity">
                            <opt.icon size={16} />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-medium leading-none">{t(opt.labelKey as any)}</span>
                            <span className="text-[10px] opacity-50 mt-1 truncate">{t(opt.descKey as any)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
