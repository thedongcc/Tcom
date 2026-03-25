import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { SessionConfig, SessionState } from '../types/session';
import { migrateLegacyData } from '../lib/migrateLegacyData';

interface ProfileContextType {
    /** 当前活跃 Profile 名称 */
    activeProfile: string;
    /** Profile 列表 */
    profiles: Array<{ name: string; createdAt?: string }>;
    /** 已保存的 Session 列表 */
    savedSessions: SessionConfig[];
    setSavedSessions: React.Dispatch<React.SetStateAction<SessionConfig[]>>;
    savedSessionsRef: React.MutableRefObject<SessionConfig[]>;
    /** Profile 是否已加载 */
    isLoaded: boolean;
    /** 是否已完成旧数据迁移 */
    isMigrated: boolean;
    /** 切换 Profile */
    switchProfile: (name: string) => Promise<void>;
    /** 创建新 Profile */
    createProfile: (name: string) => Promise<boolean>;
    /** 删除 Profile */
    deleteProfile: (name: string) => Promise<boolean>;
    /** 重命名 Profile */
    renameProfile: (oldName: string, newName: string) => Promise<boolean>;
    /** 复制 Profile */
    duplicateProfile: (oldName: string, newName: string) => Promise<boolean>;
    /** 刷新 Profile 列表 */
    refreshProfiles: () => Promise<void>;
    /** 保存 Session */
    saveSession: (session: SessionConfig) => Promise<void>;
    /** 删除 Session */
    deleteSessionFromDisk: (session: SessionConfig) => Promise<boolean>;
    /** 防抖持久化 Session 配置 */
    persistSessionConfig: (sessionId: string, updates: Partial<SessionConfig>, sessionsRef: React.MutableRefObject<SessionState[]>) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
    const [activeProfile, setActiveProfile] = useState<string>('default');
    const [profiles, setProfiles] = useState<Array<{ name: string; createdAt?: string }>>([]);
    const [savedSessions, setSavedSessions] = useState<SessionConfig[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isMigrated, setIsMigrated] = useState(false);
    const savedSessionsRef = useRef<SessionConfig[]>([]);
    const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

    // 同步 savedSessionsRef
    useEffect(() => {
        savedSessionsRef.current = savedSessions;
    }, [savedSessions]);

