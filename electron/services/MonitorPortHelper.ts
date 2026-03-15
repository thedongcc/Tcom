/**
 * MonitorPortHelper.ts
 * 监控端口工具函数 — 打开/关闭/探测端口。
 * 从 MonitorService.ts 中拆分出来。
 */
import type { SerialPortInstance } from '../types/serialport.types';

/** 格式化端口路径，移除 Windows UNC 前缀 */
export function formatPortPath(path: string): string {
    if (!path) return path;
    return path.replace(/^\\\\\\.\\/, '');
}

/**
 * 打开端口，包含 Windows UNC 路径重试逻辑。
 * @param SP SerialPort 构造函数
 * @param path 端口路径
 * @param baudRate 波特率
 * @param label 端口标签（用于日志）
 * @returns 已打开的端口实例
 */
export async function openPortWithRetry(
    SP: new (options: Record<string, unknown>) => SerialPortInstance,
    path: string,
    baudRate: number,
    label: string,
): Promise<SerialPortInstance> {
    const defaultOptions: Record<string, unknown> = {
        path,
        baudRate,
        autoOpen: false,
        // 关闭所有硬件/软件流控，避免 com0com 对端未连接时驱动挂起
        rtscts: false,
        xon: false,
        xoff: false,
        hupcl: false,
    };
    let port = new SP(defaultOptions);

    const attemptOpen = (p: SerialPortInstance) => new Promise<SerialPortInstance>((resolve, reject) => {
        p.open((err?: Error | null) => err ? reject(err) : resolve(p));
    });

    try {
        return await attemptOpen(port);
    } catch (err: unknown) {
        const errMsg = (err as Error).message;
        if (process.platform === 'win32' && (errMsg.includes('File not found') || errMsg.includes('Access denied'))) {
            const retryPath = path.startsWith('\\\\.\\') ? path : `\\\\.\\${path}`;
            if (retryPath !== path) {
                console.log(`[Monitor] Retrying ${label} with ${retryPath}`);
                port.close(() => { });

                const retryPort = new SP({ ...defaultOptions, path: retryPath });
                try {
                    return await attemptOpen(retryPort);
                } catch (retryErr: unknown) {
                    throw new Error(formatErrorMessage((retryErr as Error).message, retryPath));
                }
            }
        }
        throw new Error(formatErrorMessage(errMsg, path));
    }
}

/**
 * 检测指定端口是否被外部程序占用。
 * 通过尝试打开端口来判断：如果返回 access denied 则表示被占用。
 */
export function isPortBusy(
    SP: new (options: Record<string, unknown>) => SerialPortInstance,
    portPath: string,
): Promise<boolean> {
    return new Promise(resolve => {
        const probe = new SP({ path: portPath, baudRate: 9600, autoOpen: false });
        probe.open((err?: Error | null) => {
            if (err) {
                resolve(/access denied|denied|busy|being used/i.test(err.message));
            } else {
                probe.close(() => resolve(false));
            }
        });
    });
}

/**
 * 强制关闭端口，带超时保护。
 */
export function forceClosePort(port: SerialPortInstance | null): Promise<void> {
    if (!port) return Promise.resolve();
    port.removeAllListeners();
    return new Promise<void>(resolve => {
        if (!port.isOpen) return resolve();
        const timeout = setTimeout(() => { resolve(); }, 3000);
        port.close(() => { clearTimeout(timeout); resolve(); });
    });
}

/** 格式化端口错误消息 */
function formatErrorMessage(message: string, path: string): string {
    const simplePath = formatPortPath(path);
    if (message.includes('Access denied')) {
        return `Selected Port: ${simplePath} is occupied (Access Denied)`;
    }
    if (message.includes('File not found')) {
        return `Selected Port: ${simplePath} not found`;
    }
    return message;
}
