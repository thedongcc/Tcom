/**
 * WorkspaceHeader.tsx
 * 工作区头部 — 显示当前工作区名称和操作按钮（刷新、最近、新建）。
 * 从 SessionListSidebar 拆分出来。
 */
import React from 'react';
import { User, Plus, MoreHorizontal, RefreshCw } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface WorkspaceHeaderProps {
    workspaceFolderName: string | null;
    onRefreshWorkspace: () => void;
    onShowRecentMenu: (e: React.MouseEvent) => void;
    onShowNewSession: () => void;
    recentButtonRef: React.Ref<HTMLDivElement>;
    addButtonRef: React.Ref<HTMLDivElement>;
    t: (path: string, vars?: Record<string, string>) => string;
}

export const WorkspaceHeader = ({
    workspaceFolderName,
    onRefreshWorkspace,
    onShowRecentMenu,
    onShowNewSession,
    recentButtonRef,
    addButtonRef,
    t,
}: WorkspaceHeaderProps) => {
    return (
        <div className="px-3 h-[42px] flex items-center border-b border-[var(--session-list-sidebar-border)] shrink-0">
            <div className="flex items-center justify-between w-full">
                <Tooltip content={workspaceFolderName || 'default'} position="bottom" wrapperClassName="min-w-0 flex-1 flex">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-80 min-w-0 flex-1 cursor-default">
                        <User size={13} className="shrink-0 opacity-70" />
                        <span className="truncate">{workspaceFolderName || 'default'}</span>
                    </div>
                </Tooltip>
                <div className="flex items-center gap-0.5 shrink-0">
                    <Tooltip content={t('monitor.refresh')} position="bottom">
                        <div
                            className="cursor-pointer p-1 rounded hover:bg-[var(--list-hover-background)]"
                            onClick={onRefreshWorkspace}
                        >
                            <RefreshCw size={13} className="opacity-70 hover:opacity-100" />
                        </div>
                    </Tooltip>
                    <Tooltip content={t('session.recentWorkspaces')} position="bottom">
                        <div
                            ref={recentButtonRef}
                            className="cursor-pointer p-1 rounded hover:bg-[var(--list-hover-background)]"
                            onClick={onShowRecentMenu}
                        >
                            <MoreHorizontal size={14} className="opacity-70 hover:opacity-100" />
                        </div>
                    </Tooltip>
                    <Tooltip content={t('session.newSession')} position="bottom">
                        <div
                            ref={addButtonRef}
                            className="cursor-pointer p-1 rounded hover:bg-[var(--list-hover-background)]"
                            onClick={onShowNewSession}
                        >
                            <Plus size={14} className="opacity-70 hover:opacity-100" />
                        </div>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
};
