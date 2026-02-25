import { useState, useEffect, useRef, type ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { SideBar } from './SideBar';
import { StatusBar } from './StatusBar';
import { EditorArea } from './EditorArea';
import { Panel } from './Panel';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { useSessionManager } from '../../hooks/useSessionManager';
import { SessionProvider } from '../../context/SessionContext';
import { SessionConfig } from '../../types/session';

import { PluginProvider } from '../../context/PluginContext';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import { UpdateDialog } from '../common/UpdateDialog';
import { useSettings } from '../../context/SettingsContext';
import { useI18n } from '../../context/I18nContext';

export const Layout = ({ children }: { children?: ReactNode }) => {
    const { config, updateUI } = useSettings();
    const { t } = useI18n();
    const activeView = config.ui.activeActivityItem;
    const setActiveView = (view: string) => updateUI({ activeActivityItem: view });

    const sessionManager = useSessionManager();
    const editorLayout = useEditorLayout();
    const { showUpdateDialog, setShowUpdateDialog } = useAutoUpdate();
    const restoredIdsRef = useRef<Set<string>>(new Set());

    // 侧边栏位置逻辑
    const sidebarAtRight = config.ui.sidebarPosition === 'right';

    // 基于工作区持久化布局
    useEffect(() => {
        if (sessionManager.workspacePath) {
            editorLayout.setPersistenceKey(sessionManager.workspacePath);
            restoredIdsRef.current.clear();
        }
    }, [sessionManager.workspacePath]);

    // 恢复会话
    useEffect(() => {
        if (!editorLayout.layout || !sessionManager.savedSessions.length) return;

        const restoreSessions = () => {
            const toOpen: SessionConfig[] = [];

            const traverse = (node: any) => {
                if (!node) return;
                if (node.type === 'leaf') {
                    node.views.forEach((viewId: string) => {
                        if (restoredIdsRef.current.has(viewId)) return;

                        const isActive = sessionManager.sessions.some(s => s.id === viewId);
                        if (!isActive) {
                            const saved = sessionManager.savedSessions.find(s => s.id === viewId);
                            if (saved) {
                                toOpen.push(saved);
                            } else {
                                console.warn('[Layout] Cleaning up dead session from layout:', viewId);
                                setTimeout(() => editorLayout.closeView(node.id, viewId), 0);
                            }
                        }
                        restoredIdsRef.current.add(viewId);
                    });
                } else if (node.type === 'split') {
                    node.children.forEach(traverse);
                }
            };

            traverse(editorLayout.layout);

            if (toOpen.length > 0) {
                sessionManager.openSavedSessions(toOpen);
            }
        };

        const timer = setTimeout(() => {
            restoreSessions();
        }, 0);

        return () => clearTimeout(timer);
    }, [editorLayout.layout, sessionManager.savedSessions.length]);

    const handleOpenSettings = async () => {
        let settingsSession = sessionManager.sessions.find(s => s.config.type === 'settings');
        if (!settingsSession) {
            const newId = await sessionManager.createSession('settings', { name: t('editor.settingsTabName') });
            if (newId) {
                editorLayout.openSession(newId);
                sessionManager.setActiveSessionId(newId);
            }
        } else {
            editorLayout.openSession(settingsSession.id);
            sessionManager.setActiveSessionId(settingsSession.id);
        }
    };

    return (
        <SessionProvider manager={sessionManager}>
            <PluginProvider>
                <div className="flex flex-col h-screen w-full bg-[var(--app-background)] text-[var(--app-foreground)] overflow-hidden">
                    <TitleBar />
                    <div className={`flex-1 flex overflow-hidden ${sidebarAtRight ? 'flex-row-reverse' : 'flex-row'}`}>
                        <ActivityBar
                            activeView={activeView}
                            onViewChange={setActiveView}
                            onOpenSettings={handleOpenSettings}
                        />
                        <SideBar
                            activeView={activeView}
                            onViewChange={setActiveView}
                            sessionManager={sessionManager}
                            editorLayout={editorLayout}
                        />

                        <div className="flex-1 flex flex-col min-w-0">
                            <EditorArea
                                sessionManager={sessionManager}
                                editorLayout={editorLayout}
                                onShowSettings={setActiveView}
                            >
                                {children}
                            </EditorArea>
                        </div>
                    </div>
                    {config.ui.showStatusBar && <StatusBar />}
                </div>
                {showUpdateDialog && <UpdateDialog onClose={() => setShowUpdateDialog(false)} />}
            </PluginProvider>
        </SessionProvider>
    );
};