    // 初始化：加载运行时状态，确定上次使用的 Profile，必要时执行旧数据迁移
    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            try {
                // 加载运行时状态
                const stateRes = await window.globalSettingsAPI?.loadState();
                if (cancelled) return;

                const state = stateRes?.data;
                const migrated = state?.migrated ?? false;
                const lastProfile = (state?.lastProfile as string) || 'default';

                setIsMigrated(migrated as boolean);

                // 加载 Profile 列表
                const listRes = await window.profileAPI?.list();
                if (cancelled) return;

                if (listRes?.success) {
                    setProfiles(listRes.profiles);

                    // 如果没有任何 Profile，创建默认的
                    if (listRes.profiles.length === 0) {
                        await window.profileAPI?.create('default');
                        const refreshed = await window.profileAPI?.list();
                        if (refreshed?.success) {
                            setProfiles(refreshed.profiles);
                        }
                    }
                }

                // 首次启动且未迁移：执行旧 localStorage 数据迁移
                if (!migrated) {
// log('[Profile] 检测到首次使用新存储架构，开始迁移旧数据...');
                    const result = await migrateLegacyData('default');
                    if (cancelled) return;
                    if (result.migrated) {
                        setIsMigrated(true);
// log('[Profile] 旧数据迁移完成:', result);
                    }
                }

                // 打开上次使用的 Profile
                await loadProfile(lastProfile);
                if (cancelled) return;

                setIsLoaded(true);
            } catch (e) {
                console.error('Profile 初始化失败:', e);
                setIsLoaded(true);
            }
        };
        init();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 加载指定 Profile 的 Session 列表
    const loadProfile = useCallback(async (name: string) => {
        setActiveProfile(name);
        try {
            const res = await window.profileAPI?.listSessions(name);
            if (res?.success && res.data) {
                // 去重
                const uniqueSessions = res.data.reduce((acc: Record<string, unknown>[], current: Record<string, unknown>) => {
                    if (!acc.find(s => s.id === current.id)) acc.push(current);
                    return acc;
                }, []);
                setSavedSessions(uniqueSessions as unknown as SessionConfig[]);
            } else {
                setSavedSessions([]);
            }
        } catch (e) {
            console.error(`加载 Profile "${name}" 失败:`, e);
            setSavedSessions([]);
        }
    }, []);

    const switchProfile = useCallback(async (name: string) => {
        await loadProfile(name);
        // 保存到运行时状态
        try {
            const stateRes = await window.globalSettingsAPI?.loadState();
            const state = stateRes?.data || {};
            await window.globalSettingsAPI?.saveState({
                ...state,
                lastProfile: name,
            });
        } catch (e) {
            console.error('保存运行时状态失败:', e);
        }
    }, [loadProfile]);

    const refreshProfiles = useCallback(async () => {
        try {
            const res = await window.profileAPI?.list();
            if (res?.success) setProfiles(res.profiles);
        } catch (e) {
            console.error('刷新 Profile 列表失败:', e);
        }
    }, []);

    const createProfile = useCallback(async (name: string): Promise<boolean> => {
        try {
            const res = await window.profileAPI?.create(name);
            if (res?.success) {
                await refreshProfiles();
                return true;
            }
        } catch (e) {
            console.error('创建 Profile 失败:', e);
        }
        return false;
    }, [refreshProfiles]);

    const deleteProfile = useCallback(async (name: string): Promise<boolean> => {
        try {
            const res = await window.profileAPI?.delete(name);
            if (res?.success) {
                await refreshProfiles();
                // 如果删除的是当前活跃 Profile，切换到 default
                if (name === activeProfile) {
                    await switchProfile('default');
                }
                return true;
            }
        } catch (e) {
            console.error('删除 Profile 失败:', e);
        }
        return false;
    }, [activeProfile, refreshProfiles, switchProfile]);

    const renameProfile = useCallback(async (oldName: string, newName: string): Promise<boolean> => {
        try {
            const res = await window.profileAPI?.rename(oldName, newName);
            if (res?.success) {
                await refreshProfiles();
                if (oldName === activeProfile) {
                    setActiveProfile(newName);
                }
                return true;
            }
        } catch (e) {
            console.error('重命名 Profile 失败:', e);
        }
        return false;
    }, [activeProfile, refreshProfiles]);

    const duplicateProfile = useCallback(async (oldName: string, newName: string): Promise<boolean> => {
        try {
            const res = await window.profileAPI?.duplicate(oldName, newName);
            if (res?.success) {
                await refreshProfiles();
                return true;
            }
        } catch (e) {
            console.error('复制 Profile 失败:', e);
        }
        return false;
    }, [refreshProfiles]);

    const saveSession = useCallback(async (session: SessionConfig) => {
        setSavedSessions(prev => {
            const idx = prev.findIndex(s => s.id === session.id);
            if (idx >= 0) {
                const newSaved = [...prev];
                newSaved[idx] = session;
                return newSaved;
            }
            return [...prev, session];
        });
        try {
            await window.profileAPI?.saveSession(activeProfile, session as unknown as Record<string, unknown>);
        } catch (e) {
            console.error('保存 Session 失败:', e);
        }
    }, [activeProfile]);

    const deleteSessionFromDisk = useCallback(async (session: SessionConfig): Promise<boolean> => {
        try {
            const res = await window.profileAPI?.deleteSession(activeProfile, session as unknown as Record<string, unknown>);
            if (res?.success) {
                setSavedSessions(prev => prev.filter(s => s.id !== session.id));
                return true;
            }
        } catch (e) {
            console.error('删除 Session 失败:', e);
        }
        return false;
    }, [activeProfile]);

    const persistSessionConfig = useCallback((
        sessionId: string,
        updates: Partial<SessionConfig>,
        sessionsRef: React.MutableRefObject<SessionState[]>
    ) => {
        const isSaved = savedSessionsRef.current.some(s => s.id === sessionId);
        if (!isSaved) return;

        // 即时 UI 更新
        setSavedSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } as SessionConfig : s));

        // 清除旧定时器
        if (debounceTimersRef.current[sessionId]) {
            clearTimeout(debounceTimersRef.current[sessionId]);
        }

        // 延迟 1 秒写盘
        debounceTimersRef.current[sessionId] = setTimeout(async () => {
            const latestSession = sessionsRef.current.find(s => s.id === sessionId);
            if (!latestSession) return;

// log(`[Profile] 持久化 session ${sessionId} 到磁盘...`);
            try {
                if (updates.name && updates.name !== latestSession.config.name) {
                    await window.profileAPI?.renameSession(activeProfile, latestSession.config.name, updates.name);
                }
                await window.profileAPI?.saveSession(activeProfile, latestSession.config as unknown as Record<string, unknown>);
            } catch (e) {
                console.error('持久化 Session 配置失败:', e);
            }
            delete debounceTimersRef.current[sessionId];
        }, 1000);
    }, [activeProfile]);

    return (
        <ProfileContext.Provider value={{
            activeProfile,
            profiles,
            savedSessions,
            setSavedSessions,
            savedSessionsRef,
            isLoaded,
            isMigrated,
            switchProfile,
            createProfile,
            deleteProfile,
            renameProfile,
            duplicateProfile,
            refreshProfiles,
            saveSession,
            deleteSessionFromDisk,
            persistSessionConfig,
        }}>
            {children}
        </ProfileContext.Provider>
    );
};

export const useProfile = () => {
    const context = useContext(ProfileContext);
    if (!context) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }
    return context;
};
