/**
 * main.tsx
 * ⚡ 渲染进程入口 — 注册 Tauri IPC 适配层后渲染 React。
 * 主窗口初始隐藏（tauri.conf.json visible:false），待 FullApp 就绪后 show()。
 */
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { registerAllTauriAPIs } from './lib/tauri-api'
import { reportError, addBreadcrumb, initAutoBreadcrumbs } from './lib/crashReporter'
import './index.css'

// 在 React 渲染前注册所有 Tauri IPC 适配层到 window 对象
registerAllTauriAPIs()

// 初始化自动面包屑采集（点击事件追踪）
initAutoBreadcrumbs()

// 全局错误捕获 → 自动上报到飞书
window.onerror = (message, source, lineno, colno, error) => {
    console.error(`[Renderer] Error: ${message}\nSource: ${source}\nLine: ${lineno}:${colno}\nStack: ${error?.stack}`);
    // 添加错误面包屑
    addBreadcrumb('error', String(message));
    // 异步上报到飞书（不阻塞主线程）
    if (error) {
        reportError(error, `global:${source}:${lineno}:${colno}`).catch(() => {});
    }
};
window.onunhandledrejection = (event) => {
    console.error('[Renderer] Unhandled promise rejection:', event.reason);
    addBreadcrumb('error', `UnhandledRejection: ${String(event.reason)}`);
    const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportError(err, 'unhandled-promise-rejection').catch(() => {});
};

// 根据窗口标签决定渲染内容
const windowLabel = getCurrentWindow().label;
const root = ReactDOM.createRoot(document.getElementById('root')!);

if (windowLabel === 'theme-editor') {
    // 主题编辑器窗口 — 直接渲染编辑器，跳过 AppShell 骨架
    const ThemeEditorApp = React.lazy(() => import('./ThemeEditorApp'));
    root.render(
        <React.StrictMode>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center opacity-40 h-screen bg-[var(--app-background,#1e1e1e)]"><div className="text-sm text-[var(--app-foreground,#ccc)]">Loading...</div></div>}>
                <ThemeEditorApp />
            </Suspense>
        </React.StrictMode>,
    );
} else {
    // 主窗口 — 走正常 App 骨架 + 懒加载流程
    // 窗口初始隐藏，FullApp 在 AppContent 挂载后调用 show()
    const App = React.lazy(() => import('./App'));
    root.render(
        <React.StrictMode>
            <Suspense fallback={null}>
                <App />
            </Suspense>
        </React.StrictMode>,
    );
}
