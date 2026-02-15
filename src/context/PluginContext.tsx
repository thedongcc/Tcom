import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { Plugin, PluginContextApi } from '../types/plugin';
import { PLUGIN_REGISTRY } from '../plugins/registry';

interface PluginState {
    plugin: Plugin;
    isActive: boolean;
}

interface PluginContextType {
    plugins: PluginState[];
    registerPlugin: (plugin: Plugin) => void;
    activatePlugin: (pluginId: string) => void;
    deactivatePlugin: (pluginId: string) => void;
    uninstallPlugin: (pluginId: string) => void;
    getPlugin: (pluginId: string) => Plugin | undefined;
}

const PluginContext = createContext<PluginContextType | undefined>(undefined);

const STORAGE_KEY = 'tcom:plugins';

export const PluginProvider = ({ children }: { children: ReactNode }) => {
    const contextApiRef = useRef<PluginContextApi>({
        registerCommand: (id, cb) => {
            console.log(`[PluginSystem] Command registered: ${id}`);
        }
    });

    const [plugins, setPlugins] = useState<PluginState[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as { id: string, isActive: boolean }[];
                const rehydrated = parsed.map(item => {
                    const plugin = PLUGIN_REGISTRY.find(p => p.id === item.id);
                    if (!plugin) return null;
                    return { plugin, isActive: item.isActive };
                }).filter((p): p is PluginState => p !== null);
                return rehydrated;
            } catch (e) {
                console.error('Failed to parse plugin state', e);
            }
        }
        // Default
        const defaultPlugin = PLUGIN_REGISTRY.find(p => p.id === 'commands');
        return defaultPlugin ? [{ plugin: defaultPlugin, isActive: true }] : [];
    });

    // Persistence
    useEffect(() => {
        const stateToSave = plugins.map(p => ({ id: p.plugin.id, isActive: p.isActive }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, [plugins]);

    // Initial Activation (Hydration)
    const hydratedRef = useRef(false);
    useEffect(() => {
        if (!hydratedRef.current) {
            plugins.forEach(p => {
                if (p.isActive) {
                    try {
                        console.log(`Hydrating plugin: ${p.plugin.name}`);
                        p.plugin.activate(contextApiRef.current);
                    } catch (e) {
                        console.error(`Failed to hydrate plugin ${p.plugin.id}`, e);
                    }
                }
            });
            hydratedRef.current = true;
        }
    }, []); // Run once on mount

    const contextApi = contextApiRef.current;

    const registerPlugin = useCallback((plugin: Plugin) => {
        setPlugins(prev => {
            if (prev.find(p => p.plugin.id === plugin.id)) return prev;

            // Auto-activate on install? Yes.
            try {
                plugin.activate(contextApi);
                return [...prev, { plugin, isActive: true }];
            } catch (e) {
                console.error(`Failed to activate plugin ${plugin.id}`, e);
                // Still add it but inactive if crash? Or fail?
                // Let's add it inactive.
                return [...prev, { plugin, isActive: false }];
            }
        });
    }, [contextApi]);

    const activatePlugin = useCallback((pluginId: string) => {
        setPlugins(prev => {
            const wrapper = prev.find(p => p.plugin.id === pluginId);
            if (!wrapper || wrapper.isActive) return prev; // Already active

            try {
                wrapper.plugin.activate(contextApi);
                return prev.map(p => p.plugin.id === pluginId ? { ...p, isActive: true } : p);
            } catch (e) {
                console.error(`Failed to activate plugin ${pluginId}`, e);
                return prev;
            }
        });
    }, [contextApi]);

    const deactivatePlugin = useCallback((pluginId: string) => {
        setPlugins(prev => {
            const wrapper = prev.find(p => p.plugin.id === pluginId);
            if (!wrapper || !wrapper.isActive) return prev; // Already inactive

            try {
                wrapper.plugin.deactivate(contextApi);
                return prev.map(p => p.plugin.id === pluginId ? { ...p, isActive: false } : p);
            } catch (e) {
                console.error(`Failed to deactivate plugin ${pluginId}`, e);
                return prev;
            }
        });
    }, [contextApi]);

    const uninstallPlugin = useCallback((pluginId: string) => {
        setPlugins(prev => {
            const wrapper = prev.find(p => p.plugin.id === pluginId);
            if (wrapper && wrapper.isActive) {
                try {
                    wrapper.plugin.deactivate(contextApi);
                } catch (e) {
                    console.error('Failed to deactivate before uninstall', e);
                }
            }
            return prev.filter(p => p.plugin.id !== pluginId);
        });
    }, [contextApi]);

    const getPlugin = useCallback((pluginId: string) => {
        return plugins.find(p => p.plugin.id === pluginId)?.plugin;
    }, [plugins]);

    const value = {
        plugins,
        registerPlugin,
        activatePlugin,
        deactivatePlugin,
        uninstallPlugin,
        getPlugin
    };

    return (
        <PluginContext.Provider value={value}>
            {children}
        </PluginContext.Provider>
    );
};

export const usePluginManager = () => {
    const context = useContext(PluginContext);
    if (!context) {
        throw new Error('usePluginManager must be used within a PluginProvider');
    }
    return context;
};
