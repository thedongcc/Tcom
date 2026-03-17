/**
 * App.tsx
 * ⚡ 极简入口 — 只导入 React，零业务依赖。
 *
 * 架构：App.tsx 首帧只渲染 AppShell（纯 JSX 静态骨架），
 * 完整应用通过 React.lazy(FullApp) 异步加载后无缝替换。
 * 这使得 React 在 Vite dev 模式下只需加载 3 个模块就能完成
 * 首次渲染（react + react-dom + App），而非 50+ 个模块的瀑布流。
 */
import React, { Suspense } from 'react'

// ⚡ 整个应用（Provider + Hook + 布局 + 业务）全部懒加载
const FullApp = React.lazy(() => import('./FullApp'));

/**
 * ⚡ 极简 App 骨架 — 精确匹配真实布局，视觉过渡无感。
 * boot-theme.js 已提前注入 CSS 变量，骨架直接使用主题色。
 */
const AppShell = () => (
    <div className="flex flex-col h-screen w-full bg-[var(--app-background,#1e1e1e)] text-[var(--app-foreground,#ccc)] overflow-hidden">
        {/* 标题栏占位 */}
        <div
            className="h-[30px] bg-[var(--titlebar-background,#3c3c3c)] shrink-0 border-b border-[var(--border-color,#444)]"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        <div className="flex-1 flex overflow-hidden">
            {/* 活动栏占位 */}
            <div className="w-[48px] bg-[var(--activitybar-background,#333)] shrink-0 border-r border-[var(--border-color,#444)]" />
            {/* 主编辑区占位 */}
            <div className="flex-1 bg-[var(--editor-area-bg,var(--app-background,#1e1e1e))]" />
        </div>
    </div>
);

function App() {
    return (
        <Suspense fallback={<AppShell />}>
            <FullApp />
        </Suspense>
    );
}

export default App
