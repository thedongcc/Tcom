import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, Settings, FileText, ArrowRightLeft, FolderOpen, Trash2 } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { MonitorSessionConfig } from '../../types/session';
import { Com0Com, PairInfo } from '../../utils/com0com';

interface MonitorConfigPanelProps {
    session: any;
    sessionManager: ReturnType<typeof useSessionManager>;
}

export const MonitorConfigPanel = ({ session, sessionManager }: MonitorConfigPanelProps) => {
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
        // Poll every few seconds in case changed externally?
        // const timer = setInterval(refreshPairs, 5000);
        // return () => clearInterval(timer);
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
        let i = 11;
        while (usedPorts.has(`COM${i}`) || usedPorts.has(`COM${i + 1}`) || physicalPorts.includes(`COM${i}`) || physicalPorts.includes(`COM${i + 1}`)) i += 2;
        setNewPairExt(`COM${i}`);
        setNewPairInt(`COM${i + 1}`);
    };

    // Available virtual ports for SELECTION (only External ports of existing pairs)
    // We assume PortA is external usually, or allow user to pick either?
    // Let's users pick either side of a pair.
    const availablePairOptions = existingPairs.flatMap(p => [
        { value: p.portA, label: `${p.portA} (paired with ${p.portB})` },
        { value: p.portB, label: `${p.portB} (paired with ${p.portA})` }
    ]);

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
                <div className="flex flex-col gap-1 border border-[#3c3c3c] p-2 bg-[#2d2d2d]">
                    <label className="text-[11px] text-[#969696] flex justify-between items-center mb-1">
                        Virtual Pairs
                        <div className="flex gap-1">
                            <button onClick={() => { suggestNextPair(); }} className="hover:text-white" title="Suggest Next Pair"><FileText size={10} /></button>
                            <button onClick={refreshPairs} title="Refresh"><RefreshCw size={10} /></button>
                        </div>
                    </label>

                    {!isConnected && (
                        <div className="flex gap-1 mb-2 items-center">
                            <select
                                className="w-20 bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none"
                                value={newPairExt}
                                onChange={e => setNewPairExt(e.target.value)}
                            >
                                {Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => (
                                    <option key={com} value={com} disabled={usedPorts.has(com) || physicalPorts.includes(com)}>
                                        {com}
                                    </option>
                                ))}
                            </select>
                            <ArrowRightLeft size={10} className="text-[#969696]" />
                            <select
                                className="w-20 bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none"
                                value={newPairInt}
                                onChange={e => setNewPairInt(e.target.value)}
                            >
                                {Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => (
                                    <option key={com} value={com} disabled={usedPorts.has(com) || physicalPorts.includes(com) || com === newPairExt}>
                                        {com}
                                    </option>
                                ))}
                            </select>
                            <button onClick={createNewPair} disabled={isCreatingPair} className="bg-[#0e639c] text-white px-2 py-1 text-[11px] rounded hover:bg-[#1177bb]">
                                {isCreatingPair ? '...' : 'Create'}
                            </button>
                        </div>
                    )}

                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                        {existingPairs.map(pair => (
                            <div key={pair.id} className="flex justify-between items-center text-[12px] bg-[#3c3c3c] px-2 py-1 rounded">
                                <span className="text-[#cccccc]">{pair.portA} <ArrowRightLeft size={10} className="inline mx-1" /> {pair.portB}</span>
                                {!isConnected && (
                                    <button
                                        className="text-[#cccccc] hover:text-[var(--vscode-errorForeground)]"
                                        onClick={async () => {
                                            if (confirm(`Delete pair ${pair.portA} <-> ${pair.portB}?`)) {
                                                await Com0Com.removePair(monitorConfig.setupcPath!, pair.id);
                                                refreshPairs();
                                            }
                                        }}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {existingPairs.length === 0 && <span className="text-[11px] text-[#808080] italic">No pairs found</span>}
                    </div>
                </div>

                {/* Select Virtual Port (from existing pairs) */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Monitor External Port (App connects here)</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={monitorConfig.virtualSerialPort || ''}
                        onChange={(e) => {
                            const port = e.target.value;
                            updateConfig({ virtualSerialPort: port });
                            // Auto-find internal port
                            const pair = existingPairs.find(p => p.portA === port || p.portB === port);
                            if (pair) {
                                const internal = pair.portA === port ? pair.portB : pair.portA;
                                updateConfig({ pairedPort: internal });
                            }
                        }}
                        disabled={isConnected}
                    >
                        <option value="" disabled>Select Port</option>
                        {/* Prefer Setupc Pairs info if available */}
                        {availablePairOptions.length > 0 ? (
                            availablePairOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))
                        ) : (
                            /* Fallback to Registry com0com ports */
                            ports.filter(p => p.manufacturer === 'com0com' || p.friendlyName?.includes('com0com') || p.friendlyName?.includes('Virtual')).map(port => (
                                <option key={port.path} value={port.path}>
                                    {port.friendlyName
                                        ? `${port.path} - ${port.friendlyName.replace(`(${port.path})`, '').trim()}`
                                        : port.path}
                                </option>
                            ))
                        )}
                    </select>
                    <label className="text-[11px] text-[#969696] mt-2">Internal Bridge Port (Paired with External)</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={monitorConfig.pairedPort || ''}
                        onChange={(e) => {
                            updateConfig({ pairedPort: e.target.value });
                        }}
                        disabled={isConnected}
                    >
                        <option value="" disabled>Select Internal Port</option>
                        {ports.map(port => (
                            <option key={port.path} value={port.path}>
                                {port.friendlyName
                                    ? `${port.path} - ${port.friendlyName.replace(`(${port.path})`, '').trim()}`
                                    : port.path}
                            </option>
                        ))}
                    </select>
                </div>


                {/* Physical Port */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696] flex justify-between">
                        Physical Port (Device)
                        <button onClick={listPorts} className="hover:text-white" title="Refresh Ports">
                            <RefreshCw size={12} />
                        </button>
                    </label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={monitorConfig.physicalSerialPort || ''}
                        onChange={(e) => {
                            updateConfig({
                                physicalSerialPort: e.target.value,
                                connection: { ...monitorConfig.connection, path: e.target.value }
                            });
                        }}
                        disabled={isConnected}
                    >
                        <option value="" disabled>Select Port</option>
                        {ports.map(port => (
                            <option key={port.path} value={port.path}>
                                {port.friendlyName
                                    ? `${port.path} - ${port.friendlyName.replace(`(${port.path})`, '').trim()}`
                                    : port.path}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696] flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={monitorConfig.autoDestroyPair ?? false}
                            onChange={(e) => updateConfig({ autoDestroyPair: e.target.checked })}
                            disabled={isConnected}
                        />
                        Auto-destroy Pair on Stop
                    </label>
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
