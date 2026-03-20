/**
 * registry.ts
 * 功能模块注册表 — 定义所有可用模块的元数据和懒加载策略。
 */
import { Terminal, ArrowRightLeft, Reply } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Feature } from '../types/module';

/** 模块描述符（不直接 import 模块代码，仅保留元数据和懒加载工厂） */
export interface FeatureDescriptor {
    /** 模块唯一标识 */
    id: string;
    /** 显示名称（英文回退用） */
    name: string;
    /** i18n name key（用于 UI 显示） */
    nameKey: string;
    /** i18n description key（用于 UI 显示） */
    descriptionKey: string;
    /** 版本号 */
    version: string;
    /** 描述（英文回退用） */
    description?: string;
    /** ActivityBar 图标 */
    icon: ComponentType<{ size?: number; className?: string }>;
    /** 加载策略：eager 启动时加载，lazy 按需加载 */
    loadingStrategy: 'eager' | 'lazy';
    /** 分层：core 核心功能(不可关闭), optional 可选模块(可关闭) */
    tier: 'core' | 'optional';
    /** 懒加载工厂 */
    load: () => Promise<{ default: Feature }>;
}

/** 全部功能模块注册表 */
export const FEATURE_REGISTRY: FeatureDescriptor[] = [
    {
        id: 'commands',
        name: 'Command Menu',
        nameKey: 'modules.commandsName',
        descriptionKey: 'modules.commandsDesc',
        version: '1.0.0',
        description: '命令菜单管理',
        icon: Terminal as any,
        loadingStrategy: 'eager',
        tier: 'optional',
        load: () => import('./CommandMenu'),
    },
    {
        id: 'virtual-port',
        name: 'Virtual Port',
        nameKey: 'modules.virtualPortName',
        descriptionKey: 'modules.virtualPortDesc',
        version: '1.0.0',
        description: '虚拟串口管理',
        icon: ArrowRightLeft as any,
        loadingStrategy: 'lazy',
        tier: 'optional',
        load: () => import('./VirtualPort'),
    },
    {
        id: 'auto-reply',
        name: 'Auto Reply',
        nameKey: 'modules.autoReplyName',
        descriptionKey: 'modules.autoReplyDesc',
        version: '1.0.0',
        description: '自动回复',
        icon: Reply as any,
        loadingStrategy: 'lazy',
        tier: 'optional',
        load: () => import('./AutoReply'),
    },
];

/** 根据 ID 查找模块描述符 */
export const getFeatureDescriptorById = (id: string): FeatureDescriptor | undefined => {
    return FEATURE_REGISTRY.find(f => f.id === id);
};
