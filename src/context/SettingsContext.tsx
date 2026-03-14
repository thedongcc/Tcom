/**
 * SettingsContext.tsx
 * 全局设置 Context — 主题管理、排版设置、UI 配置。
 *
 * 子模块：
 * - settingsConfigMigration.ts — 配置合并与旧版本迁移
 */
import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME } from '../types/theme';
import { ThemeDefinition, applyTheme } from '../themes';
import { useColorPicker } from '../hooks/useColorPicker';
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

    // ── 主题文件状态 ──
    const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);
    const appliedThemeRef = useRef<string | null>(null);

    const loadThemes = async () => {
        try {
            const api = (window as any).themeAPI;
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

    // 初次挂载加载及跨窗口同步
    useEffect(() => {
        const themeLoadTimer = setTimeout(loadThemes, 0);

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
            clearTimeout(themeLoadTimer);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    // ── 主题 CSS 变量注入 ──
    useEffect(() => {
        const root = document.documentElement;
        const { typography, images, theme } = config;

        // 应用主题 CSS 变量
        if (availableThemes.length > 0) {
            let activeDef = availableThemes.find(t => t.id === theme);
            if (!activeDef) {
                activeDef = availableThemes.find(t => t.id === 'dark') || availableThemes[0];
            }
            if (activeDef) {
                const themeKey = `${activeDef.id}`;
                if (appliedThemeRef.current !== themeKey) {
                    applyTheme(activeDef);
                    appliedThemeRef.current = themeKey;
                }
            }
        }

        // 排版变量
        const curFontFamily = root.style.getPropertyValue('--st-font-family');
        const curLineHeight = root.style.getPropertyValue('--st-line-height');
        if (curFontFamily !== typography.fontFamily) {
            root.style.setProperty('--st-font-family', typography.fontFamily);
        }
        if (curLineHeight !== `${typography.lineHeight}`) {
            root.style.setProperty('--st-line-height', `${typography.lineHeight}`);
        }

        // 背景图片
        if (images.rxBackground) {
            root.style.setProperty('--st-rx-bg-img', `url(${images.rxBackground})`);
        } else {
            root.style.removeProperty('--st-rx-bg-img');
        }

        // 窗口原生按钮色彩
        setTimeout(() => {
            try {
                const computed = getComputedStyle(root);
                const bgColor = computed.getPropertyValue('--titlebar-background').trim() || '#3c3c3c';
                const symbolColor = computed.getPropertyValue('--app-foreground').trim() || '#cccccc';
                if ((window as any).themeAPI?.updateTitleBar) {
                    (window as any).themeAPI.updateTitleBar({ bgColor, symbolColor });
                }
            } catch (e) {
                console.warn('Failed to update native titleBar color', e);
            }
        }, 50);

        // 持久化
        localStorage.setItem('tcom-settings', JSON.stringify(config));
        localStorage.setItem('tcom-theme', theme);

    }, [config, availableThemes]);

    // ── 拾取器 + 预览同步 ──
    useColorPicker({ availableThemes, config });

    // ── 更新函数 ──

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
