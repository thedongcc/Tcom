import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** react-grid-layout Layout 属性（内联定义，规避 @types export= 兼容性问题） */
interface GridLayout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 支持的组件类型 */
export type WidgetType = 'ValueWidget' | 'LineChartWidget' | 'GaugeWidget' | 'SliderWidget' | 'ButtonWidget';

/** 单个组件配置 */
export interface WidgetConfig {
    /** 唯一 ID（同时作为 react-grid-layout 的 key） */
    id: string;
    /** 渲染的实际组件形态 */
    type: WidgetType;
    /** 组件标题（可选） */
    title?: string;
    /** 绑定的物理量变量名，与 useDataBusStore.latestValues 的 key 对应 */
    bindKey: string;
    /** 网格布局坐标（x, y, w, h） */
    layout: { x: number; y: number; w: number; h: number };
    /** 其他特有配置（如颜色、量程等） */
    options?: Record<string, any>;
}

interface DashboardState {
    /** 整个画板面板是否显示 (可以废除，因为通过路由控制了) */
    isVisible: boolean;
    /** 是否在 ActivityBar 中显示仪表盘（组件库）入口 */
    showDashboard: boolean;
    /** 各个画板是否处于“编辑/拖拽”状态 */
    isEditing: Record<string, boolean>;
    /** 画布中的组件列表 (key 为 sessionId) */
    widgets: Record<string, WidgetConfig[]>;
    /** 当前选中的 WidgetId，用于在 Inspector 显示其属性 */
    selectedWidgetId: Record<string, string | null>;

    /** 由 onLayoutChange 回调触发，同步最新拖拽/缩放坐标到 Store */
    updateLayout: (sessionId: string, newLayout: GridLayout[]) => void;
    /** 增删改查组件 */
    addWidget: (sessionId: string, widget: Omit<WidgetConfig, 'id'>) => void;
    removeWidget: (sessionId: string, widgetId: string) => void;
    updateWidgetConfig: (sessionId: string, widgetId: string, updates: Partial<Omit<WidgetConfig, 'id' | 'layout'>>) => void;
    /** 控制编辑模式 */
    toggleEditing: (sessionId: string, force?: boolean) => void;
    /** 懒初始化某会话 */
    initSession: (sessionId: string) => void;
    /** 选中卡片 */
    selectWidget: (sessionId: string, widgetId: string | null) => void;

    /** 切换实时数据面板显隐 */
    toggleVisible: () => void;
    /** 切换仪表盘（组件库）ActivityBar 入口显隐 */
    toggleDashboard: () => void;

    /** 核心全局原生 Pointer 拖放架构状态 */
    draggingWidget: WidgetType | null;
    setDraggingWidget: (type: WidgetType | null) => void;
}

export const useDashboardStore = create<DashboardState>()(
    persist(
        (set) => ({
            isVisible: true,
            showDashboard: true,
            isEditing: {},
            widgets: {},
            selectedWidgetId: {},
            draggingWidget: null,

    initSession: (sessionId) => set((state) => {
        if (state.widgets[sessionId]) return state; // already inited
        return {
            isEditing: { ...state.isEditing, [sessionId]: false },
            widgets: {
                ...state.widgets,
                [sessionId]: [
                    { id: `w-pitch-${sessionId}`, type: 'ValueWidget', bindKey: 'pitch', title: 'Pitch Angle', layout: { x: 0, y: 0, w: 2, h: 2 } },
                    { id: `w-temp-${sessionId}`,  type: 'ValueWidget', bindKey: 'temp',  title: 'Temperature', layout: { x: 2, y: 0, w: 2, h: 2 } },
                    { id: `w-pwm-${sessionId}`,   type: 'ValueWidget', bindKey: 'pwm',   title: 'Motor PWM',   layout: { x: 4, y: 0, w: 2, h: 2 } },
                ]
            }
        };
    }),

    updateLayout: (sessionId, newLayout: GridLayout[]) => {
        set((state) => {
            const currentWidgets = state.widgets[sessionId] || [];
            let hasChanged = false;
            
            const updated = currentWidgets.map((w) => {
                const found = newLayout.find((l) => l.i === w.id);
                if (!found) return w;
                
                if (w.layout.x !== found.x || w.layout.y !== found.y || w.layout.w !== found.w || w.layout.h !== found.h) {
                    hasChanged = true;
                    return { ...w, layout: { x: found.x, y: found.y, w: found.w, h: found.h } };
                }
                return w;
            });
            
            // 极度关键：阻断引发的 react-grid-layout 重渲染死循环，只有在尺寸真实改变时才提交新引用
            if (!hasChanged) return state;
            
            return {
                widgets: {
                    ...state.widgets,
                    [sessionId]: updated
                }
            };
        });
    },

    addWidget: (sessionId, widget) => set((state) => ({
        widgets: {
            ...state.widgets,
            [sessionId]: [...(state.widgets[sessionId] || []), { ...widget, id: `w-${Date.now()}-${Math.floor(Math.random() * 1000)}` }]
        }
    })),

    removeWidget: (sessionId, widgetId) => set((state) => ({
        widgets: {
            ...state.widgets,
            [sessionId]: (state.widgets[sessionId] || []).filter((w) => w.id !== widgetId)
        }
    })),

    updateWidgetConfig: (sessionId, widgetId, updates) => set((state) => ({
        widgets: {
            ...state.widgets,
            [sessionId]: (state.widgets[sessionId] || []).map((w) => w.id === widgetId ? { ...w, ...updates } : w)
        }
    })),

    toggleEditing: (sessionId) => set((state) => ({ 
        isEditing: { ...state.isEditing, [sessionId]: !state.isEditing[sessionId] },
        selectedWidgetId: { ...state.selectedWidgetId, [sessionId]: null } // 退出编辑或进入边界时情况选择
    })),

    selectWidget: (sessionId, widgetId) => set((state) => ({
        selectedWidgetId: { ...state.selectedWidgetId, [sessionId]: widgetId }
    })),

    setDraggingWidget: (type) => set({ draggingWidget: type }),

    toggleVisible: () => set((state) => ({ isVisible: !state.isVisible })),

    toggleDashboard: () => set((state) => ({ showDashboard: !state.showDashboard })),
}),
{
    name: 'tcom-dashboard-storage',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ widgets: state.widgets }),
}
));

