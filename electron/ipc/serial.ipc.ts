/**
 * serial.ipc.ts
 * 注册所有 serial:* IPC handler（串口列举、开关、读写、定时发送）。
 */
import { ipcMain } from 'electron';
import type { SerialService } from '../services/SerialService';

export function registerSerialIpc(serialService: SerialService) {
    ipcMain.handle('serial:list-ports', async (_event, options) => {
        return serialService.listPorts(options);
    });

    ipcMain.handle('serial:open', async (_event, { connectionId, options }) => {
        return serialService.open(connectionId, options);
    });

    ipcMain.handle('serial:close', async (_event, { connectionId }) => {
        return serialService.close(connectionId);
    });

    ipcMain.handle('serial:write', async (_event, { connectionId, data }) => {
        return serialService.write(connectionId, data);
    });

    // ⚡ 高精度定时发送：Worker Thread 方案，精度约 1~2ms
    ipcMain.handle('serial:timed-send-start', async (_event, { connectionId, data, intervalMs }) => {
        return serialService.startTimedSend(connectionId, data, intervalMs) ?? { success: false, error: 'SerialService not ready' };
    });

    ipcMain.handle('serial:timed-send-stop', async (_event, { connectionId }) => {
        return serialService.stopTimedSend(connectionId) ?? { success: false };
    });

    // ⚡ 高精度动态定时发送（预计算帧 + Worker Thread 循环发送）
    ipcMain.handle('serial:timed-send-start-dynamic', async (_event, { connectionId, frames, intervalMs, timestampSlots }) => {
        return serialService.startTimedSendDynamic(connectionId, frames, intervalMs, timestampSlots) ?? { success: false, error: 'SerialService not ready' };
    });
}
