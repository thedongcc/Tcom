/**
 * EditorGroupPanel.tsx
 * 编辑器组面板，负责渲染选中的会话内容。
 * 从 EditorArea.tsx 中拆分出来。
 */
import React, { Suspense } from 'react';
import { LayoutTemplate, Columns } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { LeafNode } from '../../hooks/useEditorLayout';
import {
    SortableContext,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useI18n } from '../../context/I18nContext';
import {
    getCompositeId,
    SortableTab,
    GroupHeader,
    DropZone,
    HeaderDropZone,
    DropIndicator,
} from './EditorTabComponents';

// ⚡ 重型面板组件懒加载，避免启动时加载数百个模块
const SerialMonitor = React.lazy(() => import('../serial/SerialMonitor').then(m => ({ default: m.SerialMonitor })));
const MqttMonitor = React.lazy(() => import('../mqtt/MqttMonitor').then(m => ({ default: m.MqttMonitor })));
const MonitorTerminal = React.lazy(() => import('../serial-monitor/MonitorTerminal').then(m => ({ default: m.MonitorTerminal })));
const DashboardCanvas = React.lazy(() => import('../dashboard/DashboardCanvas').then(m => ({ default: m.DashboardCanvas })));

interface GroupPanelProps {
    node: LeafNode;
    isActive: boolean;
    sessions: any[];
    sessionManager: any;
    layoutActions: any;
    onShowSettings?: (view: string) => void;
    activeDragId: string | null;
    dropIndicator: { groupId: string; index: number } | null;
}

