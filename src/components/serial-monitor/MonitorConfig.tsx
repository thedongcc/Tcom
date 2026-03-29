import { useCallback } from 'react';
import { RefreshCw, Play, Square, Info } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { MonitorSessionConfig, COMMON_BAUD_RATES } from '../../types/session';
import { Com0Com } from '../../utils/com0com';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { useMonitorPairs } from './useMonitorPairs';

interface MonitorConfigPanelProps {
    session: any;
}

export const MonitorConfigPanel = ({ session }: MonitorConfigPanelProps) => {
    const { t } = useI18n();
    const { config, isConnected, isConnecting } = session;
    const monitorConfig = config as MonitorSessionConfig;
    const { updateSessionConfig, connectSession, disconnectSession, listPorts, ports, isAdmin, monitorEnabled, setupcPath } = useSession();

    const updateConfig = useCallback((updates: Partial<MonitorSessionConfig>) => {
        void updateSessionConfig(session.id, updates);
    }, [session.id, updateSessionConfig]);

    const { existingPairs, availablePairOptions, refreshPairs } = useMonitorPairs({
        monitorConfig, setupcPath, monitorEnabled, isAdmin, updateConfig
    });

    const handleToggleConnection = async () => {
        if (isConnected) {
            disconnectSession(session.id);
            // Auto-destroy check
            if (monitorConfig.autoDestroyPair && monitorConfig.virtualSerialPort && monitorConfig.pairedPort) {
                const pair = existingPairs.find(p => (p.portA === monitorConfig.virtualSerialPort && p.portB === monitorConfig.pairedPort) || (p.portB === monitorConfig.virtualSerialPort && p.portA === monitorConfig.pairedPort));
                if (pair && pair.id) {
                    if (isAdmin && monitorEnabled) {

                        await Com0Com.removePair(setupcPath!, pair.id);
                        refreshPairs();
                        updateConfig({ virtualSerialPort: '', pairedPort: '' });
                    }
                }
            }
        } else {
            // Validate
            if (!monitorConfig.virtualSerialPort || !monitorConfig.physicalSerialPort || !monitorConfig.pairedPort) {
                alert("Please select a valid virtual pair and physical port.");
                return;
            }
            if (!isAdmin || !monitorEnabled) return;
            connectSession(session.id);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--monitor-config-bg)] text-[var(--monitor-config-text)]" data-component="monitor-config">
            <div className="px-4 py-2 flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
                {/* 未开启虚拟串口功能时显示提示 */}
                {(!monitorEnabled || !isAdmin) && (
                    <div className="p-3 border border-[var(--st-status-error)] bg-[var(--st-status-error-bg)] rounded-sm">
                        <p className="text-[11px] text-[var(--st-error-text)] leading-relaxed">
                            {t('monitor.enableFirst')}
                        </p>
                    </div>
                )}

                <div className={`${(!monitorEnabled || !isAdmin) ? 'opacity-40 pointer-events-none' : ''} flex flex-col gap-3 transition-all duration-300`}>


                    {/* Select Virtual Port (from existing pairs) */}
                    <div className="flex flex-col gap-1">
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('monitor.externalPort')}</label>
                            <CustomSelect
                                items={availablePairOptions.length > 0 ? availablePairOptions.map(opt => ({
                                    label: `${opt.value} ${t('monitor.pairedWith', { port: opt.paired })}`,
                                    value: opt.value,
                                    busy: ports.find(p => p.path === opt.value)?.busy
                                })) : (
                                    ports.filter(p => p.manufacturer === 'com0com' || p.friendlyName?.includes('com0com') || p.friendlyName?.includes('Virtual'))
                                        .reduce((acc, p) => {
                                            if (!acc.find(item => item.path === p.path)) acc.push(p);
                                            return acc;
                                        }, [] as typeof ports)
                                        .map(port => ({
                                            label: port.friendlyName
                                                ? `${port.path} - ${port.friendlyName.replace(`(${port.path})`, '').trim()}`
                                                : port.path,
                                            value: port.path,
                                            busy: port.busy
                                        }))
                                )}
                                value={monitorConfig.virtualSerialPort || ''}
                                onChange={(port) => {
                                    updateConfig({ virtualSerialPort: port });
                                    const pair = existingPairs.find(p => p.portA === port || p.portB === port);
                                    if (pair) {
                                        const internal = pair.portA === port ? pair.portB : pair.portA;
                                        updateConfig({ pairedPort: internal });
                                    }
                                }}
                                disabled={isConnected}
                                placeholder={t('monitor.selectPort')}
                                showStatus={true}
                            />
                        </div>

                        {monitorConfig.pairedPort && (
                            <div className="px-2 py-1.5 bg-[var(--input-background)] border border-[var(--widget-border-color)] rounded-[3px] flex items-center justify-between shadow-sm">
                                <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] font-medium">{t('monitor.internalBridgePort')}</span>
                                <span className="text-[12px] font-mono text-[var(--st-status-success)] font-bold">{monitorConfig.pairedPort}</span>
                            </div>
                        )}
                    </div>


                    {/* Physical Port */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium flex justify-between">
                            {t('monitor.physicalPort')}
                            <Tooltip content={t('monitor.refreshPorts')} position="bottom" wrapperClassName="flex items-center">
                                <button onClick={() => listPorts()} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--button-foreground)] transition-colors">
                                    <RefreshCw size={12} />
                                </button>
                            </Tooltip>
                        </label>
                        <CustomSelect
                            items={ports.filter(p => !(p.manufacturer === 'com0com' || p.friendlyName?.includes('com0com') || p.friendlyName?.includes('Virtual')))
                                .reduce((acc, p) => {
                                    if (!acc.find(item => item.path === p.path)) acc.push(p);
                                    return acc;
                                }, [] as typeof ports).map(port => ({
                                    label: port.friendlyName
                                        ? `${port.path} - ${port.friendlyName.replace(`(${port.path})`, '').trim()}`
                                        : port.path,
                                    value: port.path,
                                    busy: port.busy,
                                    description: port.manufacturer ? `Manufacturer: ${port.manufacturer}` : undefined
                                }))}
                            value={monitorConfig.physicalSerialPort || ''}
                            onChange={(val) => {
                                updateConfig({
                                    physicalSerialPort: val,
                                    connection: { ...monitorConfig.connection, path: val }
                                });
                            }}
                            disabled={isConnected}
                            placeholder={t('monitor.selectPort')}
                            showStatus={true}
                        />
                    </div>

                    <Switch
                            label={t('monitor.autoDestroyPair')}
                            checked={monitorConfig.autoDestroyPair ?? false}
                            onChange={() => updateConfig({ autoDestroyPair: !monitorConfig.autoDestroyPair })}
                            disabled={isConnected}
                        />

                    {/* Baud Rate & Params for Physical Port */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('monitor.baudRate')}</label>
                        <CustomSelect
                            items={COMMON_BAUD_RATES.map(rate => ({
                                label: String(rate),
                                value: String(rate)
                            }))}
                            value={String(monitorConfig.connection?.baudRate || 115200)}
                            onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, baudRate: Number(val) || 115200 } })}
                            disabled={isConnected}
                            allowCustom={true}
                            placeholder={t('monitor.baudRate')}
                        />
                    </div>

                    <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('monitor.dataBits')}</label>
                            <CustomSelect
                                items={[5, 6, 7, 8].map(bit => ({ label: String(bit), value: String(bit) }))}
                                value={String(monitorConfig.connection?.dataBits || 8)}
                                onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, dataBits: Number(val) as 5 | 6 | 7 | 8 } })}
                                disabled={isConnected}
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('monitor.stopBits')}</label>
                            <CustomSelect
                                items={[1, 1.5, 2].map(bit => ({ label: String(bit), value: String(bit) }))}
                                value={String(monitorConfig.connection?.stopBits || 1)}
                                onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, stopBits: Number(val) as 1 | 1.5 | 2 } })}
                                disabled={isConnected}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('monitor.parity')}</label>
                        <CustomSelect
                            items={['none', 'even', 'odd', 'mark', 'space'].map(p => ({
                                label: p.charAt(0).toUpperCase() + p.slice(1),
                                value: p
                            }))}
                            value={monitorConfig.connection?.parity || 'none'}
                            onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, parity: val as 'none' | 'even' | 'mark' | 'odd' | 'space' } })}
                            disabled={isConnected}
                        />
                    </div>

                    <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border-color)] mt-1">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                                {t('monitor.nagleTimeout')}
                                <Tooltip content={t('monitor.nagleTimeoutTooltip')} position="right" delay={200}>
                                    <Info size={12} className="text-[var(--activitybar-inactive-foreground)] cursor-help hover:text-[var(--app-foreground)] transition-colors" />
                                </Tooltip>
                            </span>
                            <span className="text-[10px] text-[var(--activitybar-inactive-foreground)]">{monitorConfig.nagleTimeout ?? 15} ms</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="50"
                            step="1"
                            value={monitorConfig.nagleTimeout ?? 15}
                            onChange={(e) => updateConfig({ nagleTimeout: parseInt(e.target.value) || 0 })}
                            disabled={isConnected}
                            className="w-full accent-[var(--button-background)] h-1 bg-[var(--widget-border-color)] rounded-full appearance-none outline-none"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--activitybar-inactive-foreground)] opacity-70 mt-0.5">
                            <span>0 (Flow)</span>
                            <span>50</span>
                        </div>
                    </div>

                </div>

                <div className="pt-1 flex flex-col gap-2">
                    <button
                        className={`w-full py-1.5 px-3 text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-[var(--st-settings-danger-bg)] text-[var(--st-settings-danger-text)] hover:bg-[var(--st-settings-danger-hover)]'
                            : (isAdmin && monitorEnabled ? 'bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)]' : 'bg-[var(--input-background)] text-[var(--input-placeholder-color)] cursor-not-allowed opacity-50')
                            }`}
                        disabled={(isConnecting || !monitorEnabled || !isAdmin) && !isConnected}
                        onClick={handleToggleConnection}
                    >
                        {isConnecting ? (
                            <RefreshCw size={12} className="animate-spin" />
                        ) : isConnected ? (
                            <Square size={12} fill="currentColor" />
                        ) : (
                            <Play size={12} fill="currentColor" />
                        )}
                        {isConnecting ? t('monitor.starting') : isConnected ? t('monitor.stopMonitor') : t('monitor.startMonitor')}
                    </button>
                </div>
            </div>
        </div>
    );
};
