/**
 * useVirtualPortState.ts
 * 虚拟串口侧边栏状态管理 Hook — 从 VirtualPortSidebar.tsx 中提取。
 * 管理 com0com 路径检测、端口对列表刷新、创建、删除和监控器开关逻辑。
 */
import { useState, useEffect, useCallback } from 'react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { Com0Com, PairInfo } from '../../utils/com0com';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

export function useVirtualPortState(sessionManager: ReturnType<typeof useSessionManager>) {
    const { showToast } = useToast();
    const { t } = useI18n();
    const { ports, isAdmin, monitorEnabled, toggleMonitor, setupcPath, setSetupcPath, sessions } = sessionManager;

    const [isCreatingPair, setIsCreatingPair] = useState(false);
    const [newPairExt, setNewPairExt] = useState('COM11');
    const [newPairInt, setNewPairInt] = useState('COM12');
    const [existingPairs, setExistingPairs] = useState<PairInfo[]>([]);
    const [listPairsError, setListPairsError] = useState<string | null>(null);
    const [pathStatus, setPathStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
    const [com0comVersion, setCom0comVersion] = useState<string | null>(null);
    const [showInstallDialog, setShowInstallDialog] = useState(false);

    // ── com0com 路径检测 ──
    const checkCom0comPath = useCallback(async (path: string) => {
        if (!path) { setPathStatus('invalid'); return; }
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
        if (!monitorEnabled || !isAdmin) {
            setPathStatus('checking');
            return;
        }
        const timer = setTimeout(() => { checkCom0comPath(setupcPath); }, 500);
        return () => clearTimeout(timer);
    }, [setupcPath, checkCom0comPath, monitorEnabled, isAdmin]);

    // ── 端口对列表 ──
    const refreshPairs = useCallback(async () => {
        if (!setupcPath || !monitorEnabled || !isAdmin) {
            setExistingPairs([]);
            return;
        }
        setListPairsError(null);
        try {
            const pairs = await Com0Com.listPairs(setupcPath);
            setExistingPairs(pairs);
            sessionManager.listPorts();
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

    // ── 端口对创建 ──
    const usedPorts = new Set(existingPairs.flatMap(p => [p.portA, p.portB]));
    const physicalPorts = ports.map(p => p.path);
    const processPairCreation = !isCreatingPair && !!setupcPath;

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

    // ── 监控器开关 ──
    const handleToggleMonitor = (checked: boolean) => {
        if (!checked) {
            const runningMonitors = (sessions || []).filter(
                (s: any) => s.config?.type === 'monitor' && s.isConnected
            );
            if (runningMonitors.length > 0) {
                showToast(t('monitor.stopFirst'), 'warning');
                return;
            }
        }
        toggleMonitor(checked);
    };

    return {
        // 驱动状态
        pathStatus, com0comVersion, showInstallDialog, setShowInstallDialog,
        setupcPath, setSetupcPath,
        isAdmin, monitorEnabled, ports,
        // 端口对
        existingPairs, listPairsError, isCreatingPair,
        newPairExt, setNewPairExt, newPairInt, setNewPairInt,
        usedPorts, physicalPorts, processPairCreation,
        // 操作
        checkCom0comPath, refreshPairs, suggestNextPair, createNewPair, handleToggleMonitor,
    };
}
