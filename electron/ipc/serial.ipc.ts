/**
 * serial.ipc.ts
 * 注册所有 serial:* IPC handler（串口列举、开关、读写、定时发送）。
 */
import { ipcMain } from 'electron';
import type { SerialService } from '../services/SerialService';

// ── 参数校验工具 ──

/** 校验是否为非空字符串 */
function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

/** 校验是否为正整数 */
function isPositiveInteger(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export function registerSerialIpc(serialService: SerialService) {
    ipcMain.handle('serial:list-ports', async (_event, options) => {
        return serialService.listPorts(options);
    });

    ipcMain.handle('serial:open', async (_event, payload: unknown) => {
        const p = payload as Record<string, unknown>;
        // connectionId 和 options.path 非空校验，baudRate 正整数校验
        if (!isNonEmptyString(p?.connectionId)) return { success: false, error: 'Invalid connectionId' };
        const opts = p.options as Record<string, unknown> | undefined;
        if (!opts || !isNonEmptyString(opts.path)) return { success: false, error: 'Invalid options.path' };
        if (!isPositiveInteger(opts.baudRate)) return { success: false, error: 'Invalid baudRate: must be a positive integer' };
        return serialService.open(p.connectionId, p.options as Parameters<SerialService['open']>[1]);
    });

    ipcMain.handle('serial:close', async (_event, payload: unknown) => {
        const p = payload as Record<string, unknown>;
        if (!isNonEmptyString(p?.connectionId)) return { success: false, error: 'Invalid connectionId' };
        return serialService.close(p.connectionId);
    });

    ipcMain.handle('serial:write', async (_event, payload: unknown) => {
        const p = payload as Record<string, unknown>;
        if (!isNonEmptyString(p?.connectionId)) return { success: false, error: 'Invalid connectionId' };
        if (!Array.isArray(p?.data) && typeof p?.data !== 'string') return { success: false, error: 'Invalid data: must be an array or string' };
        return serialService.write(p.connectionId, p.data as string | number[]);
    });

    // ⚡ 高精度定时发送：Worker Thread 方案，精度约 1~2ms
    ipcMain.handle('serial:timed-send-start', async (_event, payload: unknown) => {
        const p = payload as Record<string, unknown>;
        if (!isNonEmptyString(p?.connectionId)) return { success: false, error: 'Invalid connectionId' };
        if (!Array.isArray(p?.data)) return { success: false, error: 'Invalid data: must be an array' };
        if (!isPositiveInteger(p?.intervalMs)) return { success: false, error: 'Invalid intervalMs: must be a positive integer' };
        return serialService.startTimedSend(p.connectionId, p.data as number[], p.intervalMs as number)
            ?? { success: false, error: 'SerialService not ready' };
    });

    ipcMain.handle('serial:timed-send-stop', async (_event, payload: unknown) => {
        const p = payload as Record<string, unknown>;
        if (!isNonEmptyString(p?.connectionId)) return { success: false, error: 'Invalid connectionId' };
        return serialService.stopTimedSend(p.connectionId) ?? { success: false };
    });

    // ⚡ 高精度动态定时发送（预计算帧 + Worker Thread 循环发送）
    ipcMain.handle('serial:timed-send-start-dynamic', async (_event, payload: unknown) => {
        const p = payload as Record<string, unknown>;
        if (!isNonEmptyString(p?.connectionId)) return { success: false, error: 'Invalid connectionId' };
        if (!Array.isArray(p?.frames)) return { success: false, error: 'Invalid frames: must be an array' };
        if (!isPositiveInteger(p?.intervalMs)) return { success: false, error: 'Invalid intervalMs: must be a positive integer' };
        return serialService.startTimedSendDynamic(
            p.connectionId,
            p.frames as number[][],
            p.intervalMs as number,
            p.timestampSlots as Parameters<SerialService['startTimedSendDynamic']>[3]
        ) ?? { success: false, error: 'SerialService not ready' };
    });
}
