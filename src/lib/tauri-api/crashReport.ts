/**
 * crashReport.ts
 * crashReportAPI 适配层 — 崩溃上报 IPC。
 */
import { invoke } from '@tauri-apps/api/core'

export function registerCrashReportAPI(): void {
    window.crashReportAPI = {
        /** 发送崩溃报告到飞书 Webhook */
        send: (payload: string) =>
            invoke('crash_report_send', { payload }),

        /** 检查上次是否 Rust Panic 闪退 */
        check: () =>
            invoke<string | null>('crash_report_check'),

        /** 清除崩溃标记文件 */
        clear: () =>
            invoke('crash_report_clear'),
    }
}
