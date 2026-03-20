/**
 * index.ts
 * Tauri v2 IPC 适配层统一注册入口。
 * 在 React 渲染前调用，将所有 API 挂载到 window 对象。
 */
import { registerSerialAPI } from './serial'
import { registerMqttAPI } from './mqtt'
import { registerMonitorAPI } from './monitor'
import { registerTcpAPI } from './tcp'
import { registerWorkspaceAPI } from './workspace'
import { registerSessionAPI } from './session'
import { registerAppAPI } from './app'
import { registerShellAPI } from './shell'
import { registerWindowAPI } from './windowApi'
import { registerUpdateAPI } from './update'
import { registerCom0comAPI } from './com0com'
import { registerThemeAPI } from './theme'
import { registerEyedropperAPI } from './eyedropper'
import { registerCrashReportAPI } from './crashReport'

/** 注册所有 Tauri IPC 适配层到 window 对象 */
export function registerAllTauriAPIs(): void {
    registerSerialAPI()
    registerMqttAPI()
    registerMonitorAPI()
    registerTcpAPI()
    registerWorkspaceAPI()
    registerSessionAPI()
    registerAppAPI()
    registerShellAPI()
    registerWindowAPI()
    registerUpdateAPI()
    registerCom0comAPI()
    registerThemeAPI()
    registerEyedropperAPI()
    registerCrashReportAPI()
}
