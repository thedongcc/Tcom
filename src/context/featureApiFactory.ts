/**
 * featureApiFactory.ts
 * 模块 API 构建工厂：createFeatureContextApi。
 */
import { FeatureContextApi, Disposable, SessionInfo, ToastType, ConfirmOptions } from '../types/module';
import { SessionConfig } from '../types/session';
import { globalEventBus } from '../lib/EventBus';

// ─── 构建 FeatureContextApi（模块沙箱接口）──────────────────────────────────────

interface BuildContextApiDeps {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    confirm: (opts: ConfirmOptions) => Promise<boolean>;
    sessions: Array<{ id: string; config: SessionConfig; isConnected: boolean }>;
    activeSessionId: string | null;
    disposablesRef: React.MutableRefObject<Map<string, Disposable[]>>;
    commandsRef: React.MutableRefObject<Map<string, { label: string; callback: () => void }>>;
    dataListenersRef: React.MutableRefObject<Set<(sessionId: string, data: Uint8Array) => void>>;
}

export function createFeatureContextApi(featureId: string, deps: BuildContextApiDeps): FeatureContextApi {
    const { showToast, confirm, sessions, activeSessionId, disposablesRef, commandsRef, dataListenersRef } = deps;
    const storagePrefix = `tcom:feature:${featureId}:`;

    const addDisposable = (d: Disposable) => {
        if (!disposablesRef.current.has(featureId)) {
            disposablesRef.current.set(featureId, []);
        }
        disposablesRef.current.get(featureId)!.push(d);
        return d;
    };

    return {
        featureId: featureId,

        ui: {
            showToast: (message, type = 'info', duration = 3000) => {
                showToast(message, type as ToastType, duration);
            },
            showConfirm: async (opts) => {
                return confirm({
                    title: opts.title,
                    message: opts.message,
                    confirmText: opts.confirmText,
                    cancelText: opts.cancelText,
                    type: (opts.type === 'danger' ? 'warning' : opts.type) as ConfirmOptions['type'],
                });
            },
        },

        commands: {
            register: (id, label, callback) => {
                commandsRef.current.set(id, { label, callback });
                console.log(`[Feature:${featureId}] 命令已注册: ${id}`);
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
