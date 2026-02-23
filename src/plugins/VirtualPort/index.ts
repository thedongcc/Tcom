import { ArrowRightLeft } from 'lucide-react';
import { Plugin } from '../../types/plugin';
import { VirtualPortSidebar } from './VirtualPortSidebar';

export const VirtualPortPlugin: Plugin = {
    id: 'virtual-port',
    name: 'Virtual Port',
    version: '1.0.0',
    description: '虚拟串口管理 / Manage com0com virtual serial port pairs',
    icon: ArrowRightLeft as any,
    sidebarComponent: VirtualPortSidebar,
    activate: (context) => {
        console.log('VirtualPort Plugin Activated');
    },
    deactivate: (context) => {
        console.log('VirtualPort Plugin Deactivated');
    }
};
