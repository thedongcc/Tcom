import React from 'react';
import { useDashboardStore, WidgetConfig } from '../../../store/useDashboardStore';
import { GripHorizontal, X } from 'lucide-react';
import { Tooltip } from '../../common/Tooltip';
import { useI18n } from '../../../context/I18nContext';

interface WidgetContainerProps {
    sessionId: string;
    widget: WidgetConfig;
    children: React.ReactNode;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({ sessionId, widget, children }) => {
    const isEditing = useDashboardStore(s => s.isEditing[sessionId]);
    const removeWidget = useDashboardStore(s => s.removeWidget);
    const { t } = useI18n();

    return (
        <div
            className={`w-full h-full flex flex-col rounded-xl overflow-hidden transition-all duration-300 ${
                isEditing
                    ? 'border border-dashed border-[var(--accent-color)] shadow-[0_0_12px_rgba(56,189,248,0.2)] z-50'
                    : ''
            }`}
            style={{
                background: isEditing
                    ? 'rgba(56,189,248,0.04)'
                    : 'rgba(12,12,16,0.82)',
                backdropFilter: 'blur(12px)',
                border: isEditing
                    ? undefined
                    : '1px solid rgba(255,255,255,0.07)',
                boxShadow: isEditing
                    ? undefined
                    : '0 4px 24px rgba(0,0,0,0.5)',
            }}
        >
            {/* 编辑模式顶栏 */}
            {isEditing && (
                <div className="flex items-center justify-between px-2.5 py-1.5 flex-shrink-0"
                    style={{ background: 'rgba(56,189,248,0.08)', borderBottom: '1px solid rgba(56,189,248,0.2)' }}>
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <div className="drag-handle cursor-grab active:cursor-grabbing text-[var(--accent-color)] p-0.5">
                            <GripHorizontal size={13} />
                        </div>
                        <span className="text-[10px] font-bold tracking-wider text-[var(--accent-color)] uppercase truncate font-mono">
                            {widget.title || widget.type.replace('Widget', '')}
                        </span>
                    </div>
                    <Tooltip content={t('sidebar.deleteWidget')} position="top">
                    <button
                        onClick={() => removeWidget(sessionId, widget.id)}
                        className="text-[var(--st-status-error)] opacity-50 hover:opacity-100 hover:bg-black/20 p-1 rounded transition-all ml-2 flex-shrink-0 cursor-pointer"
                    >
                        <X size={13} />
                    </button>
                    </Tooltip>
                </div>
            )}

            {/* 内容插槽 */}
            <div className={`flex-1 overflow-hidden relative ${isEditing ? 'pointer-events-none' : 'pointer-events-auto'}`}>
                {children}
                {isEditing && (
                    <div className="absolute inset-0 z-50 bg-black/5" />
                )}
            </div>
        </div>
    );
};
