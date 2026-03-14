/**
 * settingsConfigMigration.ts
 * 设置配置合并与旧版本迁移逻辑。
 * 从 SettingsContext.tsx 中拆分出来。
 */
import { ThemeConfig, DEFAULT_THEME } from '../types/theme';

/**
 * 从持久化存储加载并合并配置，处理旧版本兼容性迁移。
 */
export function loadAndMigrateConfig(): ThemeConfig {
    const saved = localStorage.getItem('tcom-settings');
    let result: ThemeConfig = DEFAULT_THEME;

    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            result = mergeAndMigrate(parsed);
        } catch (e) {
            console.error('Failed to parse settings', e);
        }
    }

    // 同步注入字体变量到 :root，防止首帧渲染出现字体大小闪变
    try {
        const root = document.documentElement;
        root.style.setProperty('--st-font-family', result.typography.fontFamily);
        root.style.setProperty('--st-font-size', `${result.typography.fontSize}px`);
        root.style.setProperty('--st-line-height', `${result.typography.lineHeight}`);
    } catch {
        // SSR 环境中 document 不存在
    }

    return result;
}

/**
 * 深度合并解析后的配置并执行迁移。
 * 同时用于初次加载和导入配置。
 */
export function mergeAndMigrate(parsed: any): ThemeConfig {
    const merged: ThemeConfig = {
        ...DEFAULT_THEME,
        ...parsed,
        typography: { ...DEFAULT_THEME.typography, ...(parsed.typography || {}) },
        ui: { ...DEFAULT_THEME.ui, ...(parsed.ui || {}) },
    };

    // 迁移旧版默认值 13px -> 15px
    if (merged.typography.fontSize === 13) {
        merged.typography.fontSize = 15;
    }
    // 迁移旧版字体名
    if (merged.typography.fontFamily === 'mono' || merged.typography.fontFamily === 'var(--font-mono)') {
        merged.typography.fontFamily = 'AppCoreFont';
    }

    // 兼容旧版 tcom-theme 键
    const legacyTheme = localStorage.getItem('tcom-theme');
    if (legacyTheme) {
        merged.theme = legacyTheme;
    }

    // 每次启动强制默认侧边栏为 'explorer'
    if (merged.ui) {
        merged.ui.activeActivityItem = 'explorer';
    }

    return merged;
}
