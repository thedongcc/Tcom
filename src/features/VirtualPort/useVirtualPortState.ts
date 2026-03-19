/**
 * useVirtualPortState.ts
 * 虚拟串口侧边栏状态管理 Hook — 从 VirtualPortSidebar.tsx 中提取。
 * 管理 com0com 路径检测、端口对列表刷新、创建、删除和监控器开关逻辑。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { Com0Com, PairInfo } from '../../utils/com0com';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';
import { invoke } from '@tauri-apps/api/core';

export function useVirtualPortState(sessionManager: ReturnType<typeof useSessionManager>) {
    const { showToast } = useToast();
    const { t } = useI18n();
    const { ports, isAdmin, monitorEnabled, toggleMonitor, setupcPath, setSetupcPath, sessions } = sessionManager;

    const [isCreatingPair, setIsCreatingPair] = useState(false);
    const [newPairExt, setNewPairExt] = useState('');
    const [newPairInt, setNewPairInt] = useState('');
    const [existingPairs, setExistingPairs] = useState<PairInfo[]>([]);
    const [listPairsError, setListPairsError] = useState<string | null>(null);
    const [pathStatus, setPathStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
    const [com0comVersion, setCom0comVersion] = useState<string | null>(null);
    const [showInstallDialog, setShowInstallDialog] = useState(false);
    const [ghostPorts, setGhostPorts] = useState<Set<string>>(new Set());

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
    // 获取幽灵端口列表（只在实际变化时更新 Set 引用）
    const ghostPortsRef = useRef<Set<string>>(new Set());
    const refreshGhostPorts = useCallback(async () => {
        try {
            const res = await invoke<{ success: boolean; ghostPorts: string[] }>('serial_list_ghost_ports');
            if (res.success) {
                const newGhosts = res.ghostPorts.sort();
                const oldKey = [...ghostPortsRef.current].sort().join(',');
                const newKey = newGhosts.join(',');
                if (oldKey !== newKey) {
                    const newSet = new Set(newGhosts);
                    ghostPortsRef.current = newSet;
                    setGhostPorts(newSet);
                }
            }
        } catch { /* 静默忽略 */ }
    }, []);

    const refreshPairs = useCallback(async () => {
        if (!monitorEnabled || !isAdmin) {
            setExistingPairs([]);
            return;
        }
        setListPairsError(null);
        try {
            const pairs = await Com0Com.listPairs(setupcPath);
            setExistingPairs(pairs);
            sessionManager.listPorts();
        } catch (e: unknown) {
            const errStr = e instanceof Error ? e.message : String(e);
            if (!errStr.includes('Unauthorized command')) {
                console.error('Failed to list pairs', e);
                setListPairsError(errStr);
            }
            setExistingPairs([]);
        }
        // 同步刷新幽灵端口
        await refreshGhostPorts();
    }, [setupcPath, monitorEnabled, isAdmin, refreshGhostPorts]);

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
        // 跳过已占用、物理端口和幽灵端口
        while (used.has(`COM${i}`) || used.has(`COM${i + 1}`) || physical.includes(`COM${i}`) || physical.includes(`COM${i + 1}`) || ghostPorts.has(`COM${i}`) || ghostPorts.has(`COM${i + 1}`)) i++;
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

    // 首次挂载时获取幽灵端口
    useEffect(() => { refreshGhostPorts(); }, [refreshGhostPorts]);

    // ghostPorts 或 existingPairs 变化后自动推荐可用端口（仅在当前选择为空或不可用时）
    // 使用稳定的标量值作为依赖（而非对象引用）避免无限循环
    const ghostCount = ghostPorts.size;
    const pairCount = existingPairs.length;
    const initDone = useRef(false);
    useEffect(() => {
        if (!initDone.current && ghostCount === 0 && pairCount === 0) return;
        initDone.current = true;
        const needsSuggestion = !newPairExt || !newPairInt
            || usedPorts.has(newPairExt) || usedPorts.has(newPairInt)
            || physicalPorts.includes(newPairExt) || physicalPorts.includes(newPairInt)
            || ghostPorts.has(newPairExt) || ghostPorts.has(newPairInt);
        if (needsSuggestion) {
            suggestNextPair();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ghostCount, pairCount]);

    return {
        // 驱动状态
        pathStatus, com0comVersion, showInstallDialog, setShowInstallDialog,
        setupcPath, setSetupcPath,
        isAdmin, monitorEnabled, ports,
        // 端口对
        existingPairs, listPairsError, isCreatingPair,
        newPairExt, setNewPairExt, newPairInt, setNewPairInt,
        usedPorts, physicalPorts, ghostPorts, processPairCreation,
        // 操作
        checkCom0comPath, refreshPairs, suggestNextPair, createNewPair, handleToggleMonitor,
    };
}
