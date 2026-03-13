import React, {
    useState, useCallback, useEffect, useRef, type ReactNode
} from 'react';
import { Plugin, PluginContextApi, Disposable, SessionInfo, TpkgManifest } from '../types/plugin';
import { PLUGIN_REGISTRY } from '../plugins/registry';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmContext';
import { useSession } from './SessionContext';
import { PluginContext, PluginState, PluginContextType } from './PluginContextShared';
import { buildPluginFromManifest, createPluginContextApi } from './pluginApiFactory';
import { globalEventBus } from '../lib/EventBus';

const STORAGE_KEY = 'tcom:plugins';
const EXTERNAL_STORAGE_KEY = 'tcom:external-plugins';

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

    // ── 构建 PluginContextApi（委托给工厂函数） ─────────────────────────

    const buildContextApi = useCallback((pluginId: string): PluginContextApi => {
        return createPluginContextApi(pluginId, {
            showToast, confirm, sessions, activeSessionId,
            disposablesRef, commandsRef, dataListenersRef,
        });
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

export { globalEventBus } from '../lib/EventBus';
export { usePluginManager } from './PluginContextShared';
