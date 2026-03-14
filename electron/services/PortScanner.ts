/**
 * PortScanner.ts
 * 串口扫描器 — 负责列举可用串口、Windows 注册表查询和端口可用性检测。
 * 从 SerialService.ts 的 listPorts 方法中拆分出来。
 */
import { getSerialPort } from '../utils/serialport-loader';

/** 端口可用性检测结果 */
interface PortInfo {
    path: string;
    manufacturer?: string;
    friendlyName?: string;
    pnpId?: string;
    busy?: boolean;
    status?: string;
    error?: string;
}

/**
 * 从系统 SerialPort 库获取端口列表
 */
async function getSystemPorts(): Promise<any[]> {
    const SP = getSerialPort();
    try {
        return SP ? await SP.list() : [];
    } catch (e) {
        console.warn('SerialPort.list failed, falling back to registry', e);
        return [];
    }
}

/**
 * 从 Windows 注册表获取设备映射中的活动串口
 */
async function getActivePortsFromRegistry(): Promise<Map<string, string>> {
    const activePorts = new Map<string, string>();
    const { exec } = require('node:child_process');

    await new Promise<void>((resolve) => {
        exec('reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM', { windowsHide: true }, (err: any, stdout: string) => {
            if (!err && stdout) {
                const lines = stdout.split('\r\n');
                lines.forEach(line => {
                    const parts = line.trim().split(/\s{4,}/);
                    if (parts.length >= 3) {
                        const portName = parts[parts.length - 1];
                        if (portName && portName.startsWith('COM')) {
                            activePorts.set(portName, parts[0]);
                        }
                    }
                });
            }
            resolve();
        });
    });

    return activePorts;
}

/**
 * 从 Windows 注册表获取 com0com 虚拟串口的友好名称
 */
async function getCom0ComFriendlyNames(): Promise<Map<string, string>> {
    const friendlyNames = new Map<string, string>();
    const { exec } = require('node:child_process');

    await new Promise<void>((resolve) => {
        exec('reg query HKLM\\SYSTEM\\CurrentControlSet\\Enum\\com0com /s', { windowsHide: true }, (err: any, stdout: string) => {
            if (!err && stdout) {
                const enumLines = stdout.split('\r\n');
                enumLines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('FriendlyName') && trimmed.includes('REG_SZ')) {
                        const parts = trimmed.split(/\s{4,}/);
                        if (parts.length >= 3) {
                            const name = parts[parts.length - 1];
                            const match = name.match(/\((COM\d+)\)$/);
                            if (match) friendlyNames.set(match[1], name);
                        }
                    }
                });
            }
            resolve();
        });
    });

    return friendlyNames;
}

/**
 * 将注册表端口合并到系统端口列表
 */
function mergeRegistryPorts(
    ports: any[],
    activePorts: Map<string, string>,
    friendlyNames: Map<string, string>
): void {
    activePorts.forEach((device, portName) => {
        const exists = ports.find((p: any) => p.path === portName);
        const friendly = friendlyNames.get(portName);

        let manufacturer = undefined;
        if (device.toLowerCase().includes('com0com')) {
            manufacturer = 'com0com';
        } else if (device.toLowerCase().includes('bthmodem')) {
            manufacturer = 'Microsoft (Bluetooth)';
        }

        if (exists) {
            if (friendly && (!exists.friendlyName || exists.friendlyName === portName || exists.friendlyName.includes('Serial Port'))) {
                exists.friendlyName = friendly;
            }
        } else {
            ports.push({
                path: portName,
                manufacturer: manufacturer,
                friendlyName: friendly || (manufacturer ? `${manufacturer} Port (${portName})` : `Serial Port (${portName})`),
                pnpId: device
            });
        }
    });
}

/**
 * 检测端口可用性（并发探测每个端口是否被占用）
 */
async function checkPortsAvailability(
    ports: any[],
    openedPaths: Set<string>
): Promise<PortInfo[]> {
    const SP = getSerialPort();
    return Promise.all(ports.map(async (port: any) => {
        // 已由本服务打开的端口，直接标记为可用
        if (openedPaths.has(port.path)) {
            return { ...port, busy: false, status: 'available' };
        }

        return new Promise<PortInfo>((resolve) => {
            const p = new SP({
                path: port.path,
                baudRate: 9600,
                autoOpen: false
            });

            p.open((err: any) => {
                if (err) {
                    const errorMsg = err.message || '';
                    const isBusy = errorMsg.includes('Access denied') || errorMsg.includes('File not found') || errorMsg.includes('busy');
                    resolve({
                        ...port,
                        busy: isBusy,
                        status: isBusy ? 'busy' : 'error',
                        error: errorMsg
                    });
                } else {
                    p.close(() => {
                        resolve({ ...port, busy: false, status: 'available' });
                    });
                }
            });
        });
    }));
}

/**
 * 扫描并列举所有可用串口（主入口）
 */
export async function scanPorts(
    openedPaths: Set<string>,
    options?: { includeCom0ComNames?: boolean }
): Promise<{ success: boolean; ports?: PortInfo[]; error?: string }> {
    try {
        const ports = await getSystemPorts();

        // Windows 注册表兜底（支持 com0com 等虚拟串口）
        if (process.platform === 'win32') {
            try {
                const activePorts = await getActivePortsFromRegistry();
                const friendlyNames = options?.includeCom0ComNames
                    ? await getCom0ComFriendlyNames()
                    : new Map<string, string>();
                mergeRegistryPorts(ports, activePorts, friendlyNames);
            } catch (e) {
                console.warn('Registry lookup failed', e);
            }
        }

        // 检测端口占用状态
        const portsWithStatus = await checkPortsAvailability(ports, openedPaths);
        return { success: true, ports: portsWithStatus };
    } catch (error: any) {
        console.error('Error listing ports:', error);
        return { success: false, error: error.message };
    }
}
