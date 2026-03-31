/**
 * DashboardSidebar.tsx
 * 仪表盘组件库侧边栏 — 优化版
 * 拖拽组件到右侧画布放置
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LayoutTemplate, Activity, CircleGauge, SlidersHorizontal, MousePointerClick } from 'lucide-react';
import { useDashboardStore, type WidgetType } from '../../store/useDashboardStore';
import { useI18n } from '../../context/I18nContext';

// ─── 滚动条 ────────────────────────────────────
const SCROLL_CSS = `
.db-scroll::-webkit-scrollbar { width: 3px; }
.db-scroll::-webkit-scrollbar-track { background: transparent; }
.db-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
.db-scroll:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-slider-color); }
`;

// ─── 组件模板定义 ──────────────────────────────
const getDisplayWidgets = (t: (k: any) => string): Array<{ type: WidgetType; label: string; icon: React.ReactNode; desc: string }> => [
    { type: 'ValueWidget',     label: t('dashboardSidebar.widgets.monitorValue'),  icon: <LayoutTemplate size={14} />,     desc: t('dashboardSidebar.widgets.monitorValueDesc') },
    { type: 'LineChartWidget', label: t('dashboardSidebar.widgets.uplotWaveform'), icon: <Activity size={14} />,           desc: t('dashboardSidebar.widgets.uplotWaveformDesc') },
    { type: 'GaugeWidget',     label: t('dashboardSidebar.widgets.dialGauge'),     icon: <CircleGauge size={14} />,        desc: t('dashboardSidebar.widgets.dialGaugeDesc') },
];

const getControlWidgets = (t: (k: any) => string): Array<{ type: WidgetType; label: string; icon: React.ReactNode; desc: string }> => [
    { type: 'SliderWidget',    label: t('dashboardSidebar.widgets.controlSlider'), icon: <SlidersHorizontal size={14} />, desc: t('dashboardSidebar.widgets.controlSliderDesc') },
    { type: 'ButtonWidget',    label: t('dashboardSidebar.widgets.actionButton'),  icon: <MousePointerClick size={14} />, desc: t('dashboardSidebar.widgets.actionButtonDesc') },
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
        className="group flex items-center gap-2.5 px-2.5 py-2 rounded-sm cursor-grab active:cursor-grabbing transition-all duration-150 select-none touch-none border border-[var(--widget-border-color)] bg-[var(--widget-background)] hover:border-[var(--focus-border-color)] hover:bg-[var(--list-hover-background)]"
    >
        <span className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity text-[var(--button-background)]">
            {icon}
        </span>
        <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium truncate text-[var(--app-foreground)]">{label}</div>
            <div className="text-[9px] truncate mt-0.5 text-[var(--activitybar-inactive-foreground)] opacity-70">{desc}</div>
        </div>
        {/* 拖拽提示 */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="flex-shrink-0 opacity-20 group-hover:opacity-50 transition-opacity text-[var(--app-foreground)]">
            <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
            <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
            <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
        </svg>
    </div>
);

// ─── 分区标题（与 MqttConfigPanel Broker 折叠标题一致）────────
const SectionTitle: React.FC<{ label: string; en: string }> = ({ label, en }) => (
    <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase text-[var(--serial-config-label)] opacity-80 border-b border-[var(--border-color)] bg-[var(--serial-config-bg)] sticky top-0">
        {en}&nbsp;<span className="text-[10px] font-normal opacity-60">{label}</span>
    </div>
);

// ══════════════════════════════════════════════
//  DashboardSidebar 主组件
// ══════════════════════════════════════════════
export const DashboardSidebar: React.FC = () => {
    const { t } = useI18n();
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

    const displayWidgets = getDisplayWidgets(t);
    const controlWidgets = getControlWidgets(t);
    const allWidgets = [...displayWidgets, ...controlWidgets];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[var(--serial-config-bg)] text-[var(--serial-config-text)]">
            <style>{SCROLL_CSS}</style>

            {/* 组件列表 */}
            <div className="flex-1 overflow-y-auto overscroll-contain db-scroll flex flex-col gap-0">
                {/* DISPLAY 区 */}
                <section>
                    <SectionTitle label={t('dashboardSidebar.display')} en="DISPLAY" />
                    <div className="px-3 py-2 space-y-1.5">
                        {displayWidgets.map(w => (
                            <WidgetCard key={w.type} {...w} onPointerDown={onPointerDown} />
                        ))}
                    </div>
                </section>

                {/* CONTROL 区 */}
                <section>
                    <SectionTitle label={t('dashboardSidebar.control')} en="CONTROL" />
                    <div className="px-3 py-2 space-y-1.5">
                        {controlWidgets.map(w => (
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
                                opacity: 0.92,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 12px',
                                borderRadius: 4,
                                background: 'var(--st-menu-bg)',
                                border: '1px solid var(--focus-border-color)',
                                backdropFilter: 'blur(12px)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            }}
                        >
                            <span className="text-[var(--focus-border-color)]">{tpl.icon}</span>
                            <span className="text-xs font-semibold text-[var(--app-foreground)] whitespace-nowrap">{tpl.label}</span>
                        </div>,
                        document.body
                    );
                })()
            }
        </div>
    );
};
