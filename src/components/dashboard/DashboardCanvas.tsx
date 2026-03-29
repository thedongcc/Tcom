/**
 * DashboardCanvas.tsx
 * 工业组态画布 — 基于 react-grid-layout 的可拖拽/缩放 SCADA HMI 组态面板。
 *
 * 渲染隔离架构：
 * - DashboardCanvas 本身只订阅布局数据（useDashboardStore），绝不订阅高频业务数据
 * - 每个 ValueWidget 独立精准订阅各自的物理量，实现真正的原子化渲染
 * - 60Hz 的 Rust 推送不会触发 DashboardCanvas 任何重渲染
 */
import React, { useEffect, useRef, useState } from 'react';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { listen } from '@tauri-apps/api/event';
import { useDashboardStore } from '../../store/useDashboardStore';
import { ValueWidget } from './widgets/ValueWidget';
import { UPlotChartWidget } from './widgets/UPlotChartWidget';
import { GaugeWidget } from './widgets/GaugeWidget';
import { SliderWidget } from './widgets/SliderWidget';
import { ButtonWidget } from './widgets/ButtonWidget';
import { WidgetContainer } from './widgets/WidgetContainer';
import { WidgetConfigPanel } from './WidgetConfigPanel';
import { Lock, Unlock } from 'lucide-react';

/** react-grid-layout Layout 属性 */
interface GridLayoutItem { i: string; x: number; y: number; w: number; h: number; }


interface DashboardCanvasProps {
    sessionId: string;
}

const EMPTY_WIDGETS: any[] = [];

