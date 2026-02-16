import { useState, useEffect, type ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { SideBar } from './SideBar';
import { StatusBar } from './StatusBar';
import { EditorArea } from './EditorArea';
import { Panel } from './Panel';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { useSessionManager } from '../../hooks/useSessionManager';
import { SessionProvider } from '../../context/SessionContext';

import { PluginProvider } from '../../context/PluginContext';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import { UpdateDialog } from '../common/UpdateDialog';

export const Layout = ({ children }: { children?: ReactNode }) => {
    const [activeView, setActiveView] = useState('explorer');
    const sessionManager = useSessionManager();
    const editorLayout = useEditorLayout();
    const { showUpdateDialog, setShowUpdateDialog } = useAutoUpdate();

    // Persist layout based on workspace
    useEffect(() => {
        if (sessionManager.workspacePath) {
            editorLayout.setPersistenceKey(sessionManager.workspacePath);
        }
    }, [sessionManager.workspacePath]);

    // Restore sessions based on layout
    useEffect(() => {
        if (!editorLayout.layout || !sessionManager.savedSessions.length) return;

        const restoreSessions = () => {
            const traverse = (node: any) => {
                if (!node) return;
                if (node.type === 'leaf') {
                    node.views.forEach((viewId: string) => {
                        const isActive = sessionManager.sessions.some(s => s.id === viewId);
                        if (!isActive) {
                            const saved = sessionManager.savedSessions.find(s => s.id === viewId);
                            if (saved) {
                                sessionManager.openSavedSession(saved);
                            }
                        }
                    });
                } else if (node.type === 'split') {
                    node.children.forEach(traverse);
                }
            };
            traverse(editorLayout.layout);
        };

        // Defer restoration to next tick to avoid flushSync warnings during initial render
        const timer = setTimeout(() => {
            restoreSessions();
        }, 0);

        return () => clearTimeout(timer);
    }, [editorLayout.layout, sessionManager.savedSessions]);

    const handleOpenSettings = async () => {
        // Check if settings session exists
        let settingsSession = sessionManager.sessions.find(s => s.config.type === 'settings');
        if (!settingsSession) {
            // Create new settings session
            const newId = await sessionManager.createSession('settings');

            if (newId) {
                editorLayout.openSession(newId);
                sessionManager.setActiveSessionId(newId);
            }
        } else {
            editorLayout.openSession(settingsSession.id);
            sessionManager.setActiveSessionId(settingsSession.id);
        }

        setActiveView('settings');
    };

    return (
        <SessionProvider manager={sessionManager}>
            <PluginProvider>
                <div className="flex flex-col h-screen w-full bg-[var(--vscode-bg)] text-[var(--vscode-fg)] overflow-hidden">
                    <TitleBar />
                    <div className="flex-1 flex overflow-hidden">
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
                    <StatusBar />
                </div>
                {showUpdateDialog && <UpdateDialog onClose={() => setShowUpdateDialog(false)} />}
            </PluginProvider>
        </SessionProvider>
    );
};
