import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ConfigSidebar } from '../serial/ConfigSidebar';
import { SessionListSidebar } from '../serial/SessionListSidebar';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { CommandListSidebar } from '../commands/CommandListSidebar';
import { usePluginManager } from '../../context/PluginContextShared';
import { ExtensionsSidebar } from '../extensions/ExtensionsSidebar';
import { useI18n } from '../../context/I18nContext';

interface SideBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SideBar = ({ activeView, onViewChange, sessionManager, editorLayout }: SideBarProps) => {
    if (!activeView || activeView === 'settings') return null;

    const { getPlugin } = usePluginManager();
    const activePlugin = getPlugin(activeView);
    const { t } = useI18n();

    // Resizing State
    const [width, setWidth] = useState(() => {
        const saved = localStorage.getItem('sidebar-width');
        return saved ? parseInt(saved, 10) : 250;
    });
    const widthRef = useRef(width);
    const isResizing = useRef(false);

    // Sync ref with state
    useEffect(() => {
        widthRef.current = width;
    }, [width]);

    // Effect to sync storage when resize ends or explicit change occurs (e.g. double click)
    useEffect(() => {
        if (!isResizing.current) {
            localStorage.setItem('sidebar-width', width.toString());
        }
    }, [width]);

    const updateWidth = (newWidth: number) => {
        setWidth(newWidth);
        widthRef.current = newWidth;
    };

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = e.clientX - 48;
        if (newWidth > 150 && newWidth < 600) {
            updateWidth(newWidth);
        }
    };

    const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
        // Trigger one final storage sync now that isResizing is false
        localStorage.setItem('sidebar-width', widthRef.current.toString());
    };

    const handleDoubleClick = () => {
        updateWidth(250);
    };

    return (
        <div
            className="flex flex-col border-r border-[var(--border-color)] relative shrink-0"
            style={{ width: `${width}px`, backgroundColor: 'var(--sidebar-background)' }}
        >
            {activeView !== 'commands' && (
                <div className="h-[35px] px-4 flex items-center justify-between text-[11px] font-bold text-[var(--app-foreground)] tracking-wide uppercase shrink-0">
                    <span className="truncate">
                        {(() => {
                            const viewMap: Record<string, string> = {
                                'explorer': t('sidebar.sessions'),
                                'serial': t('sidebar.configuration'),
                                'commands': t('sidebar.commands'),
                                'virtual-port': t('sidebar.virtualPort'),
                                'extensions': t('sidebar.extensions')
                            };

                            const translated = viewMap[activeView];
                            if (translated) return translated;
                            if (activePlugin) return activePlugin.name;
                            return activeView;
                        })()}
                    </span>
                    <MoreHorizontal size={14} className="cursor-pointer hover:text-[var(--app-foreground)]" />
                </div>
            )}

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {activeView === 'explorer' && <SessionListSidebar sessionManager={sessionManager} editorLayout={editorLayout} />}
                {activeView === 'search' && <div className="p-4 text-xs text-[#969696]">Search not implemented</div>}
                {activeView === 'serial' && <ConfigSidebar sessionManager={sessionManager} />}
                {activeView === 'extensions' && <ExtensionsSidebar />}

                {/* Dynamic Plugin Sidebar */}
                {activePlugin && activePlugin.sidebarComponent && (
                    <activePlugin.sidebarComponent
                        onNavigate={onViewChange}
                        sessionManager={sessionManager}
                        editorLayout={editorLayout}
                    />
                )}
            </div>

            {/* Resize Sash */}
            <div
                className="absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-[var(--accent-color)] opacity-0 hover:opacity-100 transition-opacity z-10"
                style={{ right: '-2px' }}
                onMouseDown={startResizing}
                onDoubleClick={handleDoubleClick}
            />
        </div>
    );
};
