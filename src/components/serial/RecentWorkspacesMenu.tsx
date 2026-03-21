/**
 * RecentWorkspacesMenu.tsx
 * Profile 切换弹出菜单 — 显示所有 Profile 列表，支持快速切换。
 * 底部提供「管理配置档案」入口。
 */
import { Check, User, Settings } from 'lucide-react';

interface RecentWorkspacesMenuProps {
    position: { x: number; y: number };
    currentWorkspacePath: string | null;
    recentWorkspaces: string[];
    onOpenWorkspace: (path: string) => void;
    onClose: () => void;
    onManageProfiles?: () => void;
    t: (path: string, vars?: Record<string, string>) => string;
}

export const RecentWorkspacesMenu = ({
    position,
    currentWorkspacePath,
    recentWorkspaces,
    onOpenWorkspace,
    onClose,
    onManageProfiles,
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
                    <User size={12} className="opacity-50 shrink-0" />
                    <span className="truncate flex-1">{ws}</span>
                    {currentWorkspacePath === ws && <Check size={12} className="opacity-70" />}
                </div>
            ))}
            {recentWorkspaces.length > 0 && (
                <div className="h-[1px] bg-[var(--border-color)] my-1 opacity-50" />
            )}
            {/* 管理配置档案入口 */}
            {onManageProfiles && (
                <div
                    className="px-3 py-1.5 text-[12px] hover:bg-[var(--list-hover-background)] hover:text-[var(--st-sidebar-text)] cursor-pointer flex items-center gap-2"
                    onClick={() => {
                        onManageProfiles();
                        onClose();
                    }}
                >
                    <Settings size={12} className="opacity-50" />
                    <span>管理配置档案...</span>
                </div>
            )}
        </div>
    );
};
