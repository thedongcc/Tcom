import { Plugin } from '../types/plugin';
import { CommandMenuPlugin } from './CommandMenu';
import { VirtualPortPlugin } from './VirtualPort';

/**
 * Central Registry of all available plugins in the application.
 * In a real app, this might be dynamic or fetch from a remote server.
 * For now, it lists all built-in plugins.
 */
export const PLUGIN_REGISTRY: Plugin[] = [
    CommandMenuPlugin,
    VirtualPortPlugin
];

export const getPluginById = (id: string): Plugin | undefined => {
    return PLUGIN_REGISTRY.find(p => p.id === id);
};
