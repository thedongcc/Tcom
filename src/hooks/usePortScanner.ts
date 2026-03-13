/**
 * usePortScanner.ts
 * 串口端口扫描、com0com 虚拟串口集成、管理员权限检测。
 * 从 useSessionManager 中拆分出来以实现职责单一。
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
    const [monitorEnabled, setMonitorEnabled] = useState(() => {
        return localStorage.getItem('tcom-monitor-enabled') !== 'false';
    });
    const [setupcPath, setSetupcPathState] = useState(() => {
        return localStorage.getItem('tcom-setupc-path') || '';
    });

    const monitorEnabledRef = useRef(monitorEnabled);
    const isAdminRef = useRef(isAdmin);

    useEffect(() => { monitorEnabledRef.current = monitorEnabled; }, [monitorEnabled]);
    useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

    const setSetupcPath = useCallback((path: string) => {
        setSetupcPathState(path);
        localStorage.setItem('tcom-setupc-path', path);
    }, []);

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
        setPorts(allPorts);
    }, [setupcPath]);

    const toggleMonitor = useCallback((enabled: boolean) => {
        // 严格权限检查
        if (enabled && !isAdminRef.current) {
            enabled = false;
        }
        setMonitorEnabled(enabled);
        localStorage.setItem('tcom-monitor-enabled', String(enabled));
        if (enabled) {
            listPorts();
        } else {
            // 禁用时移除 com0com 端口
            setPorts(prev => prev.filter(p => p.manufacturer !== 'com0com' && !p.friendlyName?.includes('Virtual')));
        }
    }, [listPorts]);

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
            }
        };
        checkAdmin();
    }, []);

    // 端口扫描定时器
    useEffect(() => {
        const firstScanTimer = setTimeout(() => listPorts(false), 300);
        const interval = setInterval(() => listPorts(true), 2000);
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
