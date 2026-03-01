import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, ArrowRightLeft } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { MonitorSessionConfig, COMMON_BAUD_RATES } from '../../types/session';
import { Com0Com, PairInfo } from '../../utils/com0com';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

interface MonitorConfigPanelProps {
    session: any;
    sessionManager: ReturnType<typeof useSessionManager>;
}

export const MonitorConfigPanel = ({ session, sessionManager }: MonitorConfigPanelProps) => {
    const { confirm } = useConfirm();
    const { showToast } = useToast();
    const { t } = useI18n();
    const { config, isConnected, isConnecting } = session;
    const monitorConfig = config as MonitorSessionConfig;
    const { updateSessionConfig, connectSession, disconnectSession, listPorts, ports, isAdmin, monitorEnabled, setupcPath } = sessionManager;

    const [existingPairs, setExistingPairs] = useState<PairInfo[]>([]);
    const [listPairsError, setListPairsError] = useState<string | null>(null);

    const updateConfig = useCallback((updates: Partial<MonitorSessionConfig>) => {
        updateSessionConfig(session.id, updates);
    }, [session.id, updateSessionConfig]);

    const refreshPairs = useCallback(async () => {
        if (!setupcPath || !monitorEnabled || !isAdmin) {
            setExistingPairs([]);
            return;
        }
        setListPairsError(null);
        try {
            const pairs = await Com0Com.listPairs(setupcPath);
            setExistingPairs(pairs);

            // Cascade Cleanup & Auto-Selection Logic
            let currentVirtual = monitorConfig.virtualSerialPort;
            let currentPaired = monitorConfig.pairedPort;

            // Check if existing selection is still valid
            if (currentVirtual) {
                const stillExists = pairs.some(p => p.portA === currentVirtual || p.portB === currentVirtual);
                if (!stillExists) {
                    currentVirtual = '';
                    currentPaired = '';
                }
            }

            // Auto-selection if nothing is selected but pairs exist
            if (!currentVirtual && pairs.length > 0) {
                // Number-first strategy: sort by COM number and pick smallest as External
                const firstPair = pairs[0];
                const getComNum = (p: string) => parseInt(p.replace('COM', '')) || 999;
                const numA = getComNum(firstPair.portA);
                const numB = getComNum(firstPair.portB);

                if (numA <= numB) {
                    currentVirtual = firstPair.portA;
                    currentPaired = firstPair.portB;
                } else {
                    currentVirtual = firstPair.portB;
                    currentPaired = firstPair.portA;
                }
            }

            // Update config if changed (Deduplicated by check)
            if (currentVirtual !== monitorConfig.virtualSerialPort || currentPaired !== monitorConfig.pairedPort) {
                updateConfig({
                    virtualSerialPort: currentVirtual,
                    pairedPort: currentPaired
                });
            } else if (currentVirtual) {
                // Ensure internal sync even if virtual stays same
                const pair = pairs.find(p => p.portA === currentVirtual || p.portB === currentVirtual);
                if (pair) {
                    const internal = pair.portA === currentVirtual ? pair.portB : pair.portA;
                    if (monitorConfig.pairedPort !== internal) {
                        updateConfig({ pairedPort: internal });
                    }
                }
            }
        } catch (e: any) {
            const errStr = e.message || String(e);
            if (!errStr.includes('Unauthorized command')) {
                console.error('Failed to list pairs', e);
                setListPairsError(errStr);
            }
            setExistingPairs([]);
        }
    }, [setupcPath, monitorConfig.virtualSerialPort, monitorConfig.pairedPort, updateConfig, monitorEnabled, isAdmin]);

    // 在 monitorEnabled 或 isAdmin 变化时刷新虚拟端口对列表
    useEffect(() => {
        if (setupcPath && monitorEnabled && isAdmin) {
            refreshPairs();
        } else {
            setExistingPairs([]);
        }
    }, [setupcPath, monitorEnabled, isAdmin, refreshPairs]);

    useEffect(() => {
        return () => {
            // Cleanup check on unmount
        };
    }, []);

    // Available virtual ports (COM1-COM255, excluding occupied ones except the one selected)
    const usedPorts = new Set(existingPairs.flatMap(p => [p.portA, p.portB]));
    const physicalPorts = ports.map(p => p.path);

    // Available virtual ports for SELECTION (only External ports of existing pairs)
    const availablePairOptions = existingPairs.flatMap(p => [
        { value: p.portA, label: `${p.portA} ${t('monitor.pairedWith', { port: p.portB })}` },
        { value: p.portB, label: `${p.portB} ${t('monitor.pairedWith', { port: p.portA })}` }
    ]).reduce((acc, current) => {
        if (!acc.find(item => item.value === current.value)) {
            acc.push(current);
        }
        return acc;
    }, [] as { value: string, label: string }[]);

    const handleToggleConnection = async () => {
        if (isConnected) {
            disconnectSession(session.id);
            // Auto-destroy check
            if (monitorConfig.autoDestroyPair && monitorConfig.virtualSerialPort && monitorConfig.pairedPort) {
                const pair = existingPairs.find(p => (p.portA === monitorConfig.virtualSerialPort && p.portB === monitorConfig.pairedPort) || (p.portB === monitorConfig.virtualSerialPort && p.portA === monitorConfig.pairedPort));
                if (pair && pair.id) {
                    if (isAdmin && monitorEnabled) {
                        console.log('Auto-destroying pair', pair.id);
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
        <div className="flex flex-col h-full bg-[var(--sidebar-background)] text-[var(--app-foreground)]">
            <div className="px-4 py-2 border-b border-[var(--border-color)] bg-[var(--sidebar-background)] text-[11px] font-bold text-[var(--app-foreground)] uppercase tracking-wide">
                <span>{t('monitor.settings')}</span>
            </div>

            <div className="px-4 py-2 flex flex-col gap-3 overflow-y-auto">
                {/* 未开启虚拟串口功能时显示提示 */}
                {(!monitorEnabled || !isAdmin) && (
                    <div className="p-3 border border-red-500/40 bg-red-500/10 rounded-sm">
                        <p className="text-[11px] text-[var(--st-error-text)] leading-relaxed">
                            {t('monitor.enableFirst')}
                        </p>
                    </div>
                )}

                <div className={`${(!monitorEnabled || !isAdmin) ? 'opacity-40 pointer-events-none' : ''} flex flex-col gap-3 transition-all duration-300`}>


                    {/* Select Virtual Port (from existing pairs) */}
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-[var(--app-foreground)] font-medium">{t('monitor.externalPort')}</label>
                            <CustomSelect
                                items={availablePairOptions.length > 0 ? availablePairOptions.map(opt => ({
                                    label: opt.label,
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
                                <span className="text-[12px] font-mono text-emerald-600 dark:text-emerald-500 font-bold">{monitorConfig.pairedPort}</span>
                            </div>
                        )}
                    </div>


                    {/* Physical Port */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--app-foreground)] font-medium flex justify-between">
                            {t('monitor.physicalPort')}
                            <Tooltip content={t('monitor.refreshPorts')} position="bottom" wrapperClassName="flex items-center">
                                <button onClick={listPorts} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--button-foreground)] transition-colors">
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

                    <div className="py-1">
                        <Switch
                            label={t('monitor.autoDestroyPair')}
                            checked={monitorConfig.autoDestroyPair}
                            onChange={() => updateConfig({ autoDestroyPair: !monitorConfig.autoDestroyPair })}
                            disabled={isConnected}
                        />
                    </div>

                    {/* Baud Rate & Params for Physical Port */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--app-foreground)] font-medium">{t('monitor.baudRate')}</label>
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
                            <label className="text-[11px] text-[var(--app-foreground)] font-medium">{t('monitor.dataBits')}</label>
                            <CustomSelect
                                items={[5, 6, 7, 8].map(bit => ({ label: String(bit), value: String(bit) }))}
                                value={String(monitorConfig.connection?.dataBits || 8)}
                                onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, dataBits: Number(val) as any } })}
                                disabled={isConnected}
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-[var(--app-foreground)] font-medium">{t('monitor.stopBits')}</label>
                            <CustomSelect
                                items={[1, 1.5, 2].map(bit => ({ label: String(bit), value: String(bit) }))}
                                value={String(monitorConfig.connection?.stopBits || 1)}
                                onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, stopBits: Number(val) as any } })}
                                disabled={isConnected}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--app-foreground)] opacity-80 font-medium">{t('monitor.parity')}</label>
                        <CustomSelect
                            items={['none', 'even', 'odd', 'mark', 'space'].map(p => ({
                                label: p.charAt(0).toUpperCase() + p.slice(1),
                                value: p
                            }))}
                            value={monitorConfig.connection?.parity || 'none'}
                            onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, parity: val as any } })}
                            disabled={isConnected}
                        />
                    </div>

                </div>

                <div className="space-y-2 mt-auto pt-4 border-t border-[var(--border-color)]">
                    <button
                        className={`w-full py-2 px-3 text-white text-[13px] font-bold rounded-sm transition-all flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-red-700 hover:bg-red-600'
                            : (isAdmin && monitorEnabled ? 'bg-[var(--button-background)] hover:bg-[var(--button-hover-background)]' : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50')
                            }`}
                        disabled={(isConnecting || !monitorEnabled || !isAdmin) && !isConnected}
                        onClick={handleToggleConnection}
                    >
                        {isConnecting ? (
                            <RefreshCw size={14} className="animate-spin" />
                        ) : isConnected ? (
                            <Square size={14} fill="currentColor" />
                        ) : (
                            <Play size={14} fill="currentColor" />
                        )}
                        {isConnecting ? t('monitor.starting') : isConnected ? t('monitor.stopMonitor') : t('monitor.startMonitor')}
                    </button>
                </div>
            </div>
        </div>
    );
};
