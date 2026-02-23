import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Wand2, ArrowRightLeft, FolderOpen, Trash2, X, AlertCircle } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { Com0Com, PairInfo } from '../../utils/com0com';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../../components/common/CustomSelect';
import { Switch } from '../../components/common/Switch';
import { useI18n } from '../../context/I18nContext';

interface VirtualPortSidebarProps {
    onNavigate: (view: string) => void;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const VirtualPortSidebar = ({ onNavigate, sessionManager }: VirtualPortSidebarProps) => {
    const { confirm } = useConfirm();
    const { showToast } = useToast();
    const { t } = useI18n();
    const { ports, isAdmin, monitorEnabled, toggleMonitor, setupcPath, setSetupcPath } = sessionManager;

    const [isCreatingPair, setIsCreatingPair] = useState(false);
    const [newPairExt, setNewPairExt] = useState('COM11');
    const [newPairInt, setNewPairInt] = useState('COM12');
    const [existingPairs, setExistingPairs] = useState<PairInfo[]>([]);
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
        // 只在功能开启时才做路径检测
        if (!monitorEnabled || !isAdmin) {
            setPathStatus('checking'); // 重置为初始态
            return;
        }
        const timer = setTimeout(() => {
            checkCom0comPath(setupcPath);
        }, 500);
        return () => clearTimeout(timer);
    }, [setupcPath, checkCom0comPath, monitorEnabled, isAdmin]);

    const refreshPairs = useCallback(async () => {
        if (!setupcPath || !monitorEnabled || !isAdmin) {
            setExistingPairs([]);
            return;
        }
        setListPairsError(null);
        try {
            const pairs = await Com0Com.listPairs(setupcPath);
            setExistingPairs(pairs);
            sessionManager.listPorts(); // Refresh global ports as well
        } catch (e: any) {
            const errStr = e.message || String(e);
            if (!errStr.includes('Unauthorized command')) {
                console.error('Failed to list pairs', e);
                setListPairsError(errStr);
            }
            setExistingPairs([]);
        }
    }, [setupcPath, monitorEnabled, isAdmin]);

    useEffect(() => {
        if (setupcPath && monitorEnabled && isAdmin && pathStatus === 'valid') {
            refreshPairs();
        } else if (!monitorEnabled || !isAdmin || pathStatus === 'invalid') {
            setExistingPairs([]);
        }
    }, [setupcPath, monitorEnabled, isAdmin, pathStatus, refreshPairs]);

    const processPairCreation = !isCreatingPair && setupcPath;

    const usedPorts = new Set(existingPairs.flatMap(p => [p.portA, p.portB]));
    const physicalPorts = ports.map(p => p.path);

    const suggestNextPair = (currentUsed?: Set<string>, currentPhysical?: string[]) => {
        const used = currentUsed ?? usedPorts;
        const physical = currentPhysical ?? physicalPorts;
        let i = 1;
        while (used.has(`COM${i}`) || used.has(`COM${i + 1}`) || physical.includes(`COM${i}`) || physical.includes(`COM${i + 1}`)) i++;
        setNewPairExt(`COM${i}`);
        setNewPairInt(`COM${i + 1}`);
    };

    const createNewPair = async () => {
        if (!processPairCreation) return;

        // 创建前检测两个端口是否已被占用
        if (usedPorts.has(newPairExt) || usedPorts.has(newPairInt) || physicalPorts.includes(newPairExt) || physicalPorts.includes(newPairInt)) {
            showToast(`端口 ${newPairExt} 或 ${newPairInt} 已被占用，已自动切换到可用端口对`, 'warning');
            suggestNextPair();
            return;
        }

        setIsCreatingPair(true);
        try {
            const res = await Com0Com.createPair(setupcPath, newPairExt, newPairInt);
            if (res.success) {
                await refreshPairs();
                // 创建成功后自动建议下一对，避免重复创建
                const newUsed = new Set([...usedPorts, newPairExt, newPairInt]);
                suggestNextPair(newUsed);
            } else {
                showToast(`创建失败: ${res.error}`, 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('创建虚拟串口对时发生错误', 'error');
        } finally {
            setIsCreatingPair(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)] overflow-y-auto w-full">
            <div className="p-4 flex flex-col gap-4">
                {/* Global Monitor Enable Switch */}
                <div className="border border-[#3c3c3c] p-3 bg-[#2d2d2d] rounded-sm">
                    <Switch
                        label={t('monitor.enableVirtualMonitor')}
                        checked={monitorEnabled}
                        onChange={(checked) => toggleMonitor(checked)}
                        disabled={!isAdmin}
                    />
                    {!isAdmin && (
                        <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded-sm">
                            <p className="text-[11px] text-[#f48771]">
                                {t('monitor.adminRequired')}
                            </p>
                        </div>
                    )}
                </div>

                <div className={`${(!monitorEnabled || !isAdmin) ? 'opacity-40 pointer-events-none grayscale-[0.5]' : ''} flex flex-col gap-4 transition-all duration-300`}>

                    {/* setupc.exe Path */}
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center h-[18px]">
                            <label className="text-[11px] text-[#969696] mb-0">{t('monitor.setupcPath')}</label>
                            <button
                                className="text-[11px] text-[#0e639c] hover:text-[#1177bb] transition-colors"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowInstallDialog(true); }}
                            >
                                {t('monitor.installCom0com')}
                            </button>
                        </div>
                        <div className="flex gap-1 w-full">
                            <input
                                className="w-[10px] flex-1 bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                                value={setupcPath}
                                onChange={(e) => setSetupcPath(e.target.value)}
                            />
                            <button
                                className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-1 px-2 transition-colors hover:bg-[#4a4a4a] shrink-0"
                                onClick={async () => {
                                    try {
                                        const result = await window.shellAPI?.showOpenDialog({
                                            title: '选择 setupc.exe',
                                            filters: [{ name: 'com0com installer (setupc.exe)', extensions: ['exe'] }],
                                            properties: ['openFile']
                                        });
                                        if (result && !result.canceled && result.filePaths.length > 0) {
                                            setSetupcPath(result.filePaths[0]);
                                        }
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
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
                    <div className="flex flex-col gap-2 border border-[#3c3c3c] p-3 bg-[#2d2d2d] rounded-sm">
                        <div className="text-[11px] text-[#969696] flex justify-between items-center mb-1 font-medium">
                            <span>{t('monitor.virtualPairs')}</span>
                            <div className="flex gap-1 items-center">
                                <button
                                    onClick={(e) => { e.preventDefault(); suggestNextPair(); }}
                                    className="p-1 rounded text-[#969696] transition-colors hover:bg-[#3c3c3c] hover:text-white"
                                    title={t('monitor.suggestNextPair')}
                                >
                                    <Wand2 size={13} />
                                </button>
                                <button
                                    onClick={(e) => { e.preventDefault(); if (pathStatus === 'valid') refreshPairs(); }}
                                    className={`p-1 rounded text-[#969696] transition-colors ${pathStatus !== 'valid' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#3c3c3c] hover:text-white'}`}
                                    title={t('monitor.refresh')}
                                    disabled={pathStatus !== 'valid'}
                                >
                                    <RefreshCw size={13} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 mb-2">
                            <div className="flex gap-1 items-center">
                                <CustomSelect
                                    items={Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => ({
                                        label: com,
                                        value: com,
                                        disabled: usedPorts.has(com) || physicalPorts.includes(com)
                                    }))}
                                    value={newPairExt}
                                    onChange={val => setNewPairExt(val)}
                                    disabled={pathStatus !== 'valid'}
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
                                    disabled={pathStatus !== 'valid'}
                                />
                            </div>
                            <button
                                onClick={() => {
                                    if (pathStatus !== 'valid') return;
                                    createNewPair();
                                }}
                                disabled={isCreatingPair || !isAdmin || !monitorEnabled || pathStatus !== 'valid'}
                                className={`w-full px-3 py-1.5 text-[12px] rounded-sm transition-colors ${!isAdmin || !monitorEnabled || pathStatus !== 'valid'
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
                                    }`}
                            >
                                {isCreatingPair ? t('monitor.creating') : t('monitor.createVirtualPair')}
                            </button>
                        </div>

                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {existingPairs.map(pair => (
                                <div key={pair.id} className="group flex justify-between items-center text-[12px] bg-[#3c3c3c] px-2 py-1.5 relative hover:bg-[#444444] transition-colors rounded-sm mb-1 last:mb-0">
                                    <div className="grid grid-cols-[45px_20px_45px] items-center font-mono">
                                        <span className="text-[#cccccc]">{pair.portA}</span>
                                        <ArrowRightLeft size={10} className="text-[#808080]" />
                                        <span className="text-[#cccccc]">{pair.portB}</span>
                                    </div>
                                    <button
                                        className="p-1 rounded transition-colors text-[#666] hover:text-[#f48771] hover:bg-[#4a4a4a]"
                                        onClick={async () => {
                                            const ok = await confirm({
                                                title: t('monitor.deletePairTitle'),
                                                message: t('monitor.deletePairMessage', { portA: pair.portA, portB: pair.portB }),
                                                type: 'danger',
                                                confirmText: t('monitor.deletePairConfirm')
                                            });
                                            if (ok) {
                                                await Com0Com.removePair(setupcPath, pair.id);
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
                </div>
            </div>

            {/* Install Com0com Dialog */}
            {showInstallDialog && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowInstallDialog(false)}>
                    <div
                        className="bg-[#252526] border border-[#3c3c3c] shadow-2xl w-[400px] flex flex-col rounded-md overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-2.5 border-b border-[#3c3c3c] bg-[#2d2d2d]">
                            <span className="text-[11px] font-bold text-[#cccccc] uppercase tracking-wider">{t('monitor.installMethodTitle')}</span>
                            <button onClick={() => setShowInstallDialog(false)} className="text-[#969696] hover:text-white transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="p-5 flex gap-4 items-start">
                            <div className="shrink-0 mt-0.5"><AlertCircle className="text-[#007acc]" size={24} /></div>
                            <div className="flex-1">
                                <p className="text-[13px] text-[#cccccc] leading-relaxed whitespace-pre-wrap">{t('monitor.installMethodDesc')}</p>
                            </div>
                        </div>
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
