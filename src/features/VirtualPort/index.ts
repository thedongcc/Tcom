/**
 * VirtualPort/index.ts
 * 虚拟串口功能模块 — com0com 驱动管理和虚拟端口对创建。
 */
import { ArrowRightLeft } from 'lucide-react';
import { Feature } from '../../types/module';
import { VirtualPortSidebar } from './VirtualPortSidebar';

const VirtualPortFeature: Feature = {
    id: 'virtual-port',
    name: 'Virtual Port',
    version: '1.0.0',
    description: '虚拟串口管理 / Manage com0com virtual serial port pairs',
    icon: ArrowRightLeft as any,
    sidebarComponent: VirtualPortSidebar as any,
    activate: () => {
// log('[Feature:virtual-port] 虚拟串口已激活');
    },
    deactivate: () => {
// log('[Feature:virtual-port] 虚拟串口已停用');
    },
};

export default VirtualPortFeature;
