import type { ThemeDefinition } from '../themes';

// ThemeMode 保留为字符串联合类型以兼容现有代码，同时支持自定义主题 id
export type ThemeMode = 'dark' | 'light' | 'hc' | 'one-dark-vivid' | (string & {});

export interface ThemeColors {
    // 日志区域
    rxTextColor: string;
    txTextColor: string;
    rxLabelColor: string;
    txLabelColor: string;
    infoColor: string;
    errorColor: string;
    timestampColor: string;
    rxBgColor: string;

    // 输入区域
    inputBgColor: string;
    inputTextColor: string;

    // 令牌标记
    crcTokenColor: string;
    flagTokenColor: string;

    // 全局/强调
    accentColor: string;
}

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
    theme: ThemeMode;
    /** 用户自定义主题列表 */
    customThemes: ThemeDefinition[];
    colors: ThemeColors;
    images: ThemeImages;
    typography: ThemeTypography;
    timestampFormat: string; // 例如 "HH:mm:ss.SSS"
    language: 'zh-CN' | 'en-US';
    ui: UIConfig;
}

export const DEFAULT_THEME: ThemeConfig = {
    theme: 'dark',
    customThemes: [],
    colors: {
        rxTextColor: '#cccccc',
        txTextColor: '#ce9178',
        rxLabelColor: '#6a9955',
        txLabelColor: '#d16969',
        infoColor: '#9cdcfe',
        errorColor: '#f48771',
        timestampColor: '#569cd6',
        rxBgColor: '#1e1e1e',
        inputBgColor: '#1e1e1e',
        inputTextColor: '#d4d4d4',
        crcTokenColor: '#4ec9b0',
        flagTokenColor: '#c586c0',
        accentColor: '#007acc'
    },
    images: {},
    typography: {
        fontFamily: 'AppCoreFont',
        fontSize: 13,
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
