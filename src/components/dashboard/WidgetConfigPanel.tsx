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
    
    // 从数据总线抓取最新出现的全部 Key 来作为下拉选项（包含标量和未知的新字段）
    const sessionDataEntry = useDataBusStore(s => s.sessionsData[sessionId]?.latestValues);
    const latestValues = sessionDataEntry || {};
    const availableKeys = Object.keys(latestValues).sort();

    if (!selectedWidgetId) return null;

    const activeWidget = widgets.find(w => w.id === selectedWidgetId);
    if (!activeWidget) return null;

    return (
        <div className="absolute right-4 top-16 w-72 bg-[rgba(20,20,25,0.95)] backdrop-blur-xl border border-[var(--border-color)] rounded-xl shadow-2xl z-[9000] flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20">
                <div className="flex items-center gap-2 text-[var(--st-panel-header-text)]">
                    <Settings2 size={16} className="text-[var(--accent-color)]" />
                    <span className="text-sm font-semibold tracking-wide">Widget Inspector</span>
                </div>
                <button
                    onClick={() => selectWidget(sessionId, null)}
                    className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* 表单体 */}
            <div className="p-4 flex flex-col gap-4 text-sm">
                
                {/* ID只读 */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Widget ID</label>
                    <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-md text-gray-400 font-mono text-xs truncate">
                        {activeWidget.id}
                    </div>
                </div>

                {/* 类型只读 */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Type</label>
                    <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-md text-[var(--accent-color)] font-medium text-xs">
                        {activeWidget.type}
                    </div>
                </div>

                {/* 标题修改 */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Title (Optional)</label>
                    <input
                        type="text"
                        value={activeWidget.title || ''}
                        onChange={(e) => updateWidgetConfig(sessionId, activeWidget.id, { title: e.target.value })}
                        placeholder="Enter widget title..."
                        className="w-full px-3 py-2 bg-[var(--input-background)] border border-[var(--input-border)] focus:border-[var(--focus-border-color)] rounded-md text-[var(--st-panel-text)] outline-none transition-colors"
                    />
                </div>

                {/* 数据绑定 (bindKey) */}
                <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
                    <label className="text-xs text-gray-300 font-medium flex items-center justify-between">
                        <span className="uppercase tracking-wider">Data Bind Key</span>
                        <span className="text-[10px] text-gray-500 font-normal">Dynamic Link</span>
                    </label>
                    
                    <CustomSelect
                        items={[
                            ...availableKeys.map(k => ({ label: k, value: k })),
                            // 为了以防当前没收到数据，强行插入原有的 bindKey 保证显示和可选
                            ...(availableKeys.includes(activeWidget.bindKey) ? [] : [{ label: `${activeWidget.bindKey} (Offline)`, value: activeWidget.bindKey }])
                        ]}
                        value={activeWidget.bindKey}
                        placeholder="Select parsed key..."
                        onChange={(val) => updateWidgetConfig(sessionId, activeWidget.id, { bindKey: val })}
                        className="w-full"
                    />
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                        当引擎接收到与此绑定相同的键名下发数据时，此卡片将响应更新序列。
                    </p>
                </div>
            </div>
            
        </div>
    );
};
