/**
 * SideBar.tsx
 * 侧边栏容器 — 根据 activeView 渲染对应面板，统一标题栏。
 */
import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { useFeatureManager } from '../../context/FeatureContextShared';
import { useI18n } from '../../context/I18nContext';

// ⚡ 重型侧边栏组件懒加载
const ConfigSidebar = React.lazy(() => import('../serial/ConfigSidebar').then(m => ({ default: m.ConfigSidebar })));
const SessionListSidebar = React.lazy(() => import('../serial/SessionListSidebar').then(m => ({ default: m.SessionListSidebar })));

interface SideBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SideBar = ({ activeView, onViewChange, editorLayout }: SideBarProps) => {
    if (!activeView || activeView === 'settings') return null;

    const { getFeature } = useFeatureManager();
    const activeFeature = getFeature(activeView);
    const { t } = useI18n();

    // Resizing State
    const [width, setWidth] = useState(() => {
        const saved = localStorage.getItem('sidebar-width');
        return saved ? parseInt(saved, 10) : 250;
    });
    const widthRef = useRef(width);
    const isResizing = useRef(false);

    // Sync ref with state
    useEffect(() => {
        widthRef.current = width;
    }, [width]);

    // Effect to sync storage when resize ends or explicit change occurs (e.g. double click)
    useEffect(() => {
        if (!isResizing.current) {
            localStorage.setItem('sidebar-width', width.toString());
        }
    }, [width]);

    const updateWidth = (newWidth: number) => {
        setWidth(newWidth);
        widthRef.current = newWidth;
    };

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = e.clientX - 48;
        if (newWidth > 150 && newWidth < 600) {
            updateWidth(newWidth);
        }
    };

    const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
        // Trigger one final storage sync now that isResizing is false
        localStorage.setItem('sidebar-width', widthRef.current.toString());
    };

    const handleDoubleClick = () => {
        updateWidth(250);
    };

    // ── 标题映射 ──
    const getTitle = (): string => {
        const viewMap: Record<string, string> = {
            'explorer': t('sidebar.sessions'),
            'serial': t('sidebar.configuration'),
            'commands': t('sidebar.commands'),
            'virtual-port': t('sidebar.virtualPort'),
            'auto-reply': t('sidebar.autoReply'),
        };
        const translated = viewMap[activeView];
        if (translated) return translated;
        if (activeFeature) return activeFeature.name;
        return activeView;
    };

    return (
        <div
            className="flex flex-col border-r border-[var(--border-color)] relative shrink-0"
            style={{ width: `${width}px`, backgroundColor: 'var(--sidebar-background)' }}
            data-component="sidebar"
        >
            {/* 统一标题栏（所有视图都显示） */}
            <div className="h-[35px] px-4 flex items-center text-[11px] font-bold text-[var(--st-sidebar-title-text)] tracking-wide uppercase shrink-0">
                <span className="truncate">{getTitle()}</span>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <Suspense fallback={<div className="p-4 text-xs text-[var(--input-placeholder-color)] opacity-60">Loading...</div>}>
                {activeView === 'explorer' && <SessionListSidebar editorLayout={editorLayout} />}
                {activeView === 'search' && <div className="p-4 text-xs text-[var(--st-sidebar-muted-text)]">Search not implemented</div>}
                {activeView === 'serial' && <ConfigSidebar />}

                {/* 动态模块侧边栏（含懒加载 Suspense） */}
                {activeFeature && activeFeature.sidebarComponent && (
                    <Suspense fallback={<div className="p-4 text-xs text-[var(--input-placeholder-color)] opacity-60">{t('common.loading')}</div>}>
                        <activeFeature.sidebarComponent
                            onNavigate={onViewChange}
                            editorLayout={editorLayout}
                        />
                    </Suspense>
                )}
                </Suspense>
            </div>

            {/* Resize Sash */}
            <div
                className="absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-[var(--accent-color)] opacity-0 hover:opacity-100 transition-opacity z-10"
                style={{ right: '-2px' }}
                onMouseDown={startResizing}
                onDoubleClick={handleDoubleClick}
            />
        </div>
    );
};
