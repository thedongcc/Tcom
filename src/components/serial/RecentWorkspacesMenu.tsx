/**
 * RecentWorkspacesMenu.tsx
 * 最近工作区弹出菜单 — 从 SessionListSidebar 拆分出来。
 */
import { Check } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface RecentWorkspacesMenuProps {
    position: { x: number; y: number };
    currentWorkspacePath: string | null;
    recentWorkspaces: string[];
    onOpenWorkspace: (path: string) => void;
    onBrowseWorkspace: () => void;
    onClose: () => void;
    t: (path: string, vars?: Record<string, string>) => string;
}

export const RecentWorkspacesMenu = ({
    position,
    currentWorkspacePath,
    recentWorkspaces,
    onOpenWorkspace,
    onBrowseWorkspace,
    onClose,
    t,
}: RecentWorkspacesMenuProps) => {
    return (
        <div
            className="fixed z-50 bg-[var(--st-menu-bg)] border border-[var(--widget-border-color)] shadow-lg rounded py-1 min-w-[200px]"
            style={{ top: position.y, left: position.x }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="px-3 py-1.5 text-[11px] font-semibold opacity-50 select-none uppercase">
                {t('session.recentWorkspaces')}
            </div>
            {recentWorkspaces.map(ws => (
                <div
                    key={ws}
                    className="px-3 py-1.5 text-[12px] hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer flex items-center gap-2"
                    onClick={() => {
                        onOpenWorkspace(ws);
                        onClose();
                    }}
                >
                    <Tooltip content={ws} position="right" wrapperClassName="truncate flex-1" className="max-w-[300px] whitespace-normal">
                        <span className="truncate flex-1">
                            {ws.split(/[\\/]/).pop()}
                        </span>
                    </Tooltip>
                    {currentWorkspacePath === ws && <Check size={12} className="opacity-70" />}
                </div>
            ))}
            {recentWorkspaces.length > 0 && (
                <div className="h-[1px] bg-[var(--border-color)] my-1 opacity-50" />
            )}
            <div
                className="px-3 py-1.5 text-[12px] hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer"
                onClick={() => {
                    onBrowseWorkspace();
                    onClose();
                }}
            >
                {t('session.openOther')}
            </div>
        </div>
    );
};
