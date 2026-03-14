/**
 * SerialConfigPanel.tsx
 * 串口配置面板 — 端口选择、波特率、数据位/停止位/校验位及连接控制。
 * 从 ConfigSidebar.tsx 中拆分出来。
 */
import { useState, useEffect } from 'react';
import { RefreshCw, Play, Square } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { SerialSessionConfig, COMMON_BAUD_RATES } from '../../types/session';
import { CustomSelect } from '../common/CustomSelect';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

interface SerialConfigPanelProps {
    session: any;
    sessionManager: ReturnType<typeof useSessionManager>;
}

export const SerialConfigPanel = ({ session, sessionManager }: SerialConfigPanelProps) => {
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
        void updateSessionConfig(session.id, { connection: { ...connection, ...updates } });
    };

    const portItems = ports.map(port => ({
        label: `${port.path} ${port.friendlyName ? port.friendlyName.replace(`(${port.path})`, '').trim() : ''}`,
        value: port.path,
        busy: port.busy,
        error: port.error,
        description: port.manufacturer ? `Manufacturer: ${port.manufacturer}` : undefined
    }));

    return (
        <div
            className="flex flex-col h-full bg-[var(--serial-config-bg)] text-[var(--serial-config-text)]"
            data-component="serial-config"
        >
            <div className="px-4 py-2 border-b border-[var(--border-color)] bg-[var(--serial-config-bg)] text-[11px] font-bold text-[var(--serial-config-text)] uppercase tracking-wide flex items-center">
                <span>{t('configSidebar.settings')}</span>
                {session.unsaved && (
                    <Tooltip content={t('configSidebar.unsavedChanges')} position="bottom" wrapperClassName="flex items-center">
                        <span className="ml-2 w-2 h-2 rounded-full bg-white opacity-50 inline-block"></span>
                    </Tooltip>
                )}
            </div>

            <div className="px-4 py-2 flex flex-col gap-3">
                {/* 端口选择 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--st-monitor-config-label)] opacity-80 font-medium flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                            {t('serial.portLabel')}
                        </div>
                        <Tooltip content={t('configSidebar.refreshPorts')} position="bottom" wrapperClassName="flex items-center">
                            <button onClick={() => listPorts()} className="hover:text-[var(--button-foreground)] transition-colors">
                                <RefreshCw size={12} />
                            </button>
                        </Tooltip>
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

                {/* 波特率 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--st-monitor-config-label)] opacity-80 font-medium">{t('serial.baudRate')}</label>
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

                {/* 数据位 / 停止位 */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[var(--st-monitor-config-label)] opacity-80 font-medium">{t('serial.dataBits')}</label>
                        <CustomSelect
                            items={[5, 6, 7, 8].map(bit => ({ label: String(bit), value: String(bit) }))}
                            value={String(connection.dataBits)}
                            onChange={(val) => updateConnection({ dataBits: Number(val) as any })}
                            disabled={isConnected}
                        />
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[var(--st-monitor-config-label)] opacity-80 font-medium">{t('serial.stopBits')}</label>
                        <CustomSelect
                            items={[1, 1.5, 2].map(bit => ({ label: String(bit), value: String(bit) }))}
                            value={String(connection.stopBits)}
                            onChange={(val) => updateConnection({ stopBits: Number(val) as any })}
                            disabled={isConnected}
                        />
                    </div>
                </div>

                {/* 校验位 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--st-monitor-config-label)] opacity-80 font-medium">{t('serial.parity')}</label>
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

                {/* 连接/断开按钮 */}
                <div className="space-y-2 mt-auto pt-2">
                    <button
                        className={`w-full py-1.5 px-3 text-white text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-[var(--st-danger-bg)] hover:bg-[var(--st-danger-hover-bg)]'
                            : (highlight
                                ? 'bg-[var(--button-background)] ring-2 ring-[var(--focus-border-color)] animate-pulse'
                                : 'bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] disabled:opacity-50 disabled:cursor-not-allowed')
                            }`}
                        disabled={!connection.path && !isConnected}
                        onClick={handleToggleConnection}
                    >
                        {isConnected ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        {isConnected ? t('serial.disconnect') : t('serial.connect')}
                    </button>

                    {isConnected ? (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[var(--st-config-success-text)]">
                            <div className="w-2 h-2 rounded-full bg-[var(--st-config-success-bg)] animate-pulse"></div>
                            <span>{t('configSidebar.monitoringActive')}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[var(--st-config-muted-text)]">
                            <div className="w-2 h-2 rounded-full bg-[var(--st-status-error)]"></div>
                            <span>{t('serial.disconnected')}</span>
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
};
