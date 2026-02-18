import { darkTheme } from './dark';
import { lightTheme } from './light';
import { hcTheme } from './hc';
import { oneDarkVividTheme } from './one-dark-vivid';

export type { ThemeDefinition } from './types';
import type { ThemeDefinition } from './types';

/** 内置主题注册表（有序） */
export const BUILT_IN_THEMES: ThemeDefinition[] = [
    darkTheme,
    lightTheme,
    hcTheme,
    oneDarkVividTheme,
];

/** 内置主题 id 集合，用于区分内置和自定义 */
export const BUILT_IN_THEME_IDS = new Set(BUILT_IN_THEMES.map(t => t.id));

/**
 * 将主题的所有 CSS 变量注入到 :root
 * 同时清除上一个主题残留的变量（通过 data-theme 属性追踪）
 */
export function applyTheme(theme: ThemeDefinition): void {
    const root = document.documentElement;

    // 注入所有 CSS 变量
    Object.entries(theme.colors).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });

    // 标记当前主题 id，方便调试
    root.setAttribute('data-theme', theme.id);

    // 同步 body class（保留兼容性，某些组件可能依赖 .theme-light 等）
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-hc', 'theme-one-dark-vivid');
    if (theme.id !== 'dark') {
        document.body.classList.add(`theme-${theme.id}`);
    }
}

/**
 * 根据 id 查找主题（先找内置，再找自定义）
 */
export function findTheme(id: string, customThemes: ThemeDefinition[] = []): ThemeDefinition {
    return (
        BUILT_IN_THEMES.find(t => t.id === id) ??
        customThemes.find(t => t.id === id) ??
        darkTheme // 找不到时回退到 Dark
    );
}

/**
 * 将主题定义序列化为 JSON 字符串（用于导出）
 */
export function exportTheme(theme: ThemeDefinition): string {
    return JSON.stringify(theme, null, 2);
}

/**
 * 从 JSON 字符串解析主题定义（用于导入）
 * 返回 null 表示格式无效
 */
export function importTheme(json: string): ThemeDefinition | null {
    try {
        const parsed = JSON.parse(json);
        if (
            typeof parsed.id === 'string' &&
            typeof parsed.name === 'string' &&
            typeof parsed.colors === 'object' &&
            parsed.colors !== null
        ) {
            return {
                id: parsed.id,
                name: parsed.name,
                type: parsed.type === 'light' ? 'light' : 'dark',
                colors: parsed.colors,
            };
        }
    } catch {
        // JSON 解析失败
    }
    return null;
}
