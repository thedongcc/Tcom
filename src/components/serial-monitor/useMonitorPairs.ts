/**
 * useMonitorPairs.ts
 * 虚拟串口对管理逻辑 — 从 MonitorConfig.tsx 中提取。
 * 负责刷新端口对列表、自动选择、级联清理。
 */
import { useState, useEffect, useCallback } from 'react';
import { MonitorSessionConfig } from '../../types/session';
import { Com0Com, PairInfo } from '../../utils/com0com';

interface UseMonitorPairsParams {
    monitorConfig: MonitorSessionConfig;
    setupcPath: string | null;
    monitorEnabled: boolean;
    isAdmin: boolean;
    updateConfig: (updates: Partial<MonitorSessionConfig>) => void;
}

/**
 * 从端口对列表中自动选择第一对（按 COM 号排序）
 */
function autoSelectPair(pairs: PairInfo[]): { virtual: string; paired: string } {
    if (pairs.length === 0) return { virtual: '', paired: '' };
    const first = pairs[0];
    const getNum = (p: string) => parseInt(p.replace('COM', '')) || 999;
    return getNum(first.portA) <= getNum(first.portB)
        ? { virtual: first.portA, paired: first.portB }
        : { virtual: first.portB, paired: first.portA };
}

/**
 * 验证当前选择是否仍然有效，无效时自动回退
 */
function validateSelection(
    currentVirtual: string, currentPaired: string, pairs: PairInfo[]
): { virtual: string; paired: string } {
    if (!currentVirtual) return autoSelectPair(pairs);

    const stillExists = pairs.some(p => p.portA === currentVirtual || p.portB === currentVirtual);
    if (!stillExists) return autoSelectPair(pairs);

    // 确保内部端口同步
    const pair = pairs.find(p => p.portA === currentVirtual || p.portB === currentVirtual);
    if (pair) {
        const internal = pair.portA === currentVirtual ? pair.portB : pair.portA;
        return { virtual: currentVirtual, paired: internal };
    }
    return { virtual: currentVirtual, paired: currentPaired };
}

export function useMonitorPairs({ monitorConfig, setupcPath, monitorEnabled, isAdmin, updateConfig }: UseMonitorPairsParams) {
    const [existingPairs, setExistingPairs] = useState<PairInfo[]>([]);
    const [listPairsError, setListPairsError] = useState<string | null>(null);

    const refreshPairs = useCallback(async () => {
        if (!setupcPath || !monitorEnabled || !isAdmin) {
            setExistingPairs([]);
            return;
        }
        setListPairsError(null);
        try {
            const pairs = await Com0Com.listPairs(setupcPath);
            setExistingPairs(pairs);

            const { virtual, paired } = validateSelection(
                monitorConfig.virtualSerialPort || '', monitorConfig.pairedPort || '', pairs
            );

            if (virtual !== monitorConfig.virtualSerialPort || paired !== monitorConfig.pairedPort) {
                updateConfig({ virtualSerialPort: virtual, pairedPort: paired });
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

    // 在条件变化时自动刷新
    useEffect(() => {
        if (setupcPath && monitorEnabled && isAdmin) {
            refreshPairs();
        } else {
            setExistingPairs([]);
        }
    }, [setupcPath, monitorEnabled, isAdmin, refreshPairs]);

    // 构建可选端口列表
    const availablePairOptions = existingPairs.flatMap(p => [
        { value: p.portA, label: p.portA, paired: p.portB },
        { value: p.portB, label: p.portB, paired: p.portA }
    ]).reduce((acc, cur) => {
        if (!acc.find(item => item.value === cur.value)) acc.push(cur);
        return acc;
    }, [] as { value: string; label: string; paired: string }[]);

    return {
        existingPairs,
        listPairsError,
        availablePairOptions,
        refreshPairs,
    };
}
