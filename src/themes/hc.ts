import type { ThemeDefinition } from './types';

export const hcTheme: ThemeDefinition = {
    id: 'hc',
    name: 'High Contrast',
    type: 'dark',
    colors: {
        // 基础背景/前景
        '--vscode-bg': '#000000',
        '--vscode-fg': '#ffffff',

        // 侧边栏
        '--vscode-sidebar': '#000000',
        '--vscode-activitybar': '#000000',

        // 状态栏 / 标题栏
        '--vscode-statusbar': '#000000',
        '--vscode-statusbar-debugging': '#cc6633',
        '--vscode-titlebar': '#000000',

        // 面板
        '--vscode-panel': '#000000',

        // 边框
        '--vscode-border': '#ffffff',

        // 输入框
        '--vscode-input-bg': '#000000',
        '--vscode-input-fg': '#ffffff',
        '--vscode-input-border': '#ffffff',
        '--vscode-input-placeholder': '#a6a6a6',

        // 交互状态
        '--vscode-hover': '#1f1f1f',
        '--vscode-selection': '#f38518',
        '--vscode-accent': '#f38518',
        '--vscode-focusBorder': '#f38518',
        '--vscode-list-hover': '#1f1f1f',
        '--vscode-list-active': '#000000',

        // 编辑器
        '--vscode-editor-background': '#000000',

        // 复选框
        '--vscode-checkbox-background': 'transparent',
        '--vscode-checkbox-border': '#ffffff',
        '--vscode-checkbox-foreground': '#ffffff',

        // 设置页面
        '--vscode-settings-header-bg': '#000000',
        '--vscode-settings-row-hover-bg': '#1f1f1f',

        // 滚动条
        '--vscode-scrollbar-shadow': 'transparent',
        '--vscode-scrollbar-slider': '#ffffff',
        '--vscode-scrollbar-slider-hover': '#ffffff',
        '--vscode-scrollbar-slider-active': '#ffffff',

        // 小部件
        '--vscode-editor-widget-bg': '#000000',
        '--vscode-widget-border': '#ffffff',

        // 按钮
        '--vscode-button-bg': 'transparent',
        '--vscode-button-fg': '#ffffff',
        '--vscode-button-hover-bg': 'transparent',
        '--vscode-button-secondary-bg': 'transparent',
        '--vscode-button-secondary-hover-bg': 'transparent',
        '--vscode-textLink-foreground': '#3794ff',

        // Activity Bar
        '--vscode-activitybar-inactive-fg': '#ffffff',

        // 菜单
        '--vscode-menu-bg': '#000000',
        '--vscode-menu-fg': '#ffffff',
        '--vscode-menu-border': '#ffffff',
    },
};
