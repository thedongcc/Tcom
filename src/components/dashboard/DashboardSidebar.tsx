/**
 * DashboardSidebar.tsx
 * 仪表盘组件库侧边栏 — 优化版
 * 拖拽组件到右侧画布放置
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LayoutTemplate, Activity, CircleGauge, SlidersHorizontal, MousePointerClick } from 'lucide-react';
import { useDashboardStore, type WidgetType } from '../../store/useDashboardStore';

// ─── 滚动条 ────────────────────────────────────
const SCROLL_CSS = `
.db-scroll::-webkit-scrollbar { width: 3px; }
.db-scroll::-webkit-scrollbar-track { background: transparent; }
.db-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
.db-scroll:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-slider-color); }
`;

// ─── 组件模板定义 ──────────────────────────────
const DISPLAY_WIDGETS: Array<{ type: WidgetType; label: string; icon: React.ReactNode; desc: string }> = [
    { type: 'ValueWidget',     label: 'Monitor Value',  icon: <LayoutTemplate size={14} />,     desc: '大幅醒目数值展示' },
    { type: 'LineChartWidget', label: 'uPlot Waveform', icon: <Activity size={14} />,           desc: '极速实时波形渲染' },
    { type: 'GaugeWidget',     label: 'Dial Gauge',     icon: <CircleGauge size={14} />,        desc: '矢量指针仪表盘' },
];

const CONTROL_WIDGETS: Array<{ type: WidgetType; label: string; icon: React.ReactNode; desc: string }> = [
    { type: 'SliderWidget',    label: 'Control Slider', icon: <SlidersHorizontal size={14} />, desc: '闭环拖拽式滑块' },
    { type: 'ButtonWidget',    label: 'Action Button',  icon: <MousePointerClick size={14} />, desc: '点动快速下发按钮' },
];

// ─── 单个组件模板卡片 ──────────────────────────
const WidgetCard: React.FC<{
    type: WidgetType;
    label: string;
    icon: React.ReactNode;
    desc: string;
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>, type: WidgetType) => void;
}> = ({ type, label, icon, desc, onPointerDown }) => (
    <div
        onPointerDown={(e) => onPointerDown(e, type)}
        className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-150 select-none touch-none"
        style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
        }}
        onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(var(--accent-rgb,56,189,248),0.08)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(var(--accent-rgb,56,189,248),0.25)';
        }}
        onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
        }}
    >
        <span className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--accent-color)' }}>
            {icon}
        </span>
        <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium truncate" style={{ color: 'var(--app-foreground)' }}>{label}</div>
            <div className="text-[9px] truncate mt-0.5" style={{ color: 'var(--sys-text-muted)' }}>{desc}</div>
        </div>
        {/* 拖拽提示 */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="flex-shrink-0 opacity-20 group-hover:opacity-50 transition-opacity"
            style={{ color: 'var(--app-foreground)' }}>
            <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
            <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
            <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
        </svg>
    </div>
);

// ─── 分区标题 ──────────────────────────────────
const SectionTitle: React.FC<{ label: string; en: string }> = ({ label, en }) => (
    <div className="flex items-center gap-2 px-1 mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--sys-text-muted)' }}>
            {en}
        </span>
        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <span className="text-[9px]" style={{ color: 'var(--sys-text-muted)', opacity: 0.5 }}>{label}</span>
    </div>
);

// ══════════════════════════════════════════════
//  DashboardSidebar 主组件
// ══════════════════════════════════════════════
export const DashboardSidebar: React.FC = () => {
    const draggingWidget = useDashboardStore(s => s.draggingWidget);
    const setDraggingWidget = useDashboardStore(s => s.setDraggingWidget);
    const [mousePos, setMousePos] = useState({ x: -999, y: -999 });

    useEffect(() => {
        if (!draggingWidget) return;
        const onMove = (e: PointerEvent) => setMousePos({ x: e.clientX, y: e.clientY });
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, [draggingWidget]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, type: WidgetType) => {
        e.preventDefault();
        setDraggingWidget(type);
        const onUp = () => {
            useDashboardStore.getState().setDraggingWidget(null);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointerup', onUp);
    };

    const allWidgets = [...DISPLAY_WIDGETS, ...CONTROL_WIDGETS];

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--sidebar-background)', color: 'var(--app-foreground)' }}>
            <style>{SCROLL_CSS}</style>

            {/* 顶部栏 */}
            <div className="flex-shrink-0 px-4 pt-3 pb-2.5" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--sys-text-muted)' }}>
                    组件库
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--sys-text-muted)', opacity: 0.5 }}>
                    解锁画布后拖入放置
                </p>
            </div>

            {/* 组件列表 */}
            <div className="flex-1 overflow-y-auto overscroll-contain db-scroll px-3 py-3 space-y-4">
                {/* DISPLAY 区 */}
                <section>
                    <SectionTitle label="展示" en="DISPLAY" />
                    <div className="space-y-1.5">
                        {DISPLAY_WIDGETS.map(w => (
                            <WidgetCard key={w.type} {...w} onPointerDown={onPointerDown} />
                        ))}
                    </div>
                </section>

                {/* CONTROL 区 */}
                <section>
                    <SectionTitle label="控制" en="CONTROL" />
                    <div className="space-y-1.5">
                        {CONTROL_WIDGETS.map(w => (
                            <WidgetCard key={w.type} {...w} onPointerDown={onPointerDown} />
                        ))}
                    </div>
                </section>
            </div>

            {/* 拖拽悬浮虚影 */}
            {draggingWidget && typeof document !== 'undefined' && document.body &&
                (() => {
                    const tpl = allWidgets.find(t => t.type === draggingWidget);
                    if (!tpl) return null;
                    return createPortal(
                        <div
                            style={{
                                position: 'fixed',
                                left: mousePos.x + 14,
                                top: mousePos.y + 14,
                                pointerEvents: 'none',
                                zIndex: 99999,
                                opacity: 0.85,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 12px',
                                borderRadius: 8,
                                background: 'rgba(15,15,20,0.92)',
                                border: '1px solid var(--accent-color)',
                                backdropFilter: 'blur(12px)',
                                boxShadow: '0 0 20px rgba(56,189,248,0.3)',
                            }}
                        >
                            <span style={{ color: 'var(--accent-color)' }}>{tpl.icon}</span>
                            <span className="text-xs font-semibold" style={{ color: 'var(--app-foreground)', whiteSpace: 'nowrap' }}>{tpl.label}</span>
                        </div>,
                        document.body
                    );
                })()
            }
        </div>
    );
};
