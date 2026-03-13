/**
 * useWorkspace.ts
 * 工作区路径管理、会话配置持久化、最近工作区列表。
 * 从 useSessionManager 中拆分出来以实现职责单一。
 */
import { useState, useCallback, useRef } from 'react';
import { SessionConfig, SessionState } from '../types/session';

export interface UseWorkspaceReturn {
    workspacePath: string | null;
    recentWorkspaces: string[];
    savedSessions: SessionConfig[];
    setSavedSessions: React.Dispatch<React.SetStateAction<SessionConfig[]>>;
    savedSessionsRef: React.MutableRefObject<SessionConfig[]>;
    workspacePathRef: React.MutableRefObject<string | null>;
    openWorkspace: (path: string) => Promise<void>;
    browseAndOpenWorkspace: () => Promise<void>;
    closeWorkspace: (disconnectAll: () => void) => void;
    saveSession: (session: SessionConfig) => Promise<void>;
    deleteSessionFromDisk: (session: SessionConfig) => Promise<boolean>;
    persistSessionConfig: (sessionId: string, updates: Partial<SessionConfig>, sessionsRef: React.MutableRefObject<SessionState[]>) => void;
}

export const useWorkspace = (): UseWorkspaceReturn => {
    const [workspacePath, setWorkspacePath] = useState<string | null>(null);
    const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
    const [savedSessions, setSavedSessions] = useState<SessionConfig[]>([]);
    const savedSessionsRef = useRef<SessionConfig[]>([]);
    const workspacePathRef = useRef<string | null>(null);
    const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

    // 同步 ref
    // 注意：由调用方在 useEffect 中同步
    // useEffect(() => { savedSessionsRef.current = savedSessions; }, [savedSessions]);

    const openWorkspace = useCallback(async (path: string) => {
        if (!window.workspaceAPI) return;
        const result = await window.workspaceAPI.setLastWorkspace(path);
        if (result.success) {
            setWorkspacePath(path);
            workspacePathRef.current = path;
            const sessionsData = await window.workspaceAPI.listSessions(path);
            if (sessionsData.success && sessionsData.data) {
                // 去重
                const uniqueSessions = sessionsData.data.reduce((acc: Record<string, unknown>[], current: Record<string, unknown>) => {
                    if (!acc.find(s => s.id === current.id)) acc.push(current);
                    return acc;
                }, []);
                setSavedSessions(uniqueSessions as any as SessionConfig[]);
                // 恢复活跃会话
                const savedActiveId = localStorage.getItem(`active-session-${path}`);
                if (savedActiveId && uniqueSessions.some(s => s.id === savedActiveId)) {
                    // 返回 savedActiveId，让调用方设置
                }
            }
            // 刷新最近工作区
            const recentRes = await window.workspaceAPI.getRecentWorkspaces();
            if (recentRes.success) setRecentWorkspaces(recentRes.workspaces);
        }
    }, []);

    const browseAndOpenWorkspace = useCallback(async () => {
        if (!window.workspaceAPI) return;
        const result = await window.workspaceAPI.openFolder();
        if (result.success && result.path) await openWorkspace(result.path);
    }, [openWorkspace]);

    const closeWorkspace = useCallback((disconnectAll: () => void) => {
        disconnectAll();
        setSavedSessions([]);
        setWorkspacePath(null);
        workspacePathRef.current = null;
        window.workspaceAPI?.setLastWorkspace(null);
    }, []);

    const saveSession = useCallback(async (session: SessionConfig) => {
        if (!workspacePathRef.current || !window.workspaceAPI) return;
        setSavedSessions(prev => {
            const idx = prev.findIndex(s => s.id === session.id);
            if (idx >= 0) {
                const newSaved = [...prev];
                newSaved[idx] = session;
                return newSaved;
            }
            return [...prev, session];
        });
        await window.workspaceAPI.saveSession(workspacePathRef.current, session as any);
    }, []);

    const deleteSessionFromDisk = useCallback(async (session: SessionConfig): Promise<boolean> => {
        if (!workspacePathRef.current || !window.workspaceAPI) return false;
        const result = await window.workspaceAPI.deleteSession(workspacePathRef.current, session as any);
        if (result.success) {
            setSavedSessions(prev => prev.filter(s => s.id !== session.id));
            return true;
        }
        return false;
    }, []);

    // 防抖持久化：在 config 更新后延迟 1 秒写入磁盘
    const persistSessionConfig = useCallback((
        sessionId: string,
        updates: Partial<SessionConfig>,
        sessionsRef: React.MutableRefObject<SessionState[]>
    ) => {
        const isSaved = savedSessionsRef.current.some(s => s.id === sessionId);
        if (!isSaved) return;

        // 立即更新 savedSessions（UI 同步）
        setSavedSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } as SessionConfig : s));

        // 清除旧的定时器
        if (debounceTimersRef.current[sessionId]) {
            clearTimeout(debounceTimersRef.current[sessionId]);
        }

        // 延迟 1 秒写盘
        debounceTimersRef.current[sessionId] = setTimeout(async () => {
            const latestSession = sessionsRef.current.find(s => s.id === sessionId);
            if (!latestSession || !window.workspaceAPI) return;

            console.log(`[SessionManager] Persisting session ${sessionId} to disk...`);
            const wsPath = workspacePathRef.current;
            if (wsPath) {
                if (updates.name && updates.name !== latestSession.config.name) {
                    await window.workspaceAPI.renameSession(wsPath, latestSession.config.name, updates.name);
                }
                await window.workspaceAPI.saveSession(wsPath, latestSession.config as any);
            }
            delete debounceTimersRef.current[sessionId];
        }, 1000);
    }, []);

    return {
        workspacePath, recentWorkspaces, savedSessions, setSavedSessions,
        savedSessionsRef, workspacePathRef,
        openWorkspace, browseAndOpenWorkspace, closeWorkspace,
        saveSession, deleteSessionFromDisk, persistSessionConfig,
    };
};