export const GroupPanel = ({ node, isActive, sessions, sessionManager, layoutActions, onShowSettings, activeDragId, dropIndicator }: GroupPanelProps) => {
    const { setActiveGroupId, openSession, closeView, splitGroup } = layoutActions;
    const { t } = useI18n();

    return (
        <div className="flex flex-col h-full w-full relative group min-w-0" onClick={() => {
            setActiveGroupId(node.id);
            if (node.activeViewId) sessionManager.setActiveSessionId(node.activeViewId);
        }}>
            {/* 拖放指示区域 */}
            {activeDragId && (
                <>
                    <DropZone
                        id={`${node.id}-center`}
                        className="absolute inset-0 z-30"
                        activeClassName="bg-[var(--accent-color)] opacity-10 border-2 border-[var(--focus-border-color)]"
                    />
                </>
            )}

            <GroupHeader group={node} isActiveGroup={isActive} setActiveGroupId={setActiveGroupId}>
                <HeaderDropZone id={`${node.id}-header`} className="flex-1 flex items-center overflow-x-auto scrollbar-hide h-full relative">
                    {activeDragId && (
                        <DropZone
                            id={`${node.id}-start`}
                            className="absolute left-0 top-0 bottom-0 w-8 z-[60]"
                            activeClassName="bg-transparent"
                        />
                    )}
                    <SortableContext items={node.views.map(v => getCompositeId(node.id, v))} strategy={horizontalListSortingStrategy}>
                        {node.views.map((viewId, idx) => {
                            const session = sessions.find((s: any) => s.id === viewId);
                            if (!session) return null;
                            const isTabActive = node.activeViewId === viewId;
                            const compositeId = getCompositeId(node.id, viewId);
                            const showIndicatorBefore = dropIndicator?.groupId === node.id && dropIndicator.index === idx;

                            return (
                                <React.Fragment key={compositeId}>
                                    {showIndicatorBefore && <div className="h-full w-[3px] relative flex flex-shrink-0 items-center justify-center overflow-visible z-[2000] -mr-[1.5px] -ml-[1.5px] pointer-events-none"><DropIndicator /></div>}
                                    <SortableTab
                                        id={compositeId}
                                        active={isTabActive}
                                        isGroupActive={isActive}
                                        label={session.config.name || '(Unknown)'}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            sessionManager.setActiveSessionId(viewId);
                                            openSession(viewId, node.id);
                                        }}
                                        onClose={(e) => {
                                            e.stopPropagation();
                                            closeView(node.id, viewId);
                                        }}
                                        unsaved={false}
                                    />
                                </React.Fragment>
                            );
                        })}
                        {dropIndicator?.groupId === node.id && dropIndicator.index === node.views.length && (
                            <div className="h-full w-[3px] relative flex flex-shrink-0 items-center justify-center overflow-visible z-[2000] -ml-[1.5px] pointer-events-none"><DropIndicator /></div>
                        )}
                    </SortableContext>
                </HeaderDropZone>

                {/* 操作按钮：拆分编辑器 */}
                {node.views && node.views.length > 0 && (
                    <div className="flex items-center px-1 shrink-0 h-full border-l border-[var(--widget-border-color)]">
                        <Tooltip content={t('editor.splitEditor')} position="bottom" wrapperClassName="h-full flex items-center px-1">
                            <div
                                className="p-1 hover:bg-[var(--hover-background)] rounded cursor-pointer text-[var(--st-panel-action-hover)] focus:outline-none outline-none"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    splitGroup(node.id, 'horizontal');
                                }}
                            >
                                <Columns size={14} />
                            </div>
                        </Tooltip>
                    </div>
                )}
            </GroupHeader>

            {/* 内容区域：移除背景色，避免妨碍图片底图的完全透视 */}
            <div className="flex-1 relative">
                <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-[var(--input-placeholder-color)] text-sm opacity-60">Loading...</div>}>
                {node.activeViewId ? (
                    (() => {
                        const session = sessions.find((s: any) => s.id === node.activeViewId);
                        if (!session) return <div className="p-4 text-center text-gray-500">{t('editor.sessionNotFound')}</div>;

                        if (session.config.type === 'dashboard') {
                            return <DashboardCanvas
                                key={session.id}
                                sessionId={session.id}
                            />;
                        }
                        if (session.config.type === 'mqtt') {
                            return <MqttMonitor
                                key={session.id}
                                session={{ ...session, config: session.config as import('../../types/session').MqttSessionConfig }}
                                onShowSettings={onShowSettings}
                                onPublish={(topic, payload, qos, retain) => sessionManager.publishMqtt(session.id, topic, payload, { qos, retain })}
                                onUpdateConfig={(updates) => { void sessionManager.updateSessionConfig(session.id, updates); }}
                                onClearLogs={() => sessionManager.clearLogs(session.id)}
                                onConnectRequest={() => {
                                    sessionManager.setActiveSessionId(session.id);
                                    return sessionManager.connectSession(session.id);
                                }}
                            />;
                        }
                        if (session.config.type === 'monitor') {
                            return <MonitorTerminal
                                key={session.id}
                                session={session}
                                onShowSettings={onShowSettings}
                                onConnectRequest={() => {
                                    sessionManager.setActiveSessionId(session.id);
                                    return sessionManager.connectSession(session.id);
                                }}
                            />;
                        }
                        return <SerialMonitor
                            key={session.id}
                            session={session}
                            onShowSettings={onShowSettings}
                            onSend={(data) => sessionManager.writeToSession(session.id, data)}
                            onUpdateConfig={(updates) => { void sessionManager.updateSessionConfig(session.id, updates); }}
                            onInputStateChange={(inputState) => sessionManager.updateUIState(session.id, inputState)}
                            onClearLogs={() => sessionManager.clearLogs(session.id)}
                            onConnectRequest={() => {
                                sessionManager.setActiveSessionId(session.id);
                                return sessionManager.connectSession(session.id);
                            }}
                        />;
                    })()
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none text-center p-4">
                        <LayoutTemplate size={64} className="mb-4 text-[var(--st-panel-header-text)] opacity-50" />
                        <p className="text-lg font-medium text-[var(--st-panel-header-text)]">{t('editor.noEditorOpen')}</p>
                        <p className="text-sm text-[var(--activitybar-inactive-foreground)] mt-2 max-w-[300px]">{t('editor.noEditorDesc')}</p>
                    </div>
                )}
                </Suspense>
            </div>
        </div>
    );
};
