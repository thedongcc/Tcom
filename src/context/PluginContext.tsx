import React, {
    createContext, useContext, useState,
    ReactNode, useCallback, useEffect, useRef
} from 'react';
import { Plugin, PluginContextApi, Disposable, SessionInfo, TpkgManifest } from '../types/plugin';
import { PLUGIN_REGISTRY } from '../plugins/registry';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmContext';
import { useSession } from './SessionContext';

// ─── 内部类型 ──────────────────────────────────────────────────────────────────

interface PluginState {
    plugin: Plugin;
    isActive: boolean;
    /** 是否为用户安装的外部插件（非内置） */
    isExternal: boolean;
    /** 外部插件的原始 manifest（用于持久化） */
    manifest?: TpkgManifest;
}

interface PluginContextType {
    plugins: PluginState[];
    registerPlugin: (plugin: Plugin) => void;
    activatePlugin: (pluginId: string) => void;
    deactivatePlugin: (pluginId: string) => void;
    uninstallPlugin: (pluginId: string) => void;
    getPlugin: (pluginId: string) => Plugin | undefined;
    /** 从 .tpkg JSON 字符串安装外部插件 */
    installFromJson: (json: string) => { success: boolean; error?: string };
}

const PluginContext = createContext<PluginContextType | undefined>(undefined);

const STORAGE_KEY = 'tcom:plugins';
const EXTERNAL_STORAGE_KEY = 'tcom:external-plugins';

// ─── 事件总线（全局单例） ──────────────────────────────────────────────────────

class EventBus {
    private listeners = new Map<string, Set<(...args: any[]) => void>>();

    on(event: string, cb: (...args: any[]) => void): Disposable {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(cb);
        return {
            dispose: () => {
                this.listeners.get(event)?.delete(cb);
            }
        };
    }

    emit(event: string, ...args: any[]): void {
        this.listeners.get(event)?.forEach(cb => {
            try { cb(...args); } catch (e) {
                console.error(`[EventBus] Error in listener for "${event}":`, e);
            }
        });
    }
}

const globalEventBus = new EventBus();

// ─── 从 TpkgManifest 构建 Plugin 对象 ─────────────────────────────────────────

