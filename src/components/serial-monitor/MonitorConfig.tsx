import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, Wand2, ArrowRightLeft, FolderOpen, Trash2, X, AlertCircle } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { MonitorSessionConfig, COMMON_BAUD_RATES } from '../../types/session';
import { Com0Com, PairInfo } from '../../utils/com0com';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../common/CustomSelect';
import { Switch } from '../common/Switch';
import { useI18n } from '../../context/I18nContext';

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
    const { updateSessionConfig, connectSession, disconnectSession, listPorts, ports, isAdmin, monitorEnabled, toggleMonitor } = sessionManager;

    const [isCreatingPair, setIsCreatingPair] = useState(false);
    const [newPairExt, setNewPairExt] = useState('COM11');
    const [newPairInt, setNewPairInt] = useState('COM12');
    const [existingPairs, setExistingPairs] = useState<PairInfo[]>([]);
    const [setupcPath, setSetupcPath] = useState(monitorConfig.setupcPath || 'C:\\Program Files (x86)\\com0com\\setupc.exe');
    const [listPairsError, setListPairsError] = useState<string | null>(null);

    const [pathStatus, setPathStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
    const [com0comVersion, setCom0comVersion] = useState<string | null>(null);
    const [showInstallDialog, setShowInstallDialog] = useState(false);

    const checkCom0comPath = useCallback(async (path: string) => {
        if (!path) {
            setPathStatus('invalid');
            return;
        }
        setPathStatus('checking');
        try {
            const res = await window.com0comAPI?.checkPath(path);
            if (res?.success) {
                setPathStatus('valid');
                setCom0comVersion(res.version || null);
            } else {
                setPathStatus('invalid');
                setCom0comVersion(null);
            }
        } catch (e) {
            setPathStatus('invalid');
            setCom0comVersion(null);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            checkCom0comPath(setupcPath);
        }, 500);
        return () => clearTimeout(timer);
    }, [setupcPath, checkCom0comPath]);

    const updateConfig = useCallback((updates: Partial<MonitorSessionConfig>) => {
        updateSessionConfig(session.id, updates);
    }, [session.id, updateSessionConfig]);

    const refreshPairs = useCallback(async () => {
        if (!monitorConfig.setupcPath || !monitorEnabled || !isAdmin) {
            setExistingPairs([]);
            return;
        }
        setListPairsError(null);
        try {
            const pairs = await Com0Com.listPairs(monitorConfig.setupcPath);
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
    }, [monitorConfig.setupcPath, monitorConfig.virtualSerialPort, monitorConfig.pairedPort, updateConfig, monitorEnabled, isAdmin]);

    useEffect(() => {
        // Load pairs when setup path, enabled status, or admin status changes
        if (monitorConfig.setupcPath && monitorEnabled && isAdmin && pathStatus === 'valid') {
            refreshPairs();
        } else if (!monitorEnabled || !isAdmin || pathStatus === 'invalid') {
            setExistingPairs([]);
        }
    }, [monitorConfig.setupcPath, monitorEnabled, isAdmin, pathStatus, refreshPairs]);

    useEffect(() => {
        return () => {
            // Cleanup check on unmount
        };
    }, []);

    const configRef = useState(monitorConfig)[0];
    const configRefReal = { current: monitorConfig };

    const createNewPair = async () => {
        if (!processPairCreation) return;
        setIsCreatingPair(true);
        try {
            const res = await Com0Com.createPair(monitorConfig.setupcPath!, newPairExt, newPairInt);
            if (res.success) {
                await refreshPairs();
                // Select the newly created pair
                updateConfig({
                    virtualSerialPort: newPairExt,
                    pairedPort: newPairInt
                });
                setIsCreatingPair(false);
            } else {
                alert(`Creation failed: ${res.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('Error creating pair');
        } finally {
            setIsCreatingPair(false);
        }
    };

    const processPairCreation = !isCreatingPair && monitorConfig.setupcPath;

    // Available virtual ports (COM1-COM255, excluding occupied ones except the one selected)
    const usedPorts = new Set(existingPairs.flatMap(p => [p.portA, p.portB]));
    const physicalPorts = ports.map(p => p.path);

    // Helper to calculate next available COMs
    const suggestNextPair = () => {
        let i = 1;
        while (usedPorts.has(`COM${i}`) || usedPorts.has(`COM${i + 1}`) || physicalPorts.includes(`COM${i}`) || physicalPorts.includes(`COM${i + 1}`)) i++;
        setNewPairExt(`COM${i}`);
        setNewPairInt(`COM${i + 1}`);
    };

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
                        await Com0Com.removePair(monitorConfig.setupcPath!, pair.id);
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
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            <div className="px-4 py-2 border-b border-[var(--vscode-border)] bg-[#252526] text-[11px] font-bold text-[#cccccc] uppercase tracking-wide">
                <span>{t('monitor.settings')}</span>
            </div>

            <div className="px-4 py-2 flex flex-col gap-3 overflow-y-auto">
                {/* Global Monitor Enable Switch */}
                <div className="border border-[#3c3c3c] p-2 bg-[#2d2d2d] rounded-sm">
                    <div
                        onClickCapture={(e) => {
                            if (isAdmin && isConnected) {
                                showToast(t('monitor.stopFirst'), 'warning');
                            }
                        }}
                    >
                        <Switch
                            label={t('monitor.enableVirtualMonitor')}
                            checked={monitorEnabled}
                            onChange={(checked) => toggleMonitor(checked)}
                            disabled={!isAdmin || isConnected}
                        />
                    </div>
                    {!isAdmin && (
                        <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded-sm">
                            <p className="text-[11px] text-[#f48771]">
                                {t('monitor.adminRequired')}
                            </p>
                        </div>
                    )}
                </div>

                <div className={`${(!monitorEnabled || !isAdmin) ? 'opacity-40 pointer-events-none grayscale-[0.5]' : ''} flex flex-col gap-3 transition-all duration-300`}>

                    {/* setupc.exe Path */}
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center h-[18px]">
                            <label className="text-[11px] text-[#969696] mb-0">{t('monitor.setupcPath')}</label>
                            <button
                                className="text-[11px] text-[#0e639c] hover:text-[#1177bb] transition-colors"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowInstallDialog(true); }}
                                disabled={isConnected}
                            >
                                {t('monitor.installCom0com')}
                            </button>
                        </div>
                        <div
                            className="flex gap-1"
                            onClickCapture={(e) => {
                                if (isConnected) {
                                    showToast(t('monitor.stopFirst'), 'warning');
                                }
                            }}
                        >
                            <input
                                className={`w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)] ${isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={setupcPath}
                                onChange={(e) => {
                                    setSetupcPath(e.target.value);
                                    updateConfig({ setupcPath: e.target.value });
                                }}
                                disabled={isConnected}
                            />
                            <button
                                className={`bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-1 px-2 transition-colors ${isConnected ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#4a4a4a]'}`}
                                onClick={async () => {
                                    if (isConnected) return;
                                    try {
                                        const result = await window.shellAPI?.showOpenDialog({
                                            title: '选择 setupc.exe',
                                            filters: [{ name: 'com0com installer (setupc.exe)', extensions: ['exe'] }],
                                            properties: ['openFile']
                                        });
                                        if (result && !result.canceled && result.filePaths.length > 0) {
                                            const exePath = result.filePaths[0];
                                            setSetupcPath(exePath);
                                            updateConfig({ setupcPath: exePath });
                                        }
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                disabled={isConnected}
                            >
                                <FolderOpen size={14} />
                            </button>
                        </div>
                        <div className="h-[16px] text-[11px] mt-0.5 flex items-center">
                            {pathStatus === 'checking' && <span className="text-[#808080]">{t('monitor.pathChecking')}</span>}
                            {pathStatus === 'valid' && <span className="text-[#10b981]">✓ {t('monitor.pathValid').replace(' {version}', '')}</span>}
                            {pathStatus === 'invalid' && <span className="text-[#f48771]">✗ {t('monitor.pathInvalid')}</span>}
                        </div>
                    </div>

                    {/* Virtual Pair Management */}
                    <div className="flex flex-col gap-1 border border-[#3c3c3c] p-2 bg-[#2d2d2d] rounded-sm">
                        <div className="text-[11px] text-[#969696] flex justify-between items-center mb-1 font-medium">
                            <span>{t('monitor.virtualPairs')}</span>
                            <div
                                className="flex gap-1 items-center"
                                onClickCapture={(e) => {
                                    if (isConnected) {
                                        showToast(t('monitor.stopFirst'), 'warning');
                                    }
                                }}
                            >
                                <button
                                    onClick={(e) => { e.preventDefault(); if (!isConnected) suggestNextPair(); }}
                                    className={`p-1 rounded text-[#969696] transition-colors ${isConnected ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#3c3c3c] hover:text-white'}`}
                                    title={t('monitor.suggestNextPair')}
                                    disabled={isConnected}
                                >
                                    <Wand2 size={13} />
                                </button>
                                <button
                                    onClick={(e) => { e.preventDefault(); if (!isConnected && pathStatus === 'valid') refreshPairs(); }}
                                    className={`p-1 rounded text-[#969696] transition-colors ${isConnected || pathStatus !== 'valid' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#3c3c3c] hover:text-white'}`}
                                    title={t('monitor.refresh')}
                                    disabled={isConnected || pathStatus !== 'valid'}
                                >
                                    <RefreshCw size={13} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 mb-2">
                            <div className={`flex gap-1 items-center ${isConnected ? 'opacity-50' : ''}`}>
                                <CustomSelect
                                    items={Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => ({
                                        label: com,
                                        value: com,
                                        disabled: usedPorts.has(com) || physicalPorts.includes(com)
                                    }))}
                                    value={newPairExt}
                                    onChange={val => setNewPairExt(val)}
                                    disabled={isConnected || pathStatus !== 'valid'}
                                />
                                <ArrowRightLeft size={10} className="text-[#969696] shrink-0" />
                                <CustomSelect
                                    items={Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => ({
                                        label: com,
                                        value: com,
                                        disabled: usedPorts.has(com) || physicalPorts.includes(com) || com === newPairExt
                                    }))}
                                    value={newPairInt}
                                    onChange={val => setNewPairInt(val)}
                                    disabled={isConnected || pathStatus !== 'valid'}
                                />
                            </div>
                            <button
                                onClick={() => {
                                    if (isConnected) {
                                        showToast(t('monitor.stopFirstCreate'), 'info');
                                        return;
                                    }
                                    if (pathStatus !== 'valid') return;
                                    createNewPair();
                                }}
                                disabled={isCreatingPair || !isAdmin || !monitorEnabled || pathStatus !== 'valid'}
                                className={`w-full px-3 py-1.5 text-[12px] rounded-sm transition-colors ${isConnected || !isAdmin || !monitorEnabled || pathStatus !== 'valid'
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
                                    }`}
                            >
                                {isCreatingPair ? t('monitor.creating') : t('monitor.createVirtualPair')}
                            </button>
                        </div>

                        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                            {existingPairs.map(pair => (
                                <div key={pair.id} className="group flex justify-between items-center text-[12px] bg-[#3c3c3c] px-2 py-1.5 relative hover:bg-[#444444] transition-colors rounded-sm mb-1 last:mb-0">
                                    <div className="grid grid-cols-[45px_20px_45px] items-center font-mono">
                                        <span className="text-[#cccccc]">{pair.portA}</span>
                                        <ArrowRightLeft size={10} className="text-[#808080]" />
                                        <span className="text-[#cccccc]">{pair.portB}</span>
                                    </div>
                                    <button
                                        disabled={isConnected}
                                        className={`p-1 rounded transition-colors ${isConnected
                                            ? 'text-gray-600 cursor-not-allowed'
                                            : 'text-[#666] hover:text-[#f48771] hover:bg-[#4a4a4a]'
                                            }`}
                                        onClick={async () => {
                                            if (isConnected) return;
                                            const ok = await confirm({
                                                title: t('monitor.deletePairTitle'),
                                                message: t('monitor.deletePairMessage', { portA: pair.portA, portB: pair.portB }),
                                                type: 'danger',
                                                confirmText: t('monitor.deletePairConfirm')
                                            });
                                            if (ok) {
                                                await Com0Com.removePair(monitorConfig.setupcPath!, pair.id);
                                                refreshPairs();
                                            }
                                        }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                            {existingPairs.length === 0 && (
                                <span className="text-[11px] text-[#808080] italic">
                                    {!monitorEnabled ? t('monitor.monitorDisabled') : (!isAdmin ? t('monitor.adminPermRequired') : t('monitor.noPairsFound'))}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Select Virtual Port (from existing pairs) */}
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-[#969696]">{t('monitor.externalPort')}</label>
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
                            <div className="px-2 py-1.5 bg-[#252526] border border-[#3c3c3c] rounded-sm flex items-center justify-between">
                                <span className="text-[11px] text-[#969696]">{t('monitor.internalBridgePort')}</span>
                                <span className="text-[12px] font-mono text-[#10b981] font-bold">{monitorConfig.pairedPort}</span>
                            </div>
                        )}
                    </div>


                    {/* Physical Port */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696] flex justify-between">
                            {t('monitor.physicalPort')}
                            <button onClick={listPorts} className="hover:text-white" title={t('monitor.refreshPorts')}>
                                <RefreshCw size={12} />
                            </button>
                        </label>
                        <CustomSelect
                            items={ports.reduce((acc, p) => {
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
                        <label className="text-[11px] text-[#969696]">{t('monitor.baudRate')}</label>
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
                            <label className="text-[11px] text-[#969696]">{t('monitor.dataBits')}</label>
                            <CustomSelect
                                items={[5, 6, 7, 8].map(bit => ({ label: String(bit), value: String(bit) }))}
                                value={String(monitorConfig.connection?.dataBits || 8)}
                                onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, dataBits: Number(val) as any } })}
                                disabled={isConnected}
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-[#969696]">{t('monitor.stopBits')}</label>
                            <CustomSelect
                                items={[1, 1.5, 2].map(bit => ({ label: String(bit), value: String(bit) }))}
                                value={String(monitorConfig.connection?.stopBits || 1)}
                                onChange={(val) => updateConfig({ connection: { ...monitorConfig.connection, stopBits: Number(val) as any } })}
                                disabled={isConnected}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696]">{t('monitor.parity')}</label>
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

                <div className="space-y-2 mt-auto pt-4 border-t border-[#3c3c3c]">
                    <button
                        className={`w-full py-2 px-3 text-white text-[13px] font-bold rounded-sm transition-all flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-[#a1260d] hover:bg-[#c93f24]'
                            : (isAdmin && monitorEnabled ? 'bg-[#0e639c] hover:bg-[#1177bb]' : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50')
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
                    {!isAdmin ? (
                        <p className="text-[10px] text-center text-[#f48771] border border-red-500/30 p-1.5 bg-red-900/10 rounded-sm">
                            {t('monitor.adminRequiredStart')}
                        </p>
                    ) : !monitorEnabled && (
                        <p className="text-[10px] text-center text-[#969696] border border-white/10 p-1.5 bg-white/5 rounded-sm">
                            {t('monitor.enableFirst')}
                        </p>
                    )}
                </div>
            </div>

            {/* Install Com0com Dialog */}
            {showInstallDialog && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowInstallDialog(false)}>
                    <div
                        className="bg-[#252526] border border-[#3c3c3c] shadow-2xl w-[400px] flex flex-col rounded-md overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-2.5 border-b border-[#3c3c3c] bg-[#2d2d2d]">
                            <span className="text-[11px] font-bold text-[#cccccc] uppercase tracking-wider">{t('monitor.installMethodTitle')}</span>
                            <button onClick={() => setShowInstallDialog(false)} className="text-[#969696] hover:text-white transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                        {/* Content */}
                        <div className="p-5 flex gap-4 items-start">
                            <div className="shrink-0 mt-0.5"><AlertCircle className="text-[#007acc]" size={24} /></div>
                            <div className="flex-1">
                                <p className="text-[13px] text-[#cccccc] leading-relaxed whitespace-pre-wrap">{t('monitor.installMethodDesc')}</p>
                            </div>
                        </div>
                        {/* Footer */}
                        <div className="flex justify-end gap-2 p-3 bg-[#1e1e1e] border-t border-[#3c3c3c]">
                            <button
                                onClick={async () => {
                                    setShowInstallDialog(false);
                                    window.shellAPI?.openExternal('https://com0com.sourceforge.net/');
                                }}
                                className="px-4 py-1.5 text-[#cccccc] hover:bg-[#3c3c3c] border border-[#3c3c3c] rounded-sm text-xs transition-colors"
                            >
                                {t('monitor.websiteDownload')}
                            </button>
                            <button
                                onClick={async () => {
                                    setShowInstallDialog(false);
                                    const res = await window.com0comAPI?.launchInstaller();
                                    if (!res?.success) {
                                        showToast(res?.error || 'Launch failed', 'error');
                                    }
                                }}
                                className="px-4 py-1.5 text-white bg-[#0e639c] hover:bg-[#1177bb] rounded-sm text-xs transition-all"
                            >
                                {t('monitor.builtinInstall')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
