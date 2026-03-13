/**
 * Reset Handler
 * 处理“恢复出厂设置”后的重启回调，如果存在 '.reset-pending' 标记，
 * 则在应用启动最初期彻底清空 userData 目录以防资源被占用导致清理失败。
 */
import path from 'node:path';
import fsSync from 'node:fs';

export function handlePendingReset(userDataPath: string, customDataPath: string) {
    const resetFlagPath = path.join(path.dirname(customDataPath), '.reset-pending');

    if (fsSync.existsSync(resetFlagPath)) {
        try {
            fsSync.rmSync(customDataPath, { recursive: true, force: true });
            console.log(`[Reset] Successfully wiped customDataPath: ${customDataPath}`);
        } catch (e) {
            console.error('[Reset] Failed to delete userData on cold start:', e);
        }
        try {
            fsSync.unlinkSync(resetFlagPath);
        } catch (e) {
            console.error('[Reset] Failed to delete reset flag file on cold start:', e);
        }
    }
}