function buildPluginFromManifest(manifest: TpkgManifest): Plugin | null {
    try {
        // 使用 Function 构造器执行插件代码（沙箱有限，但满足桌面应用场景）
        const moduleObj: { exports: any } = { exports: {} };
        // eslint-disable-next-line no-new-func
        const fn = new Function('module', 'exports', manifest.code);
        fn(moduleObj, moduleObj.exports);

        const exported = moduleObj.exports;

        if (typeof exported.activate !== 'function') {
            return null;
        }

        return {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            homepage: manifest.homepage,
            activate: exported.activate.bind(exported),
            deactivate: (exported.deactivate ?? (() => { })).bind(exported),
            sidebarComponent: exported.sidebarComponent,
            icon: exported.icon,
            editorComponent: exported.editorComponent,
            statusBarItems: exported.statusBarItems,
        };
    } catch (e) {
        console.error('[PluginLoader] Failed to build plugin from manifest:', e);
        return null;
    }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const PluginProvider = ({ children }: { children: ReactNode }) => {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { sessions, activeSessionId } = useSession();

    // 追踪每个插件注册的 Disposable，停用时自动清理
    const disposablesRef = useRef<Map<string, Disposable[]>>(new Map());

    // 注册的命令表
    const commandsRef = useRef<Map<string, { label: string; callback: () => void }>>(new Map());

    // 数据接收监听器
    const dataListenersRef = useRef<Set<(sessionId: string, data: Uint8Array) => void>>(new Set());

    // ── 构建 PluginContextApi ──────────────────────────────────────────────────

    const buildContextApi = useCallback((pluginId: string): PluginContextApi => {
        const storagePrefix = `tcom:plugin:${pluginId}:`;

        const addDisposable = (d: Disposable) => {
            if (!disposablesRef.current.has(pluginId)) {
                disposablesRef.current.set(pluginId, []);
            }
            disposablesRef.current.get(pluginId)!.push(d);
            return d;
        };

        return {
            pluginId,

            ui: {
                showToast: (message, type = 'info', duration = 3000) => {
                    showToast(message, type as any, duration);
                },
                showConfirm: async (opts) => {
                    return confirm({
                        title: opts.title,
                        message: opts.message,
                        confirmText: opts.confirmText,
                        cancelText: opts.cancelText,
                        type: (opts.type === 'danger' ? 'warning' : opts.type) as any,
                    });
                },
            },

            commands: {
                register: (id, label, callback) => {
                    commandsRef.current.set(id, { label, callback });
                    console.log(`[Plugin:${pluginId}] Command registered: ${id}`);
                    const d: Disposable = {
                        dispose: () => {
                            commandsRef.current.delete(id);
                        }
                    };
                    return addDisposable(d);
                },
            },

            sessions: {
                getAll: (): SessionInfo[] => {
                    return sessions.map(s => ({
                        id: s.id,
                        name: s.config.name,
                        type: s.config.type,
                        isConnected: s.isConnected,
                    }));
                },
                getActive: (): SessionInfo | null => {
                    if (!activeSessionId) return null;
                    const s = sessions.find(s => s.id === activeSessionId);
                    if (!s) return null;
                    return {
                        id: s.id,
                        name: s.config.name,
                        type: s.config.type,
                        isConnected: s.isConnected,
                    };
                },
                onDataReceived: (callback) => {
                    dataListenersRef.current.add(callback);
                    const d: Disposable = {
                        dispose: () => {
                            dataListenersRef.current.delete(callback);
                        }
                    };
                    return addDisposable(d);
                },
            },

            storage: {
                get: <T = unknown>(key: string): T | null => {
                    const raw = localStorage.getItem(storagePrefix + key);
                    if (raw === null) return null;
                    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
                },
                set: (key, value) => {
                    localStorage.setItem(storagePrefix + key, JSON.stringify(value));
                },
                delete: (key) => {
                    localStorage.removeItem(storagePrefix + key);
                },
                clear: () => {
                    const keysToRemove: string[] = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k?.startsWith(storagePrefix)) keysToRemove.push(k);
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                },
            },

            events: {
                on: (event, callback) => {
                    return addDisposable(globalEventBus.on(event, callback));
                },
                emit: (event, ...args) => {
                    globalEventBus.emit(event, ...args);
                },
            },
        };
    }, [showToast, confirm, sessions, activeSessionId]);

    // ── 清理插件的所有 Disposable ──────────────────────────────────────────────

    const cleanupPlugin = useCallback((pluginId: string) => {
        const disposables = disposablesRef.current.get(pluginId) ?? [];
        disposables.forEach(d => {
            try { d.dispose(); } catch (e) {
                console.error(`[Plugin:${pluginId}] Error disposing:`, e);
            }
        });
        disposablesRef.current.delete(pluginId);
    }, []);

    // ── 插件状态初始化 ─────────────────────────────────────────────────────────

    const [plugins, setPlugins] = useState<PluginState[]>(() => {
        // 1. 加载内置插件状态
        const savedStates: { id: string; isActive: boolean }[] = (() => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch { return []; }
        })();

        const builtinPlugins: PluginState[] = PLUGIN_REGISTRY.map(plugin => {
            const saved = savedStates.find(s => s.id === plugin.id);
            return {
                plugin,
                isActive: saved ? saved.isActive : true,
                isExternal: false,
            };
        });

        // 2. 加载外部插件
        const externalManifests: TpkgManifest[] = (() => {
            try {
                const raw = localStorage.getItem(EXTERNAL_STORAGE_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch { return []; }
        })();

        const externalPlugins: PluginState[] = externalManifests.flatMap(manifest => {
            const plugin = buildPluginFromManifest(manifest);
            if (!plugin) return [];
            const saved = savedStates.find(s => s.id === plugin.id);
            return [{
                plugin,
                isActive: saved ? saved.isActive : true,
                isExternal: true,
                manifest,
            }];
        });

        return [...builtinPlugins, ...externalPlugins];
    });

    // ── 持久化 ────────────────────────────────────────────────────────────────

    useEffect(() => {
        // 保存激活状态
        const stateToSave = plugins.map(p => ({ id: p.plugin.id, isActive: p.isActive }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));

        // 保存外部插件 manifest
        const externalManifests = plugins
            .filter(p => p.isExternal && p.manifest)
            .map(p => p.manifest!);
        localStorage.setItem(EXTERNAL_STORAGE_KEY, JSON.stringify(externalManifests));
    }, [plugins]);

    // ── 初始激活（水合） ──────────────────────────────────────────────────────

    const hydratedRef = useRef(false);
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;

        plugins.forEach(p => {
            if (p.isActive) {
                const ctx = buildContextApi(p.plugin.id);
                try {
                    p.plugin.activate(ctx);
                } catch (e) {
                    console.error(`[Plugin:${p.plugin.id}] Activation error:`, e);
                }
            }
        });
    }, []); // 仅在 mount 时运行一次

    // ── 操作方法 ──────────────────────────────────────────────────────────────

    const registerPlugin = useCallback((plugin: Plugin) => {
        setPlugins(prev => {
            if (prev.find(p => p.plugin.id === plugin.id)) return prev;
            const ctx = buildContextApi(plugin.id);
            try {
                plugin.activate(ctx);
                return [...prev, { plugin, isActive: true, isExternal: false }];
            } catch (e) {
                console.error(`[Plugin:${plugin.id}] Activation error:`, e);
                return [...prev, { plugin, isActive: false, isExternal: false }];
            }
        });
    }, [buildContextApi]);

    const activatePlugin = useCallback((pluginId: string) => {
        setPlugins(prev => {
            const wrapper = prev.find(p => p.plugin.id === pluginId);
            if (!wrapper || wrapper.isActive) return prev;
            const ctx = buildContextApi(pluginId);
            try {
                wrapper.plugin.activate(ctx);
                return prev.map(p => p.plugin.id === pluginId ? { ...p, isActive: true } : p);
            } catch (e) {
                console.error(`[Plugin:${pluginId}] Activation error:`, e);
                return prev;
            }
        });
    }, [buildContextApi]);

    const deactivatePlugin = useCallback((pluginId: string) => {
        setPlugins(prev => {
            const wrapper = prev.find(p => p.plugin.id === pluginId);
            if (!wrapper || !wrapper.isActive) return prev;
            const ctx = buildContextApi(pluginId);
            try {
                wrapper.plugin.deactivate(ctx);
            } catch (e) {
                console.error(`[Plugin:${pluginId}] Deactivation error:`, e);
            }
            cleanupPlugin(pluginId);
            return prev.map(p => p.plugin.id === pluginId ? { ...p, isActive: false } : p);
        });
    }, [buildContextApi, cleanupPlugin]);

    const uninstallPlugin = useCallback((pluginId: string) => {
        setPlugins(prev => {
            const wrapper = prev.find(p => p.plugin.id === pluginId);
            if (wrapper?.isActive) {
                const ctx = buildContextApi(pluginId);
                try { wrapper.plugin.deactivate(ctx); } catch { }
                cleanupPlugin(pluginId);
            }
            return prev.filter(p => p.plugin.id !== pluginId);
        });
    }, [buildContextApi, cleanupPlugin]);

    const getPlugin = useCallback((pluginId: string) => {
        return plugins.find(p => p.plugin.id === pluginId)?.plugin;
    }, [plugins]);

    /** 从 .tpkg JSON 字符串安装外部插件 */
    const installFromJson = useCallback((json: string): { success: boolean; error?: string } => {
        let manifest: TpkgManifest;
        try {
            manifest = JSON.parse(json);
        } catch {
            return { success: false, error: 'JSON 格式无效' };
        }

        if (!manifest.id || !manifest.name || !manifest.code) {
            return { success: false, error: '缺少必要字段（id、name、code）' };
        }

        // 防止重复安装
        if (plugins.find(p => p.plugin.id === manifest.id)) {
            return { success: false, error: `插件 "${manifest.id}" 已安装` };
        }

        const plugin = buildPluginFromManifest(manifest);
        if (!plugin) {
            return { success: false, error: '插件代码执行失败，请检查 activate 函数是否正确导出' };
        }

        const ctx = buildContextApi(plugin.id);
        try {
            plugin.activate(ctx);
        } catch (e: any) {
            return { success: false, error: `插件激活失败：${e?.message ?? e}` };
        }

        setPlugins(prev => [...prev, { plugin, isActive: true, isExternal: true, manifest }]);
        return { success: true };
    }, [plugins, buildContextApi]);

    const value: PluginContextType = {
        plugins,
        registerPlugin,
        activatePlugin,
        deactivatePlugin,
        uninstallPlugin,
        getPlugin,
        installFromJson,
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

/** 获取所有已注册命令（供命令面板使用） */
export { globalEventBus };
