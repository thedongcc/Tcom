/**
 * tcp.ipc.ts
 * 注册 TCP 服务器相关的 IPC 控制端点。
 */
import { ipcMain } from 'electron';
import type { TcpService } from '../services/TcpService';

export function registerTcpIpc(tcpService: TcpService) {
    ipcMain.handle('tcp:start', async (_event, port: number) => {
        if (!tcpService) return { success: false, error: 'Service not initialized' };
        return tcpService.startServer(port);
    });

    ipcMain.handle('tcp:stop', async (_event, port: number) => {
        if (!tcpService) return false;
        return tcpService.stopServer(port);
    });

    ipcMain.handle('tcp:write', async (_event, { port, data }) => {
        if (tcpService) tcpService.write(port, data);
        return true;
    });
}
