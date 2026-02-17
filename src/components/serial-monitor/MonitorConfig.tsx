import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, Settings, Wand2, ArrowRightLeft, FolderOpen, Trash2 } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { MonitorSessionConfig } from '../../types/session';
import { Com0Com, PairInfo } from '../../utils/com0com';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../common/CustomSelect';

interface MonitorConfigPanelProps {
    session: any;
    sessionManager: ReturnType<typeof useSessionManager>;
}

export const MonitorConfigPanel = ({ session, sessionManager }: MonitorConfigPanelProps) => {
    const { confirm } = useConfirm();
    const { showToast } = useToast();
    const { config, isConnected, isConnecting } = session;
    const monitorConfig = config as MonitorSessionConfig;
    const { updateSessionConfig, connectSession, disconnectSession, listPorts, ports } = sessionManager;

    const [isCreatingPair, setIsCreatingPair] = useState(false);
    const [newPairExt, setNewPairExt] = useState('COM11');
    const [newPairInt, setNewPairInt] = useState('COM12');
    const [existingPairs, setExistingPairs] = useState<PairInfo[]>([]);
    const [setupcPath, setSetupcPath] = useState(monitorConfig.setupcPath || 'C:\\Program Files (x86)\\com0com\\setupc.exe');
    const [listPairsError, setListPairsError] = useState<string | null>(null);

    const updateConfig = useCallback((updates: Partial<MonitorSessionConfig>) => {
        updateSessionConfig(session.id, updates);
    }, [session.id, updateSessionConfig]);

    const refreshPairs = useCallback(async () => {
        if (!monitorConfig.setupcPath) return; // Silent return if not set
        setListPairsError(null);
        try {
            const pairs = await Com0Com.listPairs(monitorConfig.setupcPath);
            setExistingPairs(pairs);

            // If current selected virtual port is not in pairs, clear it? 
            // Or maybe it was just deleted.
            // But if we have a selected port, check if we know its pair.
            if (monitorConfig.virtualSerialPort) {
                const pair = pairs.find(p => p.portA === monitorConfig.virtualSerialPort || p.portB === monitorConfig.virtualSerialPort);
                if (pair) {
                    const internal = pair.portA === monitorConfig.virtualSerialPort ? pair.portB : pair.portA;
                    if (monitorConfig.pairedPort !== internal) {
                        updateConfig({ pairedPort: internal });
                    }
                } else if (monitorConfig.pairedPort) {
                    // Pair gone? We don't auto-clear pairedPort to allow manual override 
                    // unless we are sure. But user complains about "No pairs found" locking them out?
                    // Actually manual override is now possible via select.
                }
            }

        } catch (e: any) {
            console.error('Failed to list pairs', e);
            setListPairsError(e.message || String(e));
            setExistingPairs([]);
        }
    }, [monitorConfig.setupcPath, monitorConfig.virtualSerialPort, monitorConfig.pairedPort, updateConfig]);

    useEffect(() => {
        refreshPairs();
    }, [refreshPairs]);

    // Auto-destroy logic on UNMOUNT (Close)
    useEffect(() => {
        return () => {
            // Cleanup check
            // We need to read the LATEST config because closure might capture old one.
            // But unmount effect only runs once.
            // We can't access "future" state.
            // React refs are good for this.
        };
    }, []);

    // Use ref to track config for cleanup
    const configRef = useState(monitorConfig)[0]; // Logic flaw: this state doesn't update in ref.
    // Better:
    const configRefReal = { current: monitorConfig };
    // Wait, ref object needs to be stable across renders but hold latest value.
    // Actually, we can just use a separate useEffect that depends on nothing but returns a cleanup function 
    // that assumes the component is unmounting. But standard useEffect cleanup runs on re-renders too if deps change.
    // If we want "On App Close" or "On Session Close", it's handled by the parent (SessionManager) usually.
    // BUT the user said "Auto-destroy Virtual Pair on Close".
    // If "Close" means "Clicking Stop Monitor", we handle it in handleToggleConnection.
    // If "Close" means "Closing the tab/app", we need specific handling.
    // Let's implement it in handleToggleConnection (Stop) first, and maybe useSessionManager has a destroy hook.

    // For tab close, session manager should handle cleanup if it knows about resources. 
    // Let's focus on "Stop" button first as that's "Close connection".

    const createNewPair = async () => {
        if (!processPairCreation) return;
        setIsCreatingPair(true);
        try {
            const res = await Com0Com.createPair(monitorConfig.setupcPath!, newPairExt, newPairInt);
            if (res.success) {
                await refreshPairs();
                // Select it automatically?
                updateConfig({ virtualSerialPort: newPairExt });
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
    // We assume PortA is external usually, or allow user to pick either?
    // Let's users pick either side of a pair.
    // DEDUPLICATE: Prevent duplicate keys if mirroring pairs exist or system reports same port twice.
    const availablePairOptions = existingPairs.flatMap(p => [
        { value: p.portA, label: `${p.portA} (paired with ${p.portB})` },
        { value: p.portB, label: `${p.portB} (paired with ${p.portA})` }
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
                // We need the pair ID to delete it.
                const pair = existingPairs.find(p => (p.portA === monitorConfig.virtualSerialPort && p.portB === monitorConfig.pairedPort) || (p.portB === monitorConfig.virtualSerialPort && p.portA === monitorConfig.pairedPort));
                if (pair && pair.id) {
                    console.log('Auto-destroying pair', pair.id);
                    await Com0Com.removePair(monitorConfig.setupcPath!, pair.id);
                    refreshPairs();
                    updateConfig({ virtualSerialPort: '', pairedPort: '' });
                }
            }
        } else {
            // Validate
            if (!monitorConfig.virtualSerialPort || !monitorConfig.physicalSerialPort || !monitorConfig.pairedPort) {
                alert("Please select a valid virtual pair and physical port.");
                return;
            }
            connectSession(session.id);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            <div className="px-4 py-2 border-b border-[var(--vscode-border)] bg-[#252526] text-[11px] font-bold text-[#cccccc] uppercase tracking-wide">
                <span>Monitor Settings</span>
            </div>

            <div className="px-4 py-2 flex flex-col gap-3 overflow-y-auto">
                {/* setupc.exe Path */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">setupc.exe Path</label>
                    <div className="flex gap-1">
                        <input
                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                            value={setupcPath}
                            onChange={(e) => {
                                setSetupcPath(e.target.value);
                                updateConfig({ setupcPath: e.target.value });
                            }}
                            disabled={isConnected}
                        />
                        <button
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-1 px-2 hover:bg-[#4a4a4a]"
                            onClick={async () => {
                                try {
                                    const result = await window.workspaceAPI.openFolder();
                                    if (result.success && result.path) {
                                        const exePath = result.path.endsWith('\\')
                                            ? `${result.path}setupc.exe`
                                            : `${result.path}\\setupc.exe`;
                                        setSetupcPath(exePath);
                                        updateConfig({ setupcPath: exePath });
                                    }
                                } catch (e) {
                                    console.error(e);
                                }
                            }}
                        >
                            <FolderOpen size={14} />
                        </button>
                    </div>
                </div>

                {/* Virtual Pair Management */}
                <div className="flex flex-col gap-1 border border-[#3c3c3c] p-2 bg-[#2d2d2d] rounded-sm">
                    <div className="text-[11px] text-[#969696] flex justify-between items-center mb-1 font-medium">
                        <span>Virtual Pairs</span>
                        <div className="flex gap-1 items-center">
                            <button
                                onClick={(e) => { e.preventDefault(); suggestNextPair(); }}
                                className="p-1 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-white transition-colors"
                                title="Suggest Next Pair"
                            >
                                <Wand2 size={13} />
                            </button>
                            <button
                                onClick={(e) => { e.preventDefault(); refreshPairs(); }}
                                className="p-1 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-white transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw size={13} />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 mb-2">
                        <div className={`flex gap-1 items-center ${isConnected ? 'opacity-50' : ''}`}>
                            <select
                                className="flex-1 min-w-0 bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none disabled:cursor-not-allowed"
                                value={newPairExt}
                                onChange={e => setNewPairExt(e.target.value)}
                                disabled={isConnected}
                            >
                                {Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => (
                                    <option key={com} value={com} disabled={usedPorts.has(com) || physicalPorts.includes(com)}>
                                        {com}
                                    </option>
                                ))}
                            </select>
                            <ArrowRightLeft size={10} className="text-[#969696] shrink-0" />
                            <select
                                className="flex-1 min-w-0 bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none disabled:cursor-not-allowed"
                                value={newPairInt}
                                onChange={e => setNewPairInt(e.target.value)}
                                disabled={isConnected}
                            >
                                {Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => (
                                    <option key={com} value={com} disabled={usedPorts.has(com) || physicalPorts.includes(com) || com === newPairExt}>
                                        {com}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => {
                                if (isConnected) {
                                    showToast('请先停止监控后再创建虚拟串口对', 'info');
                                    return;
                                }
                                createNewPair();
                            }}
                            disabled={isCreatingPair}
                            className={`w-full px-3 py-1.5 text-[12px] rounded-sm transition-colors ${isConnected
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
                                }`}
                        >
                            {isCreatingPair ? 'Creating...' : 'Create Virtual Pair'}
                        </button>
                    </div>

                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                        {existingPairs.map(pair => (
                            <div key={pair.id} className="group flex justify-between items-center text-[12px] bg-[#3c3c3c] px-2 py-1 relative">
                                <span className="text-[#cccccc]">{pair.portA} <ArrowRightLeft size={10} className="inline mx-1" /> {pair.portB}</span>
                                <button
                                    disabled={isConnected}
                                    className={`p-1 rounded transition-colors ${isConnected
                                        ? 'text-gray-600 cursor-not-allowed'
                                        : 'text-[#666] hover:text-[#f48771] hover:bg-[#4a4a4a]'
                                        }`}
                                    onClick={async () => {
                                        if (isConnected) return;
                                        const ok = await confirm({
                                            title: '删除虚拟串口对',
                                            message: `确定要删除此对虚拟串口吗？\n${pair.portA} <-> ${pair.portB}\n注意：如果有其他软件正在占用这些端口，删除可能会导致系统提示重启。`,
                                            type: 'danger',
                                            confirmText: '确认删除'
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
                        {existingPairs.length === 0 && <span className="text-[11px] text-[#808080] italic">No pairs found</span>}
                    </div>
                </div>

                {/* Select Virtual Port (from existing pairs) */}
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696]">Monitor External Port (App connects here)</label>
                        <CustomSelect
                            items={availablePairOptions.length > 0 ? availablePairOptions.map(opt => ({
                                label: opt.label,
                                value: opt.value,
                                // Virtual ports from com0com are usually available unless opened by app
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
                            placeholder="Select Port"
                        />
                    </div>

                    {monitorConfig.pairedPort && (
                        <div className="px-2 py-1.5 bg-[#252526] border border-[#3c3c3c] rounded-sm flex items-center justify-between">
                            <span className="text-[11px] text-[#969696]">Internal Bridge Port:</span>
                            <span className="text-[12px] font-mono text-[#10b981] font-bold">{monitorConfig.pairedPort}</span>
                        </div>
                    )}
                </div>


                {/* Physical Port */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696] flex justify-between">
                        Physical Port (Device)
                        <button onClick={listPorts} className="hover:text-white" title="Refresh Ports">
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
                        placeholder="Select Port"
                    />
                </div>

                <div className="flex flex-col gap-1 py-1">
                    <div
                        className={`flex items-center justify-between cursor-pointer group ${isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => !isConnected && updateConfig({ autoDestroyPair: !monitorConfig.autoDestroyPair })}
                    >
                        <span className="text-[11px] text-[#969696] group-hover:text-[#cccccc] transition-colors">Auto-destroy Pair on Stop</span>
                        <div className={`w-8 h-4 rounded-full flex items-center shrink-0 transition-colors px-0.5 ${monitorConfig.autoDestroyPair ? 'bg-[#10b981]' : 'bg-[#3c3c3c]'}`}>
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${monitorConfig.autoDestroyPair ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                    </div>
                </div>

                {/* Baud Rate & Params for Physical Port */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Baud Rate (Physical)</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={monitorConfig.connection?.baudRate || 115200}
                        onChange={(e) => updateConfig({ connection: { ...monitorConfig.connection, baudRate: Number(e.target.value) } })}
                        disabled={isConnected}
                    >
                        {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(rate => (
                            <option key={rate} value={rate}>{rate}</option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">Data Bits</label>
                        <select
                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                            value={monitorConfig.connection?.dataBits || 8}
                            onChange={(e) => updateConfig({ connection: { ...monitorConfig.connection, dataBits: Number(e.target.value) as any } })}
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
                            value={monitorConfig.connection?.stopBits || 1}
                            onChange={(e) => updateConfig({ connection: { ...monitorConfig.connection, stopBits: Number(e.target.value) as any } })}
                            disabled={isConnected}
                        >
                            {[1, 1.5, 2].map(bit => (
                                <option key={bit} value={bit}>{bit}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Parity</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={monitorConfig.connection?.parity || 'none'}
                        onChange={(e) => updateConfig({ connection: { ...monitorConfig.connection, parity: e.target.value as any } })}
                        disabled={isConnected}
                    >
                        {['none', 'even', 'odd', 'mark', 'space'].map(p => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                    </select>
                </div>

                {/* Connect Button */}
                <div className="space-y-2 mt-auto pt-2">
                    <button
                        className={`w-full py-1.5 px-3 text-white text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-[#a1260d] hover:bg-[#c93f24]'
                            : 'bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                        disabled={(!monitorConfig.virtualSerialPort || !monitorConfig.physicalSerialPort) && !isConnected}
                        onClick={handleToggleConnection}
                    >
                        {isConnected ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        {isConnected ? 'Stop Monitor' : 'Start Monitor'}
                    </button>
                </div>

            </div>
        </div>
    );
};
