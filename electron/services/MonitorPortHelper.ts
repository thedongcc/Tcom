/**
 * MonitorPortHelper.ts
 * 监控端口打开和重试逻辑。
 * 从 MonitorService.ts 中拆分出来。
 */

/** 格式化端口路径，移除 Windows UNC 前缀 */
export function formatPortPath(path: string): string {
    if (!path) return path;
    return path.replace(/^\\\\.\\/, '');
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
    SP: any,
    path: string,
    baudRate: number,
    label: string,
): Promise<any> {
    let port = new SP({ path, baudRate, autoOpen: false });

    const attemptOpen = (p: any) => new Promise((resolve, reject) => {
        p.open((err: any) => err ? reject(err) : resolve(p));
    });

    try {
        return await attemptOpen(port);
    } catch (err: any) {
        if (process.platform === 'win32' && (err.message.includes('File not found') || err.message.includes('Access denied'))) {
            const retryPath = path.startsWith('\\\\.\\') ? path : `\\\\.\\${path}`;
            if (retryPath !== path) {
                console.log(`[Monitor] Retrying ${label} with ${retryPath}`);
                port.close(() => { });

                const retryPort = new SP({ path: retryPath, baudRate, autoOpen: false });
                try {
                    return await attemptOpen(retryPort);
                } catch (retryErr: any) {
                    throw new Error(formatErrorMessage(retryErr.message, retryPath));
                }
            }
        }
        throw new Error(formatErrorMessage(err.message, path));
    }
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
