import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME, ThemeMode } from '../types/theme';
import { ThemeDefinition, applyTheme, findTheme, importTheme as parseTheme } from '../themes';

interface SettingsContextType {
    config: ThemeConfig;
    updateConfig: (updates: Partial<ThemeConfig> | ((prev: ThemeConfig) => ThemeConfig)) => void;
    updateColors: (updates: Partial<ThemeConfig['colors']>) => void;
    updateUI: (updates: Partial<ThemeConfig['ui']>) => void;
    setTheme: (themeId: ThemeMode) => void;
    /** 添加或替换一个自定义主题 */
    addCustomTheme: (theme: ThemeDefinition) => void;
    /** 删除自定义主题 */
    removeCustomTheme: (themeId: string) => void;
    importConfig: (json: string) => void;
    exportConfig: () => string;
    resetConfig: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [config, setConfig] = useState<ThemeConfig>(() => {
        const saved = localStorage.getItem('tcom-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                // 深度合并默认值以确保新字段存在
                const merged: ThemeConfig = {
                    ...DEFAULT_THEME,
                    ...parsed,
                    colors: { ...DEFAULT_THEME.colors, ...(parsed.colors || {}) },
                    typography: { ...DEFAULT_THEME.typography, ...(parsed.typography || {}) },
                    ui: { ...DEFAULT_THEME.ui, ...(parsed.ui || {}) },
                    customThemes: Array.isArray(parsed.customThemes) ? parsed.customThemes : [],
                };

                // 兼容旧版 tcom-theme 键
                const legacyTheme = localStorage.getItem('tcom-theme');
                if (legacyTheme && ['light', 'hc', 'dark', 'one-dark-vivid'].includes(legacyTheme)) {
                    merged.theme = legacyTheme as ThemeMode;
                }

                return merged;
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        }
        return DEFAULT_THEME;
    });

    // ── 主题 CSS 变量注入 ──────────────────────────────────────────────────────
    useEffect(() => {
        const root = document.documentElement;
        const { colors, typography, images, theme, customThemes } = config;

        // 1. 应用主题 CSS 变量（覆盖所有 --vscode-* 变量）
        const themeDefinition = findTheme(theme, customThemes);
        applyTheme(themeDefinition);

        // 2. 应用用户自定义颜色变量（串口日志颜色等）
        root.style.setProperty('--st-rx-text', colors.rxTextColor);
        root.style.setProperty('--st-tx-text', colors.txTextColor);
        root.style.setProperty('--st-rx-label', colors.rxLabelColor);
        root.style.setProperty('--st-tx-label', colors.txLabelColor);
        root.style.setProperty('--st-info-text', colors.infoColor);
        root.style.setProperty('--st-error-text', colors.errorColor);
        root.style.setProperty('--st-timestamp', colors.timestampColor);
        root.style.setProperty('--st-rx-bg', colors.rxBgColor);
        root.style.setProperty('--st-input-bg', colors.inputBgColor);
        root.style.setProperty('--st-input-text', colors.inputTextColor);
        root.style.setProperty('--st-token-crc', colors.crcTokenColor);
        root.style.setProperty('--st-token-flag', colors.flagTokenColor);
        root.style.setProperty('--st-accent', colors.accentColor);

        // 3. 应用排版变量
        root.style.setProperty('--st-font-family', typography.fontFamily);
        root.style.setProperty('--st-font-size', `${typography.fontSize}px`);
        root.style.setProperty('--st-line-height', `${typography.lineHeight}`);

        // 4. 应用背景图片
        if (images.rxBackground) {
            root.style.setProperty('--st-rx-bg-img', `url(${images.rxBackground})`);
        } else {
            root.style.removeProperty('--st-rx-bg-img');
        }

        // 5. 持久化
        localStorage.setItem('tcom-settings', JSON.stringify(config));
        localStorage.setItem('tcom-theme', theme);

    }, [config]);

    // ── 更新函数 ──────────────────────────────────────────────────────────────

    const updateConfig = (updates: Partial<ThemeConfig> | ((prev: ThemeConfig) => ThemeConfig)) => {
        if (typeof updates === 'function') {
            setConfig(prev => ({ ...prev, ...updates(prev) }));
        } else {
            setConfig(prev => ({ ...prev, ...updates }));
        }
    };

    const updateColors = (updates: Partial<ThemeConfig['colors']>) => {
        setConfig(prev => ({ ...prev, colors: { ...prev.colors, ...updates } }));
    };

    const updateUI = (updates: Partial<ThemeConfig['ui']>) => {
        setConfig(prev => ({ ...prev, ui: { ...prev.ui, ...updates } }));
    };

    const setTheme = (themeId: ThemeMode) => {
        setConfig(prev => ({ ...prev, theme: themeId }));
    };

    const addCustomTheme = (theme: ThemeDefinition) => {
        setConfig(prev => {
            const existing = prev.customThemes.filter(t => t.id !== theme.id);
            return { ...prev, customThemes: [...existing, theme] };
        });
    };

    const removeCustomTheme = (themeId: string) => {
        setConfig(prev => ({
            ...prev,
            customThemes: prev.customThemes.filter(t => t.id !== themeId),
            // 如果当前正在使用被删除的主题，回退到 dark
            theme: prev.theme === themeId ? 'dark' : prev.theme,
        }));
    };

    const importConfig = (json: string) => {
        try {
            const parsed = JSON.parse(json);
            setConfig({
                ...DEFAULT_THEME,
                ...parsed,
                colors: { ...DEFAULT_THEME.colors, ...(parsed.colors || {}) },
                ui: { ...DEFAULT_THEME.ui, ...(parsed.ui || {}) },
                customThemes: Array.isArray(parsed.customThemes) ? parsed.customThemes : [],
            });
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
            updateConfig,
            updateColors,
            updateUI,
            setTheme,
            addCustomTheme,
            removeCustomTheme,
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
