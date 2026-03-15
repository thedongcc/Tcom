import { useState, useRef, useEffect } from 'react';
import { X, Maximize2, Trash2 } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { useI18n } from '../../context/I18nContext';

interface PanelProps {
    height?: number;
}

export const Panel = ({ height = 200 }: PanelProps) => {
    const { sessions, activeSessionId } = useSession();
    const activeSession = sessions.find(s => s.id === activeSessionId);
    const { t } = useI18n();

    const logs = activeSession ? activeSession.logs : [];
    const isConnected = activeSession ? activeSession.isConnected : false;
    const currentPort = activeSession
        ? (activeSession.config.type === 'serial'
            ? (activeSession.config as any).connection?.path
            : `${(activeSession.config as any).protocol}://${(activeSession.config as any).host}:${(activeSession.config as any).port}`)
        : '';

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="flex flex-col border-t border-[var(--border-color)] bg-[var(--panel-background)] shrink-0" style={{ height: `${height}px` }}>
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 h-[35px] select-none">
                <div className="flex items-center gap-6 h-full">
                    <div className="h-full flex items-center border-b border-[var(--st-accent)] text-[var(--st-panel-header-text)] font-medium text-[11px] uppercase tracking-wide cursor-pointer">
                        {t('panel.terminal')}
                    </div>
                </div>

                <div className="flex items-center gap-2 text-[var(--st-panel-muted-text)]">
                    <Trash2 size={14} className="cursor-pointer hover:text-[var(--st-panel-action-hover)]" />
                    <Maximize2 size={14} className="cursor-pointer hover:text-[var(--st-panel-action-hover)]" />
                    <X size={14} className="cursor-pointer hover:text-[var(--st-panel-action-hover)]" />
                </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-auto p-2 font-mono text-[13px] bg-[var(--st-terminal-bg)]" ref={scrollRef}>
                <div className="text-[var(--st-info-text)] mb-2">
                    {isConnected ? t('panel.connectedTo', { port: currentPort }) : t('panel.disconnected')}
                </div>
                {logs.length === 0 && <div className="text-[var(--st-info-text)] italic opacity-80">{t('panel.noData')}</div>}
                {logs.map((log, index) => (
                    <div key={index} className={`whitespace-pre-wrap break-all font-mono ${log.type === 'TX' ? 'text-[var(--st-tx-text)]' :
                        log.type === 'RX' ? 'text-[var(--st-rx-text)]' :
                            log.type === 'ERROR' ? 'text-[var(--st-error-text)]' :
                                'text-[var(--st-info-text)]'
                        }`}>
                        <span className="text-[var(--st-timestamp)] text-xs mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        {log.type === 'TX' ? '→ ' : log.type === 'RX' ? '← ' : ''}
                        {/* We always show string here for the mini-terminal, or we could use formatData similar to Monitor */}
                        {typeof log.data === 'string' ? log.data : new TextDecoder().decode(log.data)}
                    </div>
                ))}
            </div>

            {/* Input Area - Removed per user request */}
        </div>
    );
};
