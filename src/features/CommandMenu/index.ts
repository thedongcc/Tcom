/**
 * CommandMenu/index.ts
 * 命令菜单功能模块 — 管理和发送常用串口命令。
 */
import { Terminal } from 'lucide-react';
import { Feature } from '../../types/module';
import { CommandListSidebar } from '../../components/commands/CommandListSidebar';

const CommandMenuFeature: Feature = {
    id: 'commands',
    name: 'Command Menu',
    version: '1.0.0',
    description: '管理和发送常用串口命令',
    icon: Terminal as any,
    sidebarComponent: CommandListSidebar,
    activate: () => {
        console.log('[Feature:commands] 命令菜单已激活');
    },
    deactivate: () => {
        console.log('[Feature:commands] 命令菜单已停用');
    },
};

export default CommandMenuFeature;
