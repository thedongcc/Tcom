import { useState, useEffect } from 'react';
import { RefreshCw, Save, FolderOpen, Play, Square } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { SerialSessionConfig, MqttSessionConfig } from '../../types/session';
import { MqttConfigPanel } from '../mqtt/MqttConfigPanel';
import { MonitorConfigPanel } from '../serial-monitor/MonitorConfig';

interface ConfigSidebarProps {
    sessionManager: ReturnType<typeof useSessionManager>;
}

// Extracted Serial Panel
const SerialConfigPanel = ({ session, sessionManager }: { session: any, sessionManager: ReturnType<typeof useSessionManager> }) => {
    const { config, isConnected, isConnecting } = session;
    const { connection, txCRC, rxCRC } = config as SerialSessionConfig;

    const { updateSessionConfig, connectSession, disconnectSession, listPorts, ports } = sessionManager;
    const uiState = (config as any).uiState || {};
    const [highlight, setHighlight] = useState(false);

    useEffect(() => {
        if (uiState.highlightConnect) {
            setHighlight(true);
            const t = setTimeout(() => setHighlight(false), 1500);
            return () => clearTimeout(t);
        }
    }, [uiState.highlightConnect]);

    const handleToggleConnection = () => {
        if (isConnected) {
            disconnectSession(session.id);
        } else {
            if (connection.path) {
                connectSession(session.id);
            }
        }
    };

    const updateConnection = (updates: Partial<typeof connection>) => {
        updateSessionConfig(session.id, { connection: { ...connection, ...updates } });
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            <div className="px-4 py-2 border-b border-[var(--vscode-border)] bg-[#252526] text-[11px] font-bold text-[#cccccc] uppercase tracking-wide">
                <span>Settings</span>
                {session.unsaved && <span className="ml-2 w-2 h-2 rounded-full bg-white opacity-50 inline-block" title="Unsaved changes"></span>}
            </div>

            <div className="px-4 py-2 flex flex-col gap-3">
                {/* Port Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696] flex justify-between">
                        Port
                        <button onClick={listPorts} className="hover:text-white" title="Refresh Ports">
                            <RefreshCw size={12} />
                        </button>
                    </label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={connection.path}
                        onChange={(e) => updateConnection({ path: e.target.value })}
                        disabled={isConnected}
                    >
                        <option value="" disabled>Select Port</option>
                        {ports.map(port => (
                            <option key={port.path} value={port.path}>
                                {port.path} {port.friendlyName
                                    ? port.friendlyName.replace(`(${port.path})`, '').trim()
                                    : ''}
                                {(!port.friendlyName && !port.manufacturer) ? '' : (port.manufacturer ? ` (${port.manufacturer})` : '')}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Baud Rate Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Baud Rate</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={connection.baudRate}
                        onChange={(e) => updateConnection({ baudRate: Number(e.target.value) })}
                        disabled={isConnected}
                    >
                        {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(rate => (
                            <option key={rate} value={rate}>{rate}</option>
                        ))}
                    </select>
                </div>

                {/* Data Bits */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">Data Bits</label>
                        <select
                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                            value={connection.dataBits}
                            onChange={(e) => updateConnection({ dataBits: Number(e.target.value) as any })}
                            disabled={isConnected}
                        >
                            {[5, 6, 7, 8].map(bit => (
                                <option key={bit} value={bit}>{bit}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">Stop Bits</label>
                        <select
                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                            value={connection.stopBits}
                            onChange={(e) => updateConnection({ stopBits: Number(e.target.value) as any })}
                            disabled={isConnected}
                        >
                            {[1, 1.5, 2].map(bit => (
                                <option key={bit} value={bit}>{bit}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Parity */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Parity</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={connection.parity}
                        onChange={(e) => updateConnection({ parity: e.target.value as any })}
                        disabled={isConnected}
                    >
                        {['none', 'even', 'odd', 'mark', 'space'].map(p => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                    </select>
                </div>

                {/* Connect/Disconnect Button & Status */}
                <div className="space-y-2 mt-auto pt-2">
                    <button
                        className={`w-full py-1.5 px-3 text-white text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-[#a1260d] hover:bg-[#c93f24]'
                            : (highlight
                                ? 'bg-[#0e639c] ring-2 ring-yellow-400 animate-pulse'
                                : 'bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed')
                            }`}
                        disabled={!connection.path && !isConnected}
                        onClick={handleToggleConnection}
                    >
                        {isConnected ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        {isConnected ? 'Disconnect' : 'Start Monitoring'}
                    </button>

                    {isConnected ? (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[#4ec9b0]">
                            <div className="w-2 h-2 rounded-full bg-[#4ec9b0] animate-pulse"></div>
                            <span>Monitoring Active</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[#969696]">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span>Disconnected</span>
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
};

export const ConfigSidebar = ({ sessionManager }: ConfigSidebarProps) => {
    const { activeSessionId, sessions } = sessionManager;
    const activeSession = sessions.find(s => s.id === activeSessionId);

    if (!activeSession) {
        return (
            <div className="p-4 text-[#969696] text-xs text-center mt-10">
                No active session.<br />
                Click '+' in the editor area to create one.
            </div>
        );
    }

    if (activeSession.config.type === 'mqtt') {
        return (
            <MqttConfigPanel
                config={activeSession.config as MqttSessionConfig}
                isConnected={activeSession.isConnected}
                onUpdate={(updates) => sessionManager.updateSessionConfig(activeSession.id, updates)}
                onConnectToken={() => sessionManager.connectSession(activeSession.id)}
                onDisconnectToken={() => sessionManager.disconnectSession(activeSession.id)}
            />
        );
    }

    if (activeSession.config.type === 'graph') {
        return (
            <div className="p-4 text-[#969696] text-xs text-center mt-10">
                Graph Editor Active<br />
                No sidebar settings available.
            </div>
        );
    }

    if (activeSession.config.type === 'monitor') {
        return (
            <MonitorConfigPanel
                session={activeSession}
                sessionManager={sessionManager}
            />
        );
    }

    // Default to Serial
    return <SerialConfigPanel session={activeSession} sessionManager={sessionManager} />;
};
