/**
 * themeColorGroups.ts
 * 主题颜色编辑器的分组常量和工具函数。
 * 从 ThemeColorEditor.tsx 中拆分出来。
 */
import { componentTokenMap } from '../../themes/componentTokenMap';

// 定义分组及其包含的组件 ID
export const REGION_GROUPS = [
    {
        id: 'semantic-sys',
        label: '系统语义色',
        labelEn: '✨ System Semantic Colors (Global)',
        components: ['sys-colors']
    },
    {
        id: 'global-variables',
        label: '全局基础',
        labelEn: 'Global Basics & Controls',
        components: ['button', 'global-components', 'global-scrollbar', 'st-status-indicators', 'custom-select', 'list-select', 'danger-colors']
    },
    {
        id: 'layout',
        label: '布局框架',
        labelEn: 'Layout',
        components: ['titlebar', 'activitybar', 'sidebar', 'editor-area', 'editor-tabs', 'statusbar']
    },
    {
        id: 'sidebar-menus',
        label: '侧边栏与菜单',
        labelEn: 'Sidebars & Menus',
        components: ['session-list-sidebar', 'session-list-item', 'command-sidebar', 'module-manager-sidebar', 'menu']
    },
    {
        id: 'serial-tabs',
        label: '串口与终端模块',
        labelEn: 'Serial & Terminal',
        components: ['serial-monitor', 'serial-input', 'serial-config', 'monitor-terminal', 'terminal-monitor', 'virtual-port-plugin', 'st-connection-control']
    },
    {
        id: 'mqtt-tabs',
        label: 'MQTT与配置',
        labelEn: 'MQTT & Config',
        components: ['mqtt-monitor', 'mqtt-config']
    },
    {
        id: 'messaging',
        label: '消息与通讯',
        labelEn: 'Messages & Communication',
        components: ['monitor-bubble', 'system-message', 'log-search']
    },
    {
        id: 'popups',
        label: '弹窗与对话框',
        labelEn: 'Popups & Dialogs',
        components: ['context-menu', 'dialog', 'tooltip', 'toast']
    },
    {
        id: 'settings-tools',
        label: '设置与工具',
        labelEn: '⚙ Settings & Tools',
        components: ['settings-editor', 'update-panel']
    },
    {
        id: 'data-colors',
        label: '数据着色',
        labelEn: 'Data Colors & Highlight',
        components: ['token-colors', 'json-highlight']
    }
];

// 根据 compKey 找到它所在的 groupId
export function findGroupForComp(compKey: string): string | null {
    for (const group of REGION_GROUPS) {
        if (group.components.includes(compKey)) return group.id;
    }
    return null;
}

// 根据 compKey 找到该组件下的第一个 token varName
export function findFirstTokenOfComp(compKey: string): string | null {
    const meta = componentTokenMap[compKey];
    if (!meta || meta.tokens.length === 0) return null;
    return meta.tokens[0].var;
}
