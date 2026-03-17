/**
 * SettingsContext.tsx
 * 全局设置 Context — 配置状态管理、主题列表加载、配置 CRUD。
 *
 * 副效应委托：
 * - useThemeEffects — 主题/排版/背景图的 DOM 副效应
 * - useColorPicker — 拾取器 + 预览同步
 *
 * 子模块：
 * - settingsConfigMigration.ts — 配置合并与旧版本迁移
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME } from '../types/theme';
import { ThemeDefinition } from '../themes';
import { useColorPicker } from '../hooks/useColorPicker';
import { useThemeEffects } from '../hooks/useThemeEffects';
import { loadAndMigrateConfig, mergeAndMigrate } from './settingsConfigMigration';

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

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [config, setConfig] = useState<ThemeConfig>(loadAndMigrateConfig);
    const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);

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

    // 初次挂载 + 跨窗口同步
    useEffect(() => {
        // ⚡ 使用 queueMicrotask 代替 setTimeout(0) 以更快触发主题加载
        let cancelled = false;
        queueMicrotask(() => { if (!cancelled) loadThemes(); });

        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'tcom-settings' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    setConfig(prev => ({ ...prev, ...parsed }));
                } catch (err) {
                    console.error('Cross-window sync failed for settings', err);
                }
            } else if (e.key === 'tcom-theme' && e.newValue) {
                setConfig(prev => ({ ...prev, theme: e.newValue! }));
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => {
            cancelled = true;
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

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
