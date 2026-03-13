/**
 * preload.ts
 * Electron preload 入口：注册所有桥接 API 到 renderer 进程。
 * 各 API 域已按职责拆分到独立子模块中。
 */
import { ipcRenderer, contextBridge } from 'electron';

// ─── 子模块导入 ──────────────────────────────────────────────────────────────
import { registerSerialBridge, registerMqttBridge, registerMonitorBridge, registerTcpBridge } from './preload-serial';
import { registerThemeBridge, registerEyedropperBridge } from './preload-theme';
import { registerSessionBridge, registerWorkspaceBridge, registerCom0comBridge } from './preload-workspace';
import { registerAppBridge, registerUpdateBridge, registerShellBridge, registerWindowBridge } from './preload-system';

// ─── 底层 IPC 透传（保留给极少数需要直接 IPC 的场景） ────────────────────────────
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});

// ─── 注册所有桥接 API ────────────────────────────────────────────────────────
registerSerialBridge();
registerMqttBridge();
registerMonitorBridge();
registerTcpBridge();
registerThemeBridge();
registerEyedropperBridge();
registerSessionBridge();
registerWorkspaceBridge();
registerCom0comBridge();
registerAppBridge();
registerUpdateBridge();
registerShellBridge();
registerWindowBridge();
