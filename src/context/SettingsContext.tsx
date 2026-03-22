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
import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME } from '../types/theme';
import { ThemeDefinition } from '../themes';
import { useColorPicker } from '../hooks/useColorPicker';
import { useThemeEffects } from '../hooks/useThemeEffects';
import { loadInitialConfig, mergeAndMigrate } from './settingsConfigMigration';
import { flushRegistry } from '../hooks/useFlushOnExit';

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
    /** 设置模态窗口开关 */
    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [config, setConfig] = useState<ThemeConfig>(loadInitialConfig);
    const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

    // ── 设置模态窗口状态 ──
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

    // ── 加载主题 ──
    const loadThemes = async () => {
        try {
            const api = window.themeAPI;
            if (api?.loadAll) {
                const res = await api.loadAll();
                if (res?.success) {
                    setAvailableThemes(res.themes);
                }
            }
        } catch (e) {
            console.error('Failed to load themes:', e);
        }
    };

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

    // ── 配置修改函数 ──

    const updateConfig = (updates: Partial<ThemeConfig> | ((prev: ThemeConfig) => ThemeConfig)) => {
        if (typeof updates === 'function') {
            setConfig(prev => ({ ...prev, ...updates(prev) }));
        } else {
            setConfig(prev => ({ ...prev, ...updates }));
        }
    };

    const updateUI = (updates: Partial<ThemeConfig['ui']>) => {
        setConfig(prev => ({ ...prev, ui: { ...prev.ui, ...updates } }));
    };

    const setTheme = (themeId: string) => {
        setConfig(prev => ({ ...prev, theme: themeId }));
    };

    const importConfig = (json: string) => {
        try {
            const parsed = JSON.parse(json);
            setConfig(mergeAndMigrate(parsed));
        } catch (e) {
            console.error('Import failed', e);
        }
    };

    const exportConfig = () => JSON.stringify(config, null, 2);

    const resetConfig = () => {
        setConfig(DEFAULT_THEME);
    };

    return (
        <SettingsContext.Provider value={{
            config,
            availableThemes,
            loadThemes,
            updateConfig,
            updateUI,
            setTheme,
            importConfig,
            exportConfig,
            resetConfig,
            isSettingsOpen,
            openSettings,
            closeSettings,
        }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
