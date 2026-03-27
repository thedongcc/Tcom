/**
 * settingsConfigMigration.ts
 * 设置配置合并与旧版本迁移逻辑。
 * 从 SettingsContext.tsx 中拆分出来。
 */
import { ThemeConfig, DEFAULT_THEME } from '../types/theme';

/**
 * 从持久化存储加载配置的初始值。
 * 注意：实际的异步加载在 SettingsContext 中完成。
 * 这里仅提供 DEFAULT_THEME 并注入字体变量防止首帧闪变。
 */
export function loadInitialConfig(): ThemeConfig {
    let result: ThemeConfig = DEFAULT_THEME;

    // 尝试从 localStorage 快速读取字体配置（防止首帧字体闪变）
    // 正式数据由 globalSettingsAPI 异步加载后覆盖
    try {
        const saved = localStorage.getItem('tcom-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.typography) {
                result = { ...result, typography: { ...result.typography, ...parsed.typography } };
            }
        }
    } catch { /* 忽略 */ }

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
 * 同时用于从文件加载和导入配置。
 */
export function mergeAndMigrate(parsed: Partial<ThemeConfig> & Record<string, unknown>): ThemeConfig {
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


    return merged;
}
