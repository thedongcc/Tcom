import { useState, useEffect } from 'react';
import { RefreshCw, Play, Square } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { SerialSessionConfig, MqttSessionConfig, COMMON_BAUD_RATES } from '../../types/session';
import { MqttConfigPanel } from '../mqtt/MqttConfigPanel';
import { MonitorConfigPanel } from '../serial-monitor/MonitorConfig';
import { CustomSelect } from '../common/CustomSelect';
import { useI18n } from '../../context/I18nContext';

interface ConfigSidebarProps {
    sessionManager: ReturnType<typeof useSessionManager>;
}

// Extracted Serial Panel
const SerialConfigPanel = ({ session, sessionManager }: { session: any, sessionManager: ReturnType<typeof useSessionManager> }) => {
    const { config, isConnected } = session;
    const { connection } = config as SerialSessionConfig;
    const { t } = useI18n();

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

    const portItems = ports.map(port => ({
        label: `${port.path} ${port.friendlyName ? port.friendlyName.replace(`(${port.path})`, '').trim() : ''}`,
        value: port.path,
        busy: port.busy,
        error: port.error,
        description: port.manufacturer ? `Manufacturer: ${port.manufacturer}` : undefined
    }));

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            <div className="px-4 py-2 border-b border-[var(--vscode-border)] bg-[#252526] text-[11px] font-bold text-[#cccccc] uppercase tracking-wide">
                <span>{t('configSidebar.settings')}</span>
                {session.unsaved && <span className="ml-2 w-2 h-2 rounded-full bg-white opacity-50 inline-block" title={t('configSidebar.unsavedChanges')}></span>}
            </div>

            <div className="px-4 py-2 flex flex-col gap-3">
                {/* Port Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696] flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                            {t('serial.portLabel')}
                        </div>
                        <button onClick={listPorts} className="hover:text-white" title={t('configSidebar.refreshPorts')}>
                            <RefreshCw size={12} />
                        </button>
                    </label>
                    <CustomSelect
                        items={portItems}
                        value={connection.path}
                        onChange={(val) => updateConnection({ path: val })}
                        disabled={isConnected}
                        placeholder={t('configSidebar.selectPort')}
                        showStatus={true}
                    />
                </div>

                {/* Baud Rate Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">{t('serial.baudRate')}</label>
                    <CustomSelect
                        items={COMMON_BAUD_RATES.map(rate => ({
                            label: String(rate),
                            value: String(rate)
                        }))}
                        value={String(connection.baudRate)}
                        onChange={(val) => updateConnection({ baudRate: Number(val) || 115200 })}
                        disabled={isConnected}
                        allowCustom={true}
                        placeholder={t('serial.baudRate')}
                    />
                </div>

                {/* Data Bits */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">{t('serial.dataBits')}</label>
                        <CustomSelect
                            items={[5, 6, 7, 8].map(bit => ({ label: String(bit), value: String(bit) }))}
                            value={String(connection.dataBits)}
                            onChange={(val) => updateConnection({ dataBits: Number(val) as any })}
                            disabled={isConnected}
                        />
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">{t('serial.stopBits')}</label>
                        <CustomSelect
                            items={[1, 1.5, 2].map(bit => ({ label: String(bit), value: String(bit) }))}
                            value={String(connection.stopBits)}
                            onChange={(val) => updateConnection({ stopBits: Number(val) as any })}
                            disabled={isConnected}
                        />
                    </div>
                </div>

                {/* Parity */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">{t('serial.parity')}</label>
                    <CustomSelect
                        items={[
                            { label: t('serial.none'), value: 'none' },
                            { label: t('serial.even'), value: 'even' },
                            { label: t('serial.odd'), value: 'odd' },
                            { label: t('configSidebar.mark'), value: 'mark' },
                            { label: t('configSidebar.space'), value: 'space' },
                        ]}
                        value={connection.parity}
                        onChange={(val) => updateConnection({ parity: val as any })}
                        disabled={isConnected}
                    />
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
                        {isConnected ? t('serial.disconnect') : t('serial.connect')}
                    </button>

                    {isConnected ? (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[#4ec9b0]">
                            <div className="w-2 h-2 rounded-full bg-[#4ec9b0] animate-pulse"></div>
                            <span>{t('configSidebar.monitoringActive')}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[#969696]">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span>{t('serial.disconnected')}</span>
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
    const { t } = useI18n();

    if (!activeSession) {
        return (
            <div className="p-4 text-[#969696] text-xs text-center mt-10">
                {t('configSidebar.noActiveSession')}<br />
                {t('configSidebar.clickToCreate')}
            </div>
        );
    }

    // 显式处理设置会话
    if (activeSession.config.type === 'settings') {
        return (
            <div className="p-4 text-[#969696] text-xs text-center mt-10">
                <div className="mb-2 font-bold text-[#cccccc]">{t('configSidebar.globalSettings')}</div>
                <div className="opacity-60 text-[11px]">{t('configSidebar.globalSettingsDesc')}</div>
            </div>
        );
    }

    if (activeSession.config.type === 'mqtt') {
        return (
            <MqttConfigPanel
                config={activeSession.config as MqttSessionConfig}
                isConnected={activeSession.isConnected}
                isConnecting={activeSession.isConnecting}
                onUpdate={(updates) => sessionManager.updateSessionConfig(activeSession.id, updates)}
                onConnectToken={() => sessionManager.connectSession(activeSession.id)}
                onDisconnectToken={() => sessionManager.disconnectSession(activeSession.id)}
            />
        );
    }

    if (activeSession.config.type === 'graph') {
        return (
            <div className="p-4 text-[#969696] text-xs text-center mt-10">
                {t('configSidebar.graphActive')}<br />
                {t('configSidebar.noSidebarSettings')}
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