export const DashboardCanvas: React.FC<DashboardCanvasProps> = ({ sessionId }) => {
    // 按块粒度显式订阅单页数据
    const widgets = useDashboardStore(s => s.widgets[sessionId] || EMPTY_WIDGETS);
    const isEditing = useDashboardStore(s => !!s.isEditing[sessionId]);
    const selectedWidgetId = useDashboardStore(s => s.selectedWidgetId[sessionId]);
    const { updateLayout, toggleEditing, addWidget, initSession, selectWidget } = useDashboardStore();

    // 自主测量真正的容器内部可用宽度
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasWidth, setCanvasWidth] = useState(1200);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0) {
                    setCanvasWidth(entry.contentRect.width);
                }
            }
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // 页面初次加载时建立属于此页的仪表盘数组
    useEffect(() => {
        initSession(sessionId);
    }, [sessionId, initSession]);

    // 将布局 Widget 映射为 react-grid-layout 的基本 layout 格式 (不再使用多断点字典)
    const layoutConfig = React.useMemo(() => (
        widgets.map((w) => ({
            i: w.id,
            x: w.layout.x,
            y: w.layout.y,
            w: w.layout.w,
            h: w.layout.h,
            minW: 2,
            minH: 2,
            static: !isEditing,
            isDraggable: isEditing,
            isResizable: isEditing
        }))
    ), [widgets, isEditing]);

    const handleLayoutChange = (layoutData: readonly any[]) => {
        console.log('[DashboardCanvas] > handleLayoutChange 触发! 当前生效布局项目数:', layoutData.length);
        const current = layoutData as GridLayoutItem[];
        updateLayout(sessionId, current);
    };



    return (
        <div className="w-full h-full flex flex-col bg-[var(--app-background)] text-[var(--app-foreground)] relative">
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--st-header-bg)] flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-color)] shadow-[0_0_8px_var(--accent-color)] animate-pulse" />
                    <span className="text-xs font-bold tracking-widest text-[var(--accent-color)]">HMI</span>
                    <span className="text-xs text-[var(--sys-text-muted)] tracking-wider">实时工业组态面板</span>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* 全局编辑锁定切换 */}
                    <button
                        onClick={() => {
                            toggleEditing(sessionId);
                            if (isEditing) selectWidget(sessionId, null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all duration-200 border ${
                            isEditing 
                            ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)] shadow-[0_0_10px_rgba(96,165,250,0.3)]' 
                            : 'bg-[var(--sys-bg-hover)] text-[var(--sys-text-muted)] border-[var(--border-color)] hover:border-[var(--accent-color)]/30 hover:text-[var(--accent-color)]'
                        }`}
                    >
                        {isEditing ? <Unlock size={12} /> : <Lock size={12} />}
                        {isEditing ? 'EDITING' : 'LOCKED'}
                    </button>
                </div>
            </div>

            {/* 网格画布区域 */}
            <div 
                ref={containerRef}
                className="flex-1 overflow-auto relative"
                onPointerUpCapture={(e) => {
                    const draggingType = useDashboardStore.getState().draggingWidget;
                    if (!draggingType) return;
                    
                    e.preventDefault();
                    e.stopPropagation();

                    console.log('🌟 [DashboardCanvas] Pointer全局放舱! 类型:', draggingType);
                    
                    if (!isEditing) {
                        toggleEditing(sessionId);
                    }

                    // 自主计算落在 48 列网格中的大约坐标
                    let x = 0, y = 0;
                    if (containerRef.current) {
                        const rect = containerRef.current.getBoundingClientRect();
                        const scrollX = containerRef.current.scrollLeft;
                        const scrollY = containerRef.current.scrollTop;
                        
                        const offsetX = e.clientX - rect.left + scrollX - 12;
                        const offsetY = e.clientY - rect.top + scrollY - 12;
                        
                        const colWidth = rect.width / 48;
                        const rowHeight = 30 + 12; // 30 高度 + 12 margin
                        
                        x = Math.max(0, Math.floor(offsetX / colWidth));
                        y = Math.max(0, Math.floor(offsetY / rowHeight));
                    }

                    let w = 8, h = 4;
                    if (draggingType === 'LineChartWidget') { w = 24; h = 8; }
                    else if (draggingType === 'GaugeWidget') { w = 12; h = 8; }
                    else if (draggingType === 'SliderWidget') { w = 12; h = 4; }
                    else if (draggingType === 'ValueWidget') { w = 10; h = 4; }

                    addWidget(sessionId, {
                        type: draggingType as any,
                        bindKey: 'unknown',
                        title: 'New ' + draggingType.replace('Widget', ''),
                        layout: { x, y, w, h }
                    });

                    // 清空全局拖拽状态
                    useDashboardStore.getState().setDraggingWidget(null);
                }}
                onClick={(e) => {
                    // 点击空白处取消选中
                    if (e.target === e.currentTarget && isEditing) {
                        selectWidget(sessionId, null);
                    }
                }}
            >
                <ResponsiveGridLayout
                    className="layout min-h-full"
                    width={canvasWidth}
                    layouts={{ lg: layoutConfig }}
                    breakpoints={{ lg: 0 }}
                    cols={{ lg: 48 }}
                    rowHeight={30}
                    margin={[12, 12]}
                    containerPadding={[12, 12]}
                    {...({ draggableHandle: '.drag-handle' } as any)}
                    onLayoutChange={handleLayoutChange}
                    resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
                    isBounded={false}
                    useCSSTransforms={true}
                    isDraggable={isEditing}
                    isResizable={isEditing}
                    droppingItem={{ i: '__dropping-elem__', w: 8, h: 4, x: 0, y: 0 }}
                >
                    {widgets.map((widget) => (
                        <div 
                            key={widget.id}
                            onClick={(e) => {
                                if (isEditing) {
                                    e.stopPropagation();
                                    selectWidget(sessionId, widget.id);
                                }
                            }}
                            className={selectedWidgetId === widget.id ? 'ring-2 ring-[var(--accent-color)] ring-offset-2 ring-offset-[var(--app-background)] rounded-xl relative z-50' : ''}
                        >
                            <WidgetContainer widget={widget} sessionId={sessionId}>
                                {widget.type === 'ValueWidget' && <ValueWidget bindKey={widget.bindKey} sessionId={sessionId} />}
                                {widget.type === 'LineChartWidget' && <UPlotChartWidget bindKey={widget.bindKey} sessionId={sessionId} />}
                                {widget.type === 'GaugeWidget' && <GaugeWidget bindKey={widget.bindKey} title={widget.title} sessionId={sessionId} />}
                                {widget.type === 'SliderWidget' && <SliderWidget bindKey={widget.bindKey} min={0} max={2000} sessionId={sessionId} />}
                                {widget.type === 'ButtonWidget' && <ButtonWidget bindKey={widget.bindKey} title={widget.title} sessionId={sessionId} />}
                            </WidgetContainer>
                        </div>
                    ))}
                </ResponsiveGridLayout>
            </div>

            {/* 属性检查器面板（绝对定位盖在画布上方） */}
            <WidgetConfigPanel sessionId={sessionId} />
        </div>
    );
};
