/**
 * main.tsx
 * ⚡ 渲染进程入口 — 极简化：加载 React + App + CSS 后立即渲染。
 * splashReady 在首帧渲染后立即触发，无需等待完整 Provider 链加载。
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 全局错误捕获
window.onerror = (message, source, lineno, colno, error) => {
    console.error(`[Renderer] Error: ${message}\nSource: ${source}\nLine: ${lineno}:${colno}\nStack: ${error?.stack}`);
};
window.onunhandledrejection = (event) => {
    console.error('[Renderer] Unhandled promise rejection:', event.reason);
};

// 通知 splash：JS 已加载，即将渲染
window.appAPI?.splashProgress?.(90, '渲染应用...');

// 渲染 React — 首帧只有 AppShell（纯静态骨架），极快
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);

// ⚡ 首帧提交后立即关闭 splash — 不等待 FullApp 异步加载完成
// 用户立即看到匹配主题色的 App 骨架，完整 UI 在后台无缝替换
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        window.appAPI?.splashReady?.();
    });
});
