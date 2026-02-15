import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME } from '../types/theme';

interface SettingsContextType {
    config: ThemeConfig;
    updateConfig: (updates: Partial<ThemeConfig> | ((prev: ThemeConfig) => ThemeConfig)) => void;
    updateColors: (updates: Partial<ThemeConfig['colors']>) => void;
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
                return { ...DEFAULT_THEME, ...JSON.parse(saved) };
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
        return DEFAULT_THEME;
    });

    // CSS Variable Injection
    useEffect(() => {
        const root = document.documentElement;
        const { colors, typography, images } = config;

        // Apply Colors
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

        // Apply Typography
        root.style.setProperty('--st-font-family', typography.fontFamily);
        root.style.setProperty('--st-font-size', `${typography.fontSize}px`);
        root.style.setProperty('--st-line-height', `${typography.lineHeight}`);

        // Apply Images
        if (images.rxBackground) {
            root.style.setProperty('--st-rx-bg-img', `url(${images.rxBackground})`);
        } else {
            root.style.removeProperty('--st-rx-bg-img');
        }

        // Persist
        localStorage.setItem('tcom-settings', JSON.stringify(config));

    }, [config]);

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

    const importConfig = (json: string) => {
        try {
            const parsed = JSON.parse(json);
            // Validate?
            setConfig({ ...DEFAULT_THEME, ...parsed });
        } catch (e) {
            console.error("Import failed", e);
        }
    };

    const exportConfig = () => JSON.stringify(config, null, 2);

    const resetConfig = () => setConfig(DEFAULT_THEME);

    return (
        <SettingsContext.Provider value={{ config, updateConfig, updateColors, importConfig, exportConfig, resetConfig }}>
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
