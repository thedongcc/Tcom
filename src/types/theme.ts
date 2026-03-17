import type { ThemeDefinition } from '../themes';
import { DEFAULT_KEYBINDINGS, type KeybindingAction } from '../utils/keybindings';

// ThemeMode 保留为字符串联合类型以兼容现有代码，同时支持自定义主题 id
export type ThemeMode = 'dark' | 'light' | 'hc' | 'one-dark-vivid' | (string & {});

export interface ThemeImages {
    rxBackground?: string; // tcom-file:///路径 或 https:// URL
    bgSize?: 'cover' | 'contain' | 'auto' | '100% 100%'; // 填充模式
    bgPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top left' | 'top right' | 'bottom left' | 'bottom right'; // 对齐方向
    bgOpacity?: number; // 不透明度 0-100，默认 100
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

/** 快捷键配置 — 每个动作对应一个 `Ctrl+Shift+F` 格式的绑定字符串 */
export type KeybindingsConfig = Record<KeybindingAction, string>;

export interface ThemeConfig {
    theme: string; // 选中的主题文件 id，原来是 ThemeMode，现在放宽为 string
    images: ThemeImages;
    typography: ThemeTypography;
    timestampFormat: string; // 例如 "HH:mm:ss.SSS"
    language: 'zh-CN' | 'en-US';
    ui: UIConfig;
    keybindings: KeybindingsConfig;
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
    },
    keybindings: { ...DEFAULT_KEYBINDINGS },
};

// 重新导出 ThemeDefinition 方便其他模块使用
export type { ThemeDefinition };
