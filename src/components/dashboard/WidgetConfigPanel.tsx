import React from 'react';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useDataBusStore } from '../../store/useDataBusStore';
import { X, Settings2 } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';

interface WidgetConfigPanelProps {
    sessionId: string;
}

const EMPTY_WIDGETS: any[] = [];

export const WidgetConfigPanel: React.FC<WidgetConfigPanelProps> = ({ sessionId }) => {
    const selectedWidgetId = useDashboardStore(s => s.selectedWidgetId[sessionId]);
    const widgets = useDashboardStore(s => s.widgets[sessionId] || EMPTY_WIDGETS);
    const { selectWidget, updateWidgetConfig } = useDashboardStore();
    
    // 从所有 schemeValues 聊局全部可用字段名作为下拉选项
    const schemeValues = useDataBusStore(s => s.sessionsData[sessionId]?.schemeValues);
    const availableKeys = [...new Set(
        Object.values(schemeValues ?? {}).flatMap(sv => Object.keys(sv))
    )].sort();

    if (!selectedWidgetId) return null;

    const activeWidget = widgets.find(w => w.id === selectedWidgetId);
    if (!activeWidget) return null;

    return (
        <div className="absolute right-4 top-16 w-72 bg-[var(--st-menu-bg)] backdrop-blur-xl border border-[var(--border-color)] rounded-sm shadow-2xl z-[9000] flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--serial-config-bg)]">
                <div className="flex items-center gap-2 text-[var(--app-foreground)]">
                    <Settings2 size={16} className="text-[var(--focus-border-color)]" />
                    <span className="text-[11px] font-bold tracking-wide uppercase">Widget Inspector</span>
                </div>
                <button
                    onClick={() => selectWidget(sessionId, null)}
                    className="w-6 h-6 flex items-center justify-center rounded-sm hover:bg-[var(--list-hover-background)] text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* 表单体 */}
            <div className="p-4 flex flex-col gap-3 text-sm">
                
                {/* ID只读 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide">Widget ID</label>
                    <div className="h-7 px-2 flex items-center bg-[var(--input-background)] border border-[var(--border-color)] rounded-sm text-[var(--activitybar-inactive-foreground)] font-mono text-[11px] truncate opacity-70">
                        {activeWidget.id}
                    </div>
                </div>

                {/* 类型只读 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide">Type</label>
                    <div className="h-7 px-2 flex items-center bg-[var(--input-background)] border border-[var(--border-color)] rounded-sm text-[var(--focus-border-color)] font-medium text-[12px]">
                        {activeWidget.type}
                    </div>
                </div>

                {/* 标题修改 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide">Title</label>
                    <input
                        type="text"
                        value={activeWidget.title || ''}
                        onChange={(e) => updateWidgetConfig(sessionId, activeWidget.id, { title: e.target.value })}
                        placeholder="Enter widget title..."
                        className="w-full h-7 px-2 bg-[var(--input-background)] border border-[var(--input-border-color)] focus:border-[var(--focus-border-color)] rounded-sm text-[var(--app-foreground)] text-[12px] outline-none transition-colors placeholder:text-[var(--activitybar-inactive-foreground)] placeholder:opacity-60"
                    />
                </div>

                {/* 数据绑定 (bindKey) */}
                <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border-color)]">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide flex items-center justify-between">
                        <span>Data Bind Key</span>
                        <span className="text-[10px] text-[var(--activitybar-inactive-foreground)] font-normal normal-case">Dynamic Link</span>
                    </label>
                    
                    <CustomSelect
                        items={[
                            ...availableKeys.map(k => ({ label: k, value: k })),
                            ...(availableKeys.includes(activeWidget.bindKey) ? [] : [{ label: `${activeWidget.bindKey} (Offline)`, value: activeWidget.bindKey }])
                        ]}
                        value={activeWidget.bindKey}
                        placeholder="Select parsed key..."
                        onChange={(val) => updateWidgetConfig(sessionId, activeWidget.id, { bindKey: val })}
                        className="w-full"
                    />
                    <p className="text-[10px] text-[var(--activitybar-inactive-foreground)] opacity-70 mt-0.5 leading-relaxed">
                        当引擎接收到与此绑定相同的键名下发数据时，此卡片将响应更新。
                    </p>
                </div>
            </div>
            
        </div>
    );
};
