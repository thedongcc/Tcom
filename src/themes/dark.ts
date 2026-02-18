import type { ThemeDefinition } from './types';

export const darkTheme: ThemeDefinition = {
    id: 'dark',
    name: 'Visual Studio Dark',
    type: 'dark',
    colors: {
        // 基础背景/前景
        '--vscode-bg': '#1e1e1e',
        '--vscode-fg': '#cccccc',

        // 侧边栏
        '--vscode-sidebar': '#252526',
        '--vscode-activitybar': '#333333',

        // 状态栏 / 标题栏
        '--vscode-statusbar': '#252526',
        '--vscode-statusbar-debugging': '#cc6633',
        '--vscode-titlebar': '#3c3c3c',

        // 面板
        '--vscode-panel': '#1e1e1e',

        // 边框
        '--vscode-border': '#2b2b2b',

        // 输入框
        '--vscode-input-bg': '#3c3c3c',
        '--vscode-input-fg': '#cccccc',
        '--vscode-input-border': '#3c3c3c',
        '--vscode-input-placeholder': '#a6a6a6',

        // 交互状态
        '--vscode-hover': '#2a2d2e',
        '--vscode-selection': '#094771',
        '--vscode-accent': '#007acc',
        '--vscode-focusBorder': '#007acc',
        '--vscode-list-hover': '#2a2d2e',
        '--vscode-list-active': '#37373d',

        // 编辑器
        '--vscode-editor-background': '#1e1e1e',

        // 复选框
        '--vscode-checkbox-background': '#007acc',
        '--vscode-checkbox-border': '#007acc',
        '--vscode-checkbox-foreground': '#ffffff',

        // 设置页面
        '--vscode-settings-header-bg': '#252526',
        '--vscode-settings-row-hover-bg': '#2a2d2e',

        // 滚动条
        '--vscode-scrollbar-shadow': '#000000',
        '--vscode-scrollbar-slider': '#79797966',
        '--vscode-scrollbar-slider-hover': '#646464bb',
        '--vscode-scrollbar-slider-active': '#bfbfbf66',

        // 小部件
        '--vscode-editor-widget-bg': '#252526',
        '--vscode-widget-border': '#454545',

        // 按钮
        '--vscode-button-bg': '#0e639c',
        '--vscode-button-fg': '#ffffff',
        '--vscode-button-hover-bg': '#1177bb',
        '--vscode-button-secondary-bg': '#3c3c3c',
        '--vscode-button-secondary-hover-bg': '#4a4a4a',
        '--vscode-textLink-foreground': '#3794ff',

        // Activity Bar
        '--vscode-activitybar-inactive-fg': '#858585',

        // 菜单
        '--vscode-menu-bg': '#252526',
        '--vscode-menu-fg': '#cccccc',
        '--vscode-menu-border': '#454545',
    },
};
