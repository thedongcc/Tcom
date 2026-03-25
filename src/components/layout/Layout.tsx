import { useEffect, useRef, type ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { SideBar } from './SideBar';
import { StatusBar } from './StatusBar';
import { EditorArea } from './EditorArea';
import { SettingsModal } from '../settings/SettingsModal';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { useSession } from '../../context/SessionContext';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import { UpdateDialog } from '../common/UpdateDialog';
import { useSettings } from '../../context/SettingsContext';
import { isGlassTheme } from '../../hooks/useThemeEffects';
import { SessionConfig } from '../../types/session';

interface LayoutProps {
    children?: ReactNode;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const Layout = ({ children, editorLayout }: LayoutProps) => {
    const sessionManager = useSession();
    const { config, updateUI } = useSettings();
    const activeView = config.ui.activeActivityItem;
    const setActiveView = (view: string) => updateUI({ activeActivityItem: view });

    // sessionManager and editorLayout now come from props
    const { showUpdateDialog, setShowUpdateDialog, hasUpdate, updateVersion, checkForUpdates } = useAutoUpdate();
    const restoredIdsRef = useRef<Set<string>>(new Set());

    // 侧边栏位置逻辑
    const sidebarAtRight = config.ui.sidebarPosition === 'right';

    // 基于 Profile 持久化布局
    useEffect(() => {
        if (sessionManager.activeProfile) {
            editorLayout.setPersistenceKey(sessionManager.activeProfile);
            restoredIdsRef.current.clear();
        }
    }, [sessionManager.activeProfile]);

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



    return (
        <div 
            className="flex flex-col h-screen w-full text-[var(--app-foreground)] overflow-hidden"
            style={{ backgroundColor: isGlassTheme(config.theme) ? 'transparent' : 'var(--app-background)' }}
        >
            <TitleBar />
            <div className={`flex-1 flex overflow-hidden ${sidebarAtRight ? 'flex-row-reverse' : 'flex-row'}`}>
                <ActivityBar
                    activeView={activeView}
                    onViewChange={setActiveView}
                />
                <SideBar
                    activeView={activeView}
                    onViewChange={setActiveView}
                    editorLayout={editorLayout}
                />

                <div className="flex-1 flex flex-col min-w-0">
                    <EditorArea
                        editorLayout={editorLayout}
                        onShowSettings={setActiveView}
                    >
                        {children}
                    </EditorArea>
                </div>
            </div>
            {config.ui.showStatusBar && <StatusBar hasUpdate={hasUpdate} updateVersion={updateVersion} onShowUpdate={checkForUpdates} />}
            {showUpdateDialog && <UpdateDialog onClose={() => setShowUpdateDialog(false)} />}
            <SettingsModal />
        </div>
    );
};
