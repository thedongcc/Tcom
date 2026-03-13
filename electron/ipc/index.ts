/**
 * index.ts
 * 统一注册所有 IPC 中间件，并暴露单一工厂函数。
 */
import type { BrowserWindow } from 'electron';

import { registerSerialIpc } from './serial.ipc';
import { registerMonitorIpc } from './monitor.ipc';
import { registerMqttIpc } from './mqtt.ipc';
import { registerWorkspaceIpc } from './workspace.ipc';
import { registerThemeIpc } from './theme.ipc';
import { registerAppIpc } from './app.ipc';
import { registerCom0comIpc } from './com0com.ipc';
import { registerTcpIpc } from './tcp.ipc';

import type { SerialService } from '../services/SerialService';
import type { MonitorService } from '../services/MonitorService';
import type { TcpService } from '../services/TcpService';

export interface IpcServiceContainer {
    serialService: SerialService;
    monitorService: MonitorService;
    tcpService: TcpService;
}

/**
 * 将路由注册职责拆分出 main.ts
 */
export function registerAllIPC(
    win: BrowserWindow,
    services: IpcServiceContainer,
    RENDERER_DIST: string,
    VITE_DEV_SERVER_URL?: string
): { prewarmThemeEditor: () => void } {
    // 1. 业务层 IPC
    registerSerialIpc(services.serialService);
    registerMonitorIpc(services.monitorService);
    registerTcpIpc(services.tcpService);

    // 2. 独立领域 IPC
    registerMqttIpc(win);
    registerWorkspaceIpc(win);

    // 3. 展现层与组件层 IPC
    const themeHooks = registerThemeIpc(win, RENDERER_DIST, VITE_DEV_SERVER_URL);

    // 4. 应用、外壳与系统层 IPC
    registerAppIpc(win);
    registerCom0comIpc(VITE_DEV_SERVER_URL);

    return themeHooks;
}
