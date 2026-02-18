import type { ThemeDefinition } from './types';

export const lightTheme: ThemeDefinition = {
    id: 'light',
    name: 'Visual Studio Light',
    type: 'light',
    colors: {
        // 基础背景/前景
        '--vscode-bg': '#ffffff',
        '--vscode-fg': '#333333',

        // 侧边栏
        '--vscode-sidebar': '#f3f3f3',
        '--vscode-activitybar': '#2c2c2c',

        // 状态栏 / 标题栏
        '--vscode-statusbar': '#e8e8e8',
        '--vscode-statusbar-debugging': '#cc6633',
        '--vscode-titlebar': '#dddddd',

        // 面板
        '--vscode-panel': '#ffffff',

        // 边框
        '--vscode-border': '#e4e4e4',

        // 输入框
        '--vscode-input-bg': '#ffffff',
        '--vscode-input-fg': '#333333',
        '--vscode-input-border': '#cecece',
        '--vscode-input-placeholder': '#a6a6a6',

        // 交互状态
        '--vscode-hover': '#e8e8e8',
        '--vscode-selection': '#add6ff',
        '--vscode-accent': '#007acc',
        '--vscode-focusBorder': '#0090f1',
        '--vscode-list-hover': '#e8e8e8',
        '--vscode-list-active': '#e4e6f1',

        // 编辑器
        '--vscode-editor-background': '#ffffff',

        // 复选框
        '--vscode-checkbox-background': '#007acc',
        '--vscode-checkbox-border': '#007acc',
        '--vscode-checkbox-foreground': '#ffffff',

        // 设置页面
        '--vscode-settings-header-bg': '#f3f3f3',
        '--vscode-settings-row-hover-bg': '#e8e8e8',

        // 滚动条
        '--vscode-scrollbar-shadow': '#dddddd',
        '--vscode-scrollbar-slider': '#64646466',
        '--vscode-scrollbar-slider-hover': '#646464bb',
        '--vscode-scrollbar-slider-active': '#00000099',

        // 小部件
        '--vscode-editor-widget-bg': '#f3f3f3',
        '--vscode-widget-border': '#e4e4e4',

        // 按钮
        '--vscode-button-bg': '#007acc',
        '--vscode-button-fg': '#ffffff',
        '--vscode-button-hover-bg': '#0062a3',
        '--vscode-button-secondary-bg': '#e4e4e4',
        '--vscode-button-secondary-hover-bg': '#d4d4d4',
        '--vscode-textLink-foreground': '#006ab1',

        // Activity Bar（Light 主题保持深色 Activity Bar，与 VSCode 一致）
        '--vscode-activitybar-inactive-fg': '#858585',

        // 菜单
        '--vscode-menu-bg': '#ffffff',
        '--vscode-menu-fg': '#333333',
        '--vscode-menu-border': '#cecece',
    },
};
