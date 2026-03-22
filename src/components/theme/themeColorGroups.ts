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
        label: '✨ 系统级核心语义色 (全局生效)',
        components: ['sys-colors']
    },
    {
        id: 'global-variables',
        label: '基础全局与基座',
        components: ['global-common', 'global-components', 'global-scrollbar', 'st-status-indicators', 'custom-select']
    },
    {
        id: 'layout',
        label: '全局与布局',
        components: ['titlebar', 'activitybar', 'sidebar', 'editor-area', 'editor-tabs', 'statusbar']
    },
    {
        id: 'sidebar-menus',
        label: '侧边栏及菜单',
        components: ['session-list-sidebar', 'session-list-item', 'command-sidebar', 'module-manager-sidebar']
    },
    {
        id: 'serial-tabs',
        label: '串口与终端模块',
        components: ['serial-monitor', 'serial-input', 'serial-config', 'monitor-terminal', 'virtual-port-plugin', 'st-connection-control']
    },
    {
        id: 'mqtt-tabs',
        label: 'MQTT 与配置模块',
        components: ['mqtt-monitor', 'mqtt-config']
    },
    {
        id: 'messaging',
        label: '消息气泡与通讯',
        components: ['monitor-bubble', 'system-message', 'log-search']
    },
    {
        id: 'popups',
        label: '弹出与对话框',
        components: ['context-menu', 'dialog', 'tooltip', 'toast']
    },
    {
        id: 'settings-tools',
        label: '⚙设置与高级工具',
        components: ['settings-editor', 'graph-editor']
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
