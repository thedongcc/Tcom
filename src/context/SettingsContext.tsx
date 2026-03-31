/**
 * SettingsContext.tsx
 * 全局设置 Context — 配置状态管理、主题列表加载、配置 CRUD。
 * 数据通过 globalSettingsAPI 持久化到文件系统。
 *
 * 副效应委托：
 * - useThemeEffects — 主题/排版/背景图的 DOM 副效应
 * - useColorPicker — 拾取器 + 预览同步
 *
 * 子模块：
 * - settingsConfigMigration.ts — 配置合并与旧版本迁移
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME } from '../types/theme';
import { ThemeDefinition } from '../themes';
import { useColorPicker } from '../hooks/useColorPicker';
import { useThemeEffects } from '../hooks/useThemeEffects';
import { loadInitialConfig, mergeAndMigrate } from './settingsConfigMigration';
import { flushRegistry } from '../hooks/useFlushOnExit';
import { emit, listen } from '@tauri-apps/api/event';

interface SettingsContextType {
    config: ThemeConfig;
    availableThemes: ThemeDefinition[];
    loadThemes: () => Promise<void>;
    updateConfig: (updates: Partial<ThemeConfig> | ((prev: ThemeConfig) => ThemeConfig)) => void;
    updateUI: (updates: Partial<ThemeConfig['ui']>) => void;
    setTheme: (themeId: string) => void;
    importConfig: (json: string) => void;
    exportConfig: () => string;
    resetConfig: () => void;
}

// ── 设置弹窗状态独立 context（避免 open/close 导致整棵树 re-render）──
interface SettingsModalContextType {
    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);
const SettingsModalContext = createContext<SettingsModalContextType | undefined>(undefined);

export const useSettingsModal = () => {
    const ctx = useContext(SettingsModalContext);
    if (!ctx) throw new Error('useSettingsModal must be within SettingsProvider');
    return ctx;
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [config, setConfig] = useState<ThemeConfig>(loadInitialConfig);
    // 从 localStorage 缓存同步恢复主题列表（惰性初始化，避免 IPC 等待期间 availableThemes 为空）
    const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>(() => {
        try {
            const cached = localStorage.getItem('tcom-themes-cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed as ThemeDefinition[];
            }
        } catch { /* 解析失败则使用空列表 */ }
        return [];
    });
    const [isLoaded, setIsLoaded] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

    // ── 设置弹窗状态（独立 state，避免主 context re-render）──
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const openSettings = useCallback(() => setIsSettingsOpen(true), []);
    const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

    // 全局快捷键 Ctrl+, 呼出设置
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                setIsSettingsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // 稳定的弹窗 context value（仅在 isSettingsOpen 变化时更新）
    const modalValue = useMemo<SettingsModalContextType>(
        () => ({ isSettingsOpen, openSettings, closeSettings }),
        [isSettingsOpen, openSettings, closeSettings]
    );

    // ── 加载主题（稳定引用 + in-flight 锁 + localStorage 缓存）──
    const themesLoadedRef = useRef(false);        // 已加载标记（Ref 读写不触发 re-render）
    const themesLoadingRef = useRef(false);       // 正在加载中标记
    const setAvailableThemesRef = useRef(setAvailableThemes); // 稳定的 setter 引用
    setAvailableThemesRef.current = setAvailableThemes;

    // 若 availableThemes 已从缓存恢复，同步更新 Ref 标记，守卫生效
    if (!themesLoadedRef.current && availableThemes.length > 0) {
        themesLoadedRef.current = true;
    }

    const loadThemes = useCallback(async () => {
        // 双重守卫：已加载 or 正在加载中，直接跳过
        if (themesLoadedRef.current || themesLoadingRef.current) return;
        themesLoadingRef.current = true;
        console.time('[Settings] loadThemes');
        try {
            const api = window.themeAPI;
            if (api?.loadAll) {
                const res = await api.loadAll();
                if (res?.success) {
                    console.log('%c[Settings] loadThemes 结果: ' + res.themes.length + ' 个主题', 'color:#CE9178');
                    themesLoadedRef.current = true;
                    try { localStorage.setItem('tcom-themes-cache', JSON.stringify(res.themes)); } catch { /* 忽略 */ }
                    setAvailableThemesRef.current(res.themes);
                }
            }
        } catch (e) {
            console.error('Failed to load themes:', e);
        } finally {
            themesLoadingRef.current = false;
            console.timeEnd('[Settings] loadThemes');
        }
    }, []); // 空依赖数组 → 稳定引用，不会导致 useMemo 重建

    // 初次挂载：从文件加载设置 + 加载主题
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            // 加载主题
            queueMicrotask(() => { if (!cancelled) loadThemes(); });

            // 从 globalSettingsAPI 加载设置
            try {
                const res = await window.globalSettingsAPI?.load();
                if (cancelled) return;
                if (res?.success && res.data) {
                    const merged = mergeAndMigrate(res.data as Partial<ThemeConfig> & Record<string, unknown>);
                    setConfig(merged);
                }
            } catch (e) {
                console.error('加载全局设置失败:', e);
            }

            if (!cancelled) setIsLoaded(true);
        };

        init();
        return () => { cancelled = true; };
    }, []);

    // ── 跨窗口主题同步（编辑器窗口监听主窗口的主题切换） ──
    useEffect(() => {
        let unlisten: (() => void) | null = null;
        listen<string>('theme:switched', (event) => {
            const newThemeId = event.payload;
            setConfig(prev => {
                if (prev.theme === newThemeId) return prev;
                return { ...prev, theme: newThemeId };
            });
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // 防抖保存到文件（变更后 500ms 写盘）
    useEffect(() => {
        if (!isLoaded) return;

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
            window.globalSettingsAPI?.save(config as unknown as Record<string, unknown>).catch(e => {
                console.error('保存全局设置失败:', e);
            });
            // 同时写入 localStorage 作为快速启动缓存（仅字体相关）
            try {
                localStorage.setItem('tcom-settings', JSON.stringify(config));
                localStorage.setItem('tcom-theme', config.theme);
            } catch { /* localStorage 满或不可用时静默失败 */ }
        }, 500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [config, isLoaded]);

    // 注册 Flush 回调（窗口关闭前立即保存）
    useEffect(() => {
        const flush = async () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = undefined;
            }
            if (isLoaded) {
                await window.globalSettingsAPI?.save(config as unknown as Record<string, unknown>);
                try {
                    localStorage.setItem('tcom-settings', JSON.stringify(config));
                    localStorage.setItem('tcom-theme', config.theme);
                } catch { /* 静默失败 */ }
            }
        };
        flushRegistry.register(flush);
        return () => { flushRegistry.unregister(flush); };
    }, [config, isLoaded]);

    // ── 副效应委托 ──
    useThemeEffects({ config, availableThemes });
    useColorPicker({ availableThemes, config });

    // ── 配置修改函数（全部 useCallback，避免每次渲染产生新引用）──

    const updateConfig = useCallback((updates: Partial<ThemeConfig> | ((prev: ThemeConfig) => ThemeConfig)) => {
        if (typeof updates === 'function') {
            setConfig(prev => ({ ...prev, ...updates(prev) }));
        } else {
            setConfig(prev => ({ ...prev, ...updates }));
        }
    }, []);

    const updateUI = useCallback((updates: Partial<ThemeConfig['ui']>) => {
        setConfig(prev => ({ ...prev, ui: { ...prev.ui, ...updates } }));
    }, []);

    const setTheme = useCallback((themeId: string) => {
        setConfig(prev => ({ ...prev, theme: themeId }));
        // 通知所有窗口（含主题编辑器独立窗口）主题已切换
        emit('theme:switched', themeId).catch(() => {});
    }, []);

    const importConfig = useCallback((json: string) => {
        try {
            const parsed = JSON.parse(json);
            setConfig(mergeAndMigrate(parsed));
        } catch (e) {
            console.error('Import failed', e);
        }
    }, []);

    const exportConfig = useCallback(() => JSON.stringify(config, null, 2), [config]);

    const resetConfig = useCallback(() => {
        setConfig(DEFAULT_THEME);
    }, []);

    // 稳定的主 context value（isSettingsOpen 变化时不再触发此对象更新）
    const contextValue = useMemo<SettingsContextType>(() => ({
        config,
        availableThemes,
        loadThemes,
        updateConfig,
        updateUI,
        setTheme,
        importConfig,
        exportConfig,
        resetConfig,
    }), [config, availableThemes, loadThemes, updateConfig, updateUI, setTheme,
        importConfig, exportConfig, resetConfig]);

    return (
        <SettingsModalContext.Provider value={modalValue}>
            <SettingsContext.Provider value={contextValue}>
                {children}
            </SettingsContext.Provider>
        </SettingsModalContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

/** @deprecated 使用 useSettingsModal().isSettingsOpen */
export const useIsSettingsOpen = () => useSettingsModal().isSettingsOpen;
