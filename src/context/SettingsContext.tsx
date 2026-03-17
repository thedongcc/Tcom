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
    const prevBgImageRef = useRef(false);

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

        // 背景图片：覆盖所有背景色变量
        const bgOverrideVars = [
            // 核心布局
            '--app-background', '--sidebar-background', '--activitybar-background',
            '--statusbar-background', '--titlebar-background', '--panel-background',
            '--editor-background', '--widget-background', '--settings-header-background',
            // 编辑器/标签栏
            '--editor-area-bg', '--editor-area-tabs-bg', '--st-editor-tabs-bg',
            '--st-tab-active-bg', '--st-tab-inactive-bg',
            // 设置
            '--settings-editor-bg', '--settings-editor-toolbar-bg',
            // 监视区
            '--monitor-terminal-bg', '--st-monitor-toolbar-bg', '--st-monitor-log-bg',
            '--st-monitor-rx-bg',
            // 发送区
            '--st-sendarea-bg', '--st-sendarea-toolbar-bg',
            // 侧边栏面板
            '--session-list-sidebar-bg', '--session-list-sidebar-header-bg',
            '--command-sidebar-bg', '--module-manager-bg', '--serial-config-bg',
            '--st-sidebar-panel-bg', '--st-config-item-bg',
            // MQTT
            '--st-mqtt-toolbar-bg', '--mqtt-config-bg', '--st-mqtt-monitor-bg',
            // 虚拟串口
            '--monitor-terminal-toolbar-bg',
            // 搜索/工具栏
            '--log-search-bg', '--st-logsearch-bg', '--log-search-input-bg',
            '--st-toolbar-bg', '--serial-input-toolbar-bg',
            // 输入框/下拉框
            '--input-background', '--st-input-bg',
            '--mqtt-config-input-bg',
        ];
        const hasBgImage = !!images.rxBackground;
        const prevHadBgImage = prevBgImageRef.current;
        prevBgImageRef.current = hasBgImage;

        if (hasBgImage) {
            // 全局背景图模式：不设置 --st-rx-bg-img（避免监视区重复叠图）
            root.style.removeProperty('--st-rx-bg-img');
            root.setAttribute('data-bg-image', 'true');
            // 内联覆盖所有背景色变量为 transparent（优先级高于 applyTheme）
            for (const v of bgOverrideVars) {
                root.style.setProperty(v, 'transparent');
            }
            // 将背景图片渲染到 body 上
            document.body.style.backgroundImage = `url(${images.rxBackground})`;
            document.body.style.backgroundSize = images.bgSize || 'cover';
            document.body.style.backgroundPosition = images.bgPosition || 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.opacity = `${(images.bgOpacity ?? 100) / 100}`;
        } else if (prevHadBgImage) {
            // 从「有背景图→无背景图」：清理覆盖并立即恢复主题
            root.style.removeProperty('--st-rx-bg-img');
            root.removeAttribute('data-bg-image');
            for (const v of bgOverrideVars) {
                root.style.removeProperty(v);
            }
            // 清除 body 背景图样式
            document.body.style.backgroundImage = '';
            document.body.style.backgroundSize = '';
            document.body.style.backgroundPosition = '';
            document.body.style.backgroundRepeat = '';
            document.body.style.backgroundAttachment = '';
            document.body.style.opacity = '';
            // 立即重新应用主题恢复颜色（不等下次渲染）
            const activeDef = availableThemes.find(t => t.id === theme)
                || availableThemes.find(t => t.id === 'dark')
                || availableThemes[0];
            if (activeDef) {
                applyTheme(activeDef);
                appliedThemeRef.current = activeDef.id;
            }
        }

        // 窗口原生按钮色彩
        setTimeout(() => {
            try {
                const computed = getComputedStyle(root);
                // 背景图启用时用半透明色，否则用主题色
                const bgColor = images.rxBackground
                    ? '#00000001'
                    : (computed.getPropertyValue('--titlebar-background').trim() || '#3c3c3c');
                const symbolColor = computed.getPropertyValue('--app-foreground').trim() || '#cccccc';
                if (window.themeAPI?.updateTitleBar) {
                    window.themeAPI.updateTitleBar({ bgColor, symbolColor });
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
