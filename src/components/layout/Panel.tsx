import { useState, useRef, useEffect } from 'react';
import { X, Maximize2, Trash2 } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';

interface PanelProps {
    sessionManager: ReturnType<typeof useSessionManager>;
    height?: number;
}

export const Panel = ({ sessionManager, height = 200 }: PanelProps) => {
    const { sessions, activeSessionId } = sessionManager;
    const activeSession = sessions.find(s => s.id === activeSessionId);

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
        <div className="flex flex-col border-t border-[var(--vscode-border)] bg-[var(--vscode-panel)] shrink-0" style={{ height: `${height}px` }}>
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 h-[35px] select-none">
                <div className="flex items-center gap-6 h-full">
                    <div className="h-full flex items-center border-b border-[var(--vscode-accent)] text-[var(--vscode-fg)] font-medium text-[11px] uppercase tracking-wide cursor-pointer">
                        Terminal
                    </div>
                </div>

                <div className="flex items-center gap-2 text-[#969696]">
                    <Trash2 size={14} className="cursor-pointer hover:text-[var(--vscode-fg)]" />
                    <Maximize2 size={14} className="cursor-pointer hover:text-[var(--vscode-fg)]" />
                    <X size={14} className="cursor-pointer hover:text-[var(--vscode-fg)]" />
                </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-auto p-2 font-mono text-[13px] bg-[var(--vscode-bg)]" ref={scrollRef}>
                <div className="text-[#969696] mb-2">
                    {isConnected ? `[Connected to ${currentPort}]` : '[Disconnected]'}
                </div>
                {logs.length === 0 && <div className="text-[#666] italic">No data received yet...</div>}
                {logs.map((log, index) => (
                    <div key={index} className={`whitespace-pre-wrap break-all font-mono ${log.type === 'TX' ? 'text-[#ce9178]' :
                        log.type === 'RX' ? 'text-[#6a9955]' :
                            log.type === 'ERROR' ? 'text-[#f48771]' :
                                'text-[#969696]'
                        }`}>
                        <span className="text-[#569cd6] text-xs mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
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
