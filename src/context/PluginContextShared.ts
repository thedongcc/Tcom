import { createContext, useContext } from 'react';
import { Plugin, PluginContextApi, Disposable, SessionInfo, TpkgManifest } from '../types/plugin';

export interface PluginState {
    plugin: Plugin;
    isActive: boolean;
    /** 是否为用户安装的外部插件（非内置） */
    isExternal: boolean;
    /** 外部插件的原始 manifest（用于持久化） */
    manifest?: TpkgManifest;
}

export interface PluginContextType {
    plugins: PluginState[];
    registerPlugin: (plugin: Plugin) => void;
    activatePlugin: (pluginId: string) => void;
    deactivatePlugin: (pluginId: string) => void;
    uninstallPlugin: (pluginId: string) => void;
    getPlugin: (pluginId: string) => Plugin | undefined;
    /** 从 .tpkg JSON 字符串安装外部插件 */
    installFromJson: (json: string) => { success: boolean; error?: string };
}

export const PluginContext = createContext<PluginContextType | undefined>(undefined);

export const usePluginManager = () => {
    const context = useContext(PluginContext);
    if (!context) {
        throw new Error('usePluginManager must be used within a PluginProvider');
    }
    return context;
};
