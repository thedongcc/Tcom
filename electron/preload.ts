/**
 * preload.ts
 * Electron preload 入口：注册所有桥接 API 到 renderer 进程。
 * 各 API 域已按职责拆分到独立子模块中。
 */

// ─── 子模块导入 ──────────────────────────────────────────────────────────────
import { registerSerialBridge, registerMqttBridge, registerMonitorBridge, registerTcpBridge } from './preload-serial';
import { registerThemeBridge, registerEyedropperBridge } from './preload-theme';
import { registerSessionBridge, registerWorkspaceBridge, registerCom0comBridge } from './preload-workspace';
import { registerAppBridge, registerUpdateBridge, registerShellBridge, registerWindowBridge } from './preload-system';

// ─── 注册所有桥接 API ────────────────────────────────────────────────────────
// 所有通信均通过专属 Bridge API 完成（serialAPI / mqttAPI / monitorAPI 等），
// 不再透传原始 ipcRenderer，避免渲染进程被 XSS 时可调用任意 IPC channel。
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
