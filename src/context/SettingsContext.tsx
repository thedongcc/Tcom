import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { ThemeConfig, DEFAULT_THEME, ThemeMode } from '../types/theme';
import { ThemeDefinition, applyTheme } from '../themes';
import { useColorPicker } from '../hooks/useColorPicker';

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
    const [config, setConfig] = useState<ThemeConfig>(() => {
        const saved = localStorage.getItem('tcom-settings');
        let result: ThemeConfig = DEFAULT_THEME;

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

                result = merged;
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        }

        // 同步注入字体变量到 :root，防止首帧渲染出现字体大小闪变
        // 此处无需等待异步主题加载，直接使用已保存的 typography 配置
        try {
            const root = document.documentElement;
            root.style.setProperty('--st-font-family', result.typography.fontFamily);
            root.style.setProperty('--st-font-size', `${result.typography.fontSize}px`);
            root.style.setProperty('--st-line-height', `${result.typography.lineHeight}`);
        } catch {
            // SSR 环境中 document 不存在，忽略错误
        }

        return result;
    });


    // ── 真实的物理主题文件状态 ──────────────────────────────────────────────────────
    const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);
    // 追踪上次成功应用的主题 id，避免相同主题重复 applyTheme 导致字体重新布局
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

    // 初次挂载加载一次及监听 localStorage 同步跨窗口状态
    useEffect(() => {
        // ⚡ 主题文件延迟加载：首帧已由 useState initializer 注入 CSS 变量，
        //   放到下一个宏任务，让 React 完成首次渲染后再走 IPC 文件读取
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

    // ── 主题 CSS 变量注入 ──────────────────────────────────────────────────────
    useEffect(() => {
        const root = document.documentElement;
        const { typography, images, theme } = config;

        // 1. 应用主题 CSS 变量（仅当主题真正发生变化时才调用 applyTheme，避免触发字体重布局）
        if (availableThemes.length > 0) {
            let activeDef = availableThemes.find(t => t.id === theme);
            if (!activeDef) {
                activeDef = availableThemes.find(t => t.id === 'dark') || availableThemes[0];
            }
            if (activeDef) {
                const themeKey = `${activeDef.id}`;
                if (appliedThemeRef.current !== themeKey) {
                    // 只有主题真正变化时才重新注入所有 CSS 变量
                    applyTheme(activeDef);
                    appliedThemeRef.current = themeKey;
                }
            }
        }

        // 3. 应用排版变量（仅在值实际变化时才设置，减少无谓的样式重计算）
        const curFontFamily = root.style.getPropertyValue('--st-font-family');
        const curLineHeight = root.style.getPropertyValue('--st-line-height');
        if (curFontFamily !== typography.fontFamily) {
            root.style.setProperty('--st-font-family', typography.fontFamily);
        }
        if (curLineHeight !== `${typography.lineHeight}`) {
            root.style.setProperty('--st-line-height', `${typography.lineHeight}`);
        }

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

    // ── 主题编辑器拾取器 + 预览同步（委托给独立 Hook） ──────────────────
    useColorPicker({ availableThemes, config });

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
