/**
 * EditorGroupPanel.tsx
 * 编辑器组面板，负责渲染选中的会话内容。
 * 从 EditorArea.tsx 中拆分出来。
 */
import React from 'react';
import { LayoutTemplate, Columns } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { SerialMonitor } from '../serial/SerialMonitor';
import { MqttMonitor } from '../mqtt/MqttMonitor';
import { MonitorTerminal } from '../serial-monitor/MonitorTerminal';
import { GraphEditor } from '../graph-editor/GraphEditor';
import { SettingsEditor } from '../settings/SettingsEditor';
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

            {/* 内容区域 */}
            <div className="flex-1 relative bg-[var(--app-background)]">
                {node.activeViewId ? (
                    (() => {
                        const session = sessions.find((s: any) => s.id === node.activeViewId);
                        if (!session) return <div className="p-4 text-center text-gray-500">{t('editor.sessionNotFound')}</div>;

                        if (session.config.type === 'settings') {
                            return <div key={session.id} className="absolute inset-0"><SettingsEditor /></div>;
                        }
                        if (session.config.type === 'graph') {
                            return <div key={session.id} className="absolute inset-0"><GraphEditor sessionId={session.id} /></div>;
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
            </div>
        </div>
    );
};
