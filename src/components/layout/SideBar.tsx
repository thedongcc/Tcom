import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ConfigSidebar } from '../serial/ConfigSidebar';
import { SessionListSidebar } from '../serial/SessionListSidebar';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { CommandListSidebar } from '../commands/CommandListSidebar';
import { usePluginManager } from '../../context/PluginContext';
import { ExtensionsSidebar } from '../extensions/ExtensionsSidebar';

interface SideBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SideBar = ({ activeView, onViewChange, sessionManager, editorLayout }: SideBarProps) => {
    if (!activeView) return null;

    const { getPlugin } = usePluginManager();
    const activePlugin = getPlugin(activeView);

    // Resizing State
    const [width, setWidth] = useState(250);
    const isResizing = useRef(false);

    useEffect(() => {
        const savedWidth = localStorage.getItem('sidebar-width');
        if (savedWidth) {
            setWidth(parseInt(savedWidth, 10));
        }
    }, []);

    useEffect(() => {
        if (!isResizing.current) {
            localStorage.setItem('sidebar-width', width.toString());
        }
    }, [width]);

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        // Sidebar is on the left, so width is just clientX - activityBarWidth (48) ??
        // Actually Layout is Flex Row: ActivityBar (48) | SideBar (Width) | Editor
        // So mouse position relative to window left is: 48 + Width.
        // Thus Width = mouseX - 48.
        const newWidth = e.clientX - 48;
        if (newWidth > 150 && newWidth < 600) {
            setWidth(newWidth);
        }
    };

    const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
        // Save final width
        localStorage.setItem('sidebar-width', width.toString());
    };

    return (
        <div
            className="flex flex-col border-r border-[var(--vscode-border)] relative shrink-0"
            style={{ width: `${width}px`, backgroundColor: 'var(--vscode-sidebar)' }}
        >
            <div className="h-[35px] px-4 flex items-center justify-between text-[11px] font-bold text-[var(--vscode-fg)] tracking-wide uppercase shrink-0">
                <span className="truncate">{activePlugin ? activePlugin.name : activeView === 'explorer' ? 'SESSIONS' : activeView === 'serial' ? 'CONFIGURATION' : activeView === 'commands' ? 'COMMANDS' : activeView}</span>
                <MoreHorizontal size={14} className="cursor-pointer hover:text-white" />
            </div>

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
                className="absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-[var(--vscode-accent)] opacity-0 hover:opacity-100 transition-opacity z-10"
                style={{ right: '-2px' }}
                onMouseDown={startResizing}
            />
        </div>
    );
};
