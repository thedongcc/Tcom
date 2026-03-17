/**
 * WorkspaceHeader.tsx
 * 工作区头部 — 显示当前工作区名称和操作按钮（刷新、最近、新建）。
 * 从 SessionListSidebar 拆分出来。
 */
import React from 'react';
import { FolderOpen, Plus, MoreHorizontal, RefreshCw } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface WorkspaceHeaderProps {
    workspacePath: string | null;
    workspaceFolderName: string | null;
    onRefreshWorkspace: () => void;
    onShowRecentMenu: (e: React.MouseEvent) => void;
    onShowNewSession: () => void;
    onBrowseWorkspace: () => void;
    recentButtonRef: React.Ref<HTMLDivElement>;
    addButtonRef: React.Ref<HTMLDivElement>;
    t: (path: string, vars?: Record<string, string>) => string;
}

export const WorkspaceHeader = ({
    workspacePath,
    workspaceFolderName,
    onRefreshWorkspace,
    onShowRecentMenu,
    onShowNewSession,
    onBrowseWorkspace,
    recentButtonRef,
    addButtonRef,
    t,
}: WorkspaceHeaderProps) => {
    return (
        <div className="px-3 py-2 border-b border-[var(--session-list-sidebar-border)] bg-[var(--session-list-sidebar-header-bg)]">
            {workspacePath ? (
                <div className="flex items-center justify-between">
                    <Tooltip content={workspacePath} position="bottom" wrapperClassName="min-w-0 flex-1 flex">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-80 min-w-0 flex-1 cursor-default">
                            <FolderOpen size={13} className="shrink-0 opacity-70" />
                            <span className="truncate">{workspaceFolderName}</span>
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
            ) : (
                <div className="flex flex-col items-center gap-2 py-4">
                    <FolderOpen size={32} className="opacity-30" />
                    <span className="text-[11px] opacity-50 text-center">{t('session.noWorkspaceOpen')}</span>
                    <button
                        className="text-[12px] px-3 py-1.5 rounded bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)] cursor-pointer transition-colors"
                        onClick={onBrowseWorkspace}
                    >
                        {t('session.openWorkspace')}
                    </button>
                </div>
            )}
        </div>
    );
};
