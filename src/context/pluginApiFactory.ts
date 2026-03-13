/**
 * pluginApiFactory.ts
 * 插件 API 构建工厂：buildPluginFromManifest + buildContextApi。
 * 从 PluginContext.tsx 中拆分出来。
 */
import { Plugin, PluginContextApi, Disposable, SessionInfo, TpkgManifest } from '../types/plugin';
import { globalEventBus } from '../lib/EventBus';

// ─── 从 TpkgManifest 构建 Plugin 对象 ─────────────────────────────────────────

export function buildPluginFromManifest(manifest: TpkgManifest): Plugin | null {
    try {
        // 使用 Function 構造器执行插件代码（沙箱有限，但满足桌面应用场景）
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

// ─── 构建 PluginContextApi（插件沙箱接口）──────────────────────────────────────

interface BuildContextApiDeps {
    showToast: (message: string, type?: any, duration?: number) => void;
    confirm: (opts: any) => Promise<boolean>;
    sessions: Array<{ id: string; config: any; isConnected: boolean }>;
    activeSessionId: string | null;
    disposablesRef: React.MutableRefObject<Map<string, Disposable[]>>;
    commandsRef: React.MutableRefObject<Map<string, { label: string; callback: () => void }>>;
    dataListenersRef: React.MutableRefObject<Set<(sessionId: string, data: Uint8Array) => void>>;
}

export function createPluginContextApi(pluginId: string, deps: BuildContextApiDeps): PluginContextApi {
    const { showToast, confirm, sessions, activeSessionId, disposablesRef, commandsRef, dataListenersRef } = deps;
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
}
