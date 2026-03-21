/**
 * usePortScanner.ts
 * 串口端口扫描、com0com 虚拟串口集成、管理员权限检测。
 * 从 useSessionManager 中拆分出来以实现职责单一。
 *
 * setupcPath 和 monitorEnabled 持久化到全局设置（globalSettingsAPI）。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { SerialPortInfo } from '../vite-env';
import { Com0Com } from '../utils/com0com';

export interface UsePortScannerReturn {
    ports: SerialPortInfo[];
    isAdmin: boolean;
    monitorEnabled: boolean;
    setupcPath: string;
    monitorEnabledRef: React.MutableRefObject<boolean>;
    isAdminRef: React.MutableRefObject<boolean>;
    listPorts: (isSilent?: boolean) => Promise<void>;
    toggleMonitor: (enabled: boolean) => void;
    setSetupcPath: (path: string) => void;
    findSetupcPath: () => string;
}

export const usePortScanner = (): UsePortScannerReturn => {
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    // 初始值从 localStorage 快速恢复（防首帧闪变），后续被 globalSettingsAPI 覆盖
    const [monitorEnabled, setMonitorEnabled] = useState(() => {
        return localStorage.getItem('tcom-monitor-enabled') !== 'false';
    });
    const [setupcPath, setSetupcPathState] = useState(() => {
        return localStorage.getItem('tcom-setupc-path') || '';
    });

    const monitorEnabledRef = useRef(monitorEnabled);
    const isAdminRef = useRef(isAdmin);
    const settingsLoadedRef = useRef(false);

    useEffect(() => { monitorEnabledRef.current = monitorEnabled; }, [monitorEnabled]);
    useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

    // 从全局设置加载 setupcPath 和 monitorEnabled
    useEffect(() => {
        const load = async () => {
            try {
                const res = await window.globalSettingsAPI?.loadState();
                if (res?.data) {
                    if (typeof res.data.setupcPath === 'string') {
                        setSetupcPathState(res.data.setupcPath);
                    }
                    if (typeof res.data.monitorEnabled === 'boolean') {
                        setMonitorEnabled(res.data.monitorEnabled);
                    }
                }
            } catch (e) {
                console.warn('[PortScanner] 从全局设置加载 setupcPath/monitorEnabled 失败:', e);
            }
            settingsLoadedRef.current = true;
        };
        load();
    }, []);

    // 保存 setupcPath 到全局设置
    const persistSetupcPath = useCallback(async (path: string) => {
        try {
            const res = await window.globalSettingsAPI?.loadState();
            const state = res?.data || {};
            await window.globalSettingsAPI?.saveState({ ...state, setupcPath: path });
        } catch (e) {
            console.warn('[PortScanner] 保存 setupcPath 失败:', e);
        }
    }, []);

    // 保存 monitorEnabled 到全局设置
    const persistMonitorEnabled = useCallback(async (enabled: boolean) => {
        try {
            const res = await window.globalSettingsAPI?.loadState();
            const state = res?.data || {};
            await window.globalSettingsAPI?.saveState({ ...state, monitorEnabled: enabled });
        } catch (e) {
            console.warn('[PortScanner] 保存 monitorEnabled 失败:', e);
        }
    }, []);

    const setSetupcPath = useCallback((path: string) => {
        setSetupcPathState(path);
        // 同时写 localStorage（快速恢复缓存）和文件系统（持久化）
        localStorage.setItem('tcom-setupc-path', path);
        persistSetupcPath(path);
    }, [persistSetupcPath]);

    const findSetupcPath = useCallback(() => {
        return setupcPath;
    }, [setupcPath]);

    const listPorts = useCallback(async (isSilent?: boolean) => {
        const silent = isSilent === true;
        let allPorts: SerialPortInfo[] = [];
        if (window.serialAPI) {
            const res = await window.serialAPI.listPorts({ includeCom0ComNames: monitorEnabledRef.current });
            if (res.success) allPorts = res.ports;
        }
        const currentSetupcPath = setupcPath;
        if (monitorEnabledRef.current && currentSetupcPath) {
            try {
                const pairs = await Com0Com.listPairs(currentSetupcPath, silent);
                pairs.forEach(pair => {
                    if (!allPorts.find(p => p.path === pair.portA)) {
                        allPorts.push({ path: pair.portA, manufacturer: 'com0com', friendlyName: `Virtual Port (${pair.portA})` });
                    }
                    if (!allPorts.find(p => p.path === pair.portB)) {
                        allPorts.push({ path: pair.portB, manufacturer: 'com0com', friendlyName: `Virtual Port (${pair.portB})` });
                    }
                });
            } catch (e: unknown) {
                const errStr = e instanceof Error ? e.message : String(e);
                if (!errStr.includes('Unauthorized command') && !errStr.includes('Unauthorized')) {
                    console.warn("Failed to list com0com ports", e);
                }
            }
        }
        // 稳定排序：按端口路径排序，避免每次轮询时顺序抖动
        allPorts.sort((a, b) => {
            const numA = parseInt(a.path.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.path.replace(/\D/g, '')) || 0;
            return numA - numB;
        });
        // 只在数据实际变化时更新 state，避免触发下游 useEffect 连锁
        setPorts(prev => {
            const prevKey = prev.map(p => `${p.path}|${p.friendlyName}|${p.busy}`).join(',');
            const newKey = allPorts.map(p => `${p.path}|${p.friendlyName}|${p.busy}`).join(',');
            return prevKey === newKey ? prev : allPorts;
        });
    }, [setupcPath]);

    const toggleMonitor = useCallback((enabled: boolean) => {
        // 严格权限检查
        if (enabled && !isAdminRef.current) {
            enabled = false;
        }
        setMonitorEnabled(enabled);
        // 同时写 localStorage（快速恢复缓存）和文件系统（持久化）
        localStorage.setItem('tcom-monitor-enabled', String(enabled));
        persistMonitorEnabled(enabled);
        if (enabled) {
            void listPorts();
        } else {
            // 禁用时移除 com0com 端口
            setPorts(prev => prev.filter(p => p.manufacturer !== 'com0com' && !p.friendlyName?.includes('Virtual')));
        }
    }, [listPorts, persistMonitorEnabled]);

    // 启动时检测管理员权限
    useEffect(() => {
        const checkAdmin = async () => {
            let admin = false;
            if (window.com0comAPI?.isAdmin) {
                admin = await window.com0comAPI.isAdmin();
                setIsAdmin(admin);
            }
            // 非管理员自动关闭监控
            if (!admin && monitorEnabledRef.current) {
                console.log('[PortScanner] Non-admin detected, auto-disabling monitor.');
                setMonitorEnabled(false);
                localStorage.setItem('tcom-monitor-enabled', 'false');
                persistMonitorEnabled(false);
            }
        };
        checkAdmin();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 端口扫描定时器
    useEffect(() => {
        // ⚡ 首次扫描延迟从 300ms 缩短到 100ms
    const firstScanTimer = setTimeout(() => void listPorts(false), 100);
        const interval = setInterval(() => void listPorts(true), 2000);
        return () => {
            clearTimeout(firstScanTimer);
            clearInterval(interval);
        };
    }, [listPorts]);

    return {
        ports, isAdmin, monitorEnabled, setupcPath,
        monitorEnabledRef, isAdminRef,
        listPorts, toggleMonitor, setSetupcPath, findSetupcPath,
    };
};
