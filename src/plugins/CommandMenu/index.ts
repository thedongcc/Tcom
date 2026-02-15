import { Terminal } from 'lucide-react';
import { Plugin } from '../../types/plugin';
import { CommandListSidebar } from '../../components/commands/CommandListSidebar';

export const CommandMenuPlugin: Plugin = {
    id: 'commands',
    name: 'Command Menu',
    version: '1.0.0',
    description: 'Manage and send frequently used serial commands',
    icon: Terminal as any,
    sidebarComponent: CommandListSidebar,
    activate: (context) => {
        console.log('CommandMenu Plugin Activated');
    },
    deactivate: (context) => {
        console.log('CommandMenu Plugin Deactivated');
    }
};
