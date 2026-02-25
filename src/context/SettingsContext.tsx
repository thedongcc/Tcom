import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME, ThemeMode } from '../types/theme';
import { ThemeDefinition, applyTheme } from '../themes';

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
    // 设置状态
    const [config, setConfig] = useState<ThemeConfig>(() => {
        const saved = localStorage.getItem('tcom-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                // 深度合并默认值以确保新字段存在
                const merged: ThemeConfig = {
                    ...DEFAULT_THEME,
                    ...parsed,
                    typography: { ...DEFAULT_THEME.typography, ...(parsed.typography || {}) },
                    ui: { ...DEFAULT_THEME.ui, ...(parsed.ui || {}) },
                };

                // 迁移旧版默认值 13px -> 15px，mono -> AppCoreFont
                if (merged.typography.fontSize === 13) {
                    merged.typography.fontSize = 15;
                }
                if (merged.typography.fontFamily === 'mono' || merged.typography.fontFamily === 'var(--font-mono)') {
                    merged.typography.fontFamily = 'AppCoreFont';
                }

                // 兼容旧版 tcom-theme 键
                const legacyTheme = localStorage.getItem('tcom-theme');
                if (legacyTheme) {
                    merged.theme = legacyTheme;
                }

                // Force default sidebar to 'explorer' (Sessions) on every startup
                if (merged.ui) {
                    merged.ui.activeActivityItem = 'explorer';
                }

                return merged;
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        }
        return DEFAULT_THEME;
    });

    // ── 真实的物理主题文件状态 ──────────────────────────────────────────────────────
    const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);

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

    // 初次挂载加载一次
    useEffect(() => {
        loadThemes();
    }, []);

    // ── 主题 CSS 变量注入 ──────────────────────────────────────────────────────
    useEffect(() => {
        const root = document.documentElement;
        const { typography, images, theme } = config;

        // 1. 应用主题 CSS 变量（从现有加载出的主题列表里找）
        if (availableThemes.length > 0) {
            let activeDef = availableThemes.find(t => t.id === theme);
            if (!activeDef) {
                // 如果找不到（比如用户删掉了 json），强制回退系统里一定会生成的一个 default dark
                activeDef = availableThemes.find(t => t.id === 'dark') || availableThemes[0];
            }
            if (activeDef) {
                applyTheme(activeDef);
            }
        }

        // 3. 应用排版变量
        root.style.setProperty('--st-font-family', typography.fontFamily);
        root.style.setProperty('--st-line-height', `${typography.lineHeight}`);

        // 4. 应用背景图片
        if (images.rxBackground) {
            root.style.setProperty('--st-rx-bg-img', `url(${images.rxBackground})`);
        } else {
            root.style.removeProperty('--st-rx-bg-img');
        }

        // 5. 提取用于更新窗口原生按钮的色彩
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

        // 6. 持久化
        localStorage.setItem('tcom-settings', JSON.stringify(config));
        localStorage.setItem('tcom-theme', theme);

    }, [config, availableThemes]); // availableThemes 加载完后也需要触发注入

    // ── 更新函数 ──────────────────────────────────────────────────────────────

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
            const merged = {
                ...DEFAULT_THEME,
                ...parsed,
                typography: { ...DEFAULT_THEME.typography, ...(parsed.typography || {}) },
                ui: { ...DEFAULT_THEME.ui, ...(parsed.ui || {}) },
            };
            // 迁移旧版默认值
            if (merged.typography.fontSize === 13) {
                merged.typography.fontSize = 15;
            }
            if (merged.typography.fontFamily === 'mono' || merged.typography.fontFamily === 'var(--font-mono)') {
                merged.typography.fontFamily = 'AppCoreFont';
            }
            setConfig(merged);
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
