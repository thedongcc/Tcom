import type { ThemeDefinition } from '../themes';

// ThemeMode 保留为字符串联合类型以兼容现有代码，同时支持自定义主题 id
export type ThemeMode = 'dark' | 'light' | 'hc' | 'one-dark-vivid' | (string & {});

export interface ThemeImages {
    rxBackground?: string; // Data URL 或 URL
}

export interface ThemeTypography {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
}

export interface UIConfig {
    sidebarPosition: 'left' | 'right';
    showStatusBar: boolean;
    activityBarVisible: boolean;
    sideBarVisible: boolean;
    activeActivityItem: string;
}

export interface ThemeConfig {
    theme: string; // 选中的主题文件 id，原来是 ThemeMode，现在放宽为 string
    images: ThemeImages;
    typography: ThemeTypography;
    timestampFormat: string; // 例如 "HH:mm:ss.SSS"
    language: 'zh-CN' | 'en-US';
    ui: UIConfig;
}

export const DEFAULT_THEME: ThemeConfig = {
    theme: 'dark',
    images: {},
    typography: {
        fontFamily: 'AppCoreFont',
        fontSize: 15,
        lineHeight: 1.5
    },
    timestampFormat: 'HH:mm:ss.SSS',
    language: 'zh-CN',
    ui: {
        sidebarPosition: 'left',
        showStatusBar: true,
        activityBarVisible: true,
        sideBarVisible: true,
        activeActivityItem: 'explorer'
    }
};

// 重新导出 ThemeDefinition 方便其他模块使用
export type { ThemeDefinition };
