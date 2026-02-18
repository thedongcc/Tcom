import type { ThemeDefinition } from './types';

export const oneDarkVividTheme: ThemeDefinition = {
    id: 'one-dark-vivid',
    name: 'One Dark Vivid',
    type: 'dark',
    colors: {
        // 基础背景/前景
        '--vscode-bg': '#282c34',
        '--vscode-fg': '#abb2bf',

        // 侧边栏
        '--vscode-sidebar': '#21252b',
        '--vscode-activitybar': '#21252b',

        // 状态栏 / 标题栏
        '--vscode-statusbar': '#21252b',
        '--vscode-statusbar-debugging': '#cc6633',
        '--vscode-titlebar': '#21252b',

        // 面板
        '--vscode-panel': '#282c34',

        // 边框
        '--vscode-border': '#181a1f',

        // 输入框
        '--vscode-input-bg': '#282c34',
        '--vscode-input-fg': '#abb2bf',
        '--vscode-input-border': '#3e4451',
        '--vscode-input-placeholder': '#5c6370',

        // 交互状态
        '--vscode-hover': '#2c313a',
        '--vscode-selection': '#3e4451',
        '--vscode-accent': '#61afef',
        '--vscode-focusBorder': '#61afef',
        '--vscode-list-hover': '#2c313a',
        '--vscode-list-active': '#2c313a',

        // 编辑器
        '--vscode-editor-background': '#282c34',

        // 复选框
        '--vscode-checkbox-background': '#61afef',
        '--vscode-checkbox-border': '#61afef',
        '--vscode-checkbox-foreground': '#282c34',

        // 设置页面
        '--vscode-settings-header-bg': '#21252b',
        '--vscode-settings-row-hover-bg': '#2c313a',

        // 滚动条
        '--vscode-scrollbar-shadow': '#000000',
        '--vscode-scrollbar-slider': '#4e566680',
        '--vscode-scrollbar-slider-hover': '#5a6375aa',
        '--vscode-scrollbar-slider-active': '#747d9180',

        // 小部件
        '--vscode-editor-widget-bg': '#21252b',
        '--vscode-widget-border': '#181a1f',

        // 按钮
        '--vscode-button-bg': '#61afef',
        '--vscode-button-fg': '#282c34',
        '--vscode-button-hover-bg': '#528bff',
        '--vscode-button-secondary-bg': '#3e4451',
        '--vscode-button-secondary-hover-bg': '#4b5263',
        '--vscode-textLink-foreground': '#61afef',

        // Activity Bar
        '--vscode-activitybar-inactive-fg': '#5c6370',

        // 菜单
        '--vscode-menu-bg': '#282c34',
        '--vscode-menu-fg': '#abb2bf',
        '--vscode-menu-border': '#181a1f',
    },
};
