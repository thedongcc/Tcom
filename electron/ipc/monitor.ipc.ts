/**
 * monitor.ipc.ts
 * 注册所有 monitor:* IPC handler（虚拟串口监控桥接的启停与注入）。
 */
import { ipcMain } from 'electron';
import type { MonitorService } from '../services/MonitorService';

export function registerMonitorIpc(monitorService: MonitorService) {
    ipcMain.handle('monitor:start', async (_event, { sessionId, config }) => {
        return monitorService.start(sessionId, config);
    });

    ipcMain.handle('monitor:stop', async (_event, { sessionId }) => {
        return monitorService.stop(sessionId);
    });

    ipcMain.handle('monitor:write', async (_event, { sessionId, target, data }) => {
        return monitorService.write(sessionId, target, data);
    });
}
