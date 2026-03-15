/**
 * FeatureContext.tsx
 * 功能模块 Provider — 管理模块的生命周期、激活/停用、懒加载。
 */
import {
    useState, useCallback, useEffect, useRef, type ReactNode
} from 'react';
import { Feature, FeatureContextApi, Disposable } from '../types/module';
import { FEATURE_REGISTRY } from '../features/registry';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmContext';
import { useSession } from './SessionContext';
import { FeatureContext, FeatureState, FeatureContextType } from './FeatureContextShared';
import { createFeatureContextApi } from './featureApiFactory';

const STORAGE_KEY = 'tcom:features';

// ─── Provider ─────────────────────────────────────────────────────────────────

export const FeatureProvider = ({ children }: { children: ReactNode }) => {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { sessions, activeSessionId } = useSession();

    // 追踪每个模块注册的 Disposable，停用时自动清理
    const disposablesRef = useRef<Map<string, Disposable[]>>(new Map());

    // 注册的命令表
    const commandsRef = useRef<Map<string, { label: string; callback: () => void }>>(new Map());

    // 数据接收监听器
    const dataListenersRef = useRef<Set<(sessionId: string, data: Uint8Array) => void>>(new Set());

    // 已加载的 Feature 对象缓存（懒加载后存放）
    const loadedFeaturesRef = useRef<Map<string, Feature>>(new Map());

    // ── 构建 FeatureContextApi（委托给工厂函数） ─────────────────────────

    const buildContextApi = useCallback((featureId: string): FeatureContextApi => {
        return createFeatureContextApi(featureId, {
            showToast, confirm, sessions, activeSessionId,
            disposablesRef, commandsRef, dataListenersRef,
        });
    }, [showToast, confirm, sessions, activeSessionId]);

    // ── 清理模块的所有 Disposable ──────────────────────────────────────────────

    const cleanupFeature = useCallback((featureId: string) => {
        const disposables = disposablesRef.current.get(featureId) ?? [];
        disposables.forEach(d => {
            try { d.dispose(); } catch (e) {
                console.error(`[Feature:${featureId}] Error disposing:`, e);
            }
        });
        disposablesRef.current.delete(featureId);
    }, []);

    // ── 模块状态初始化 ─────────────────────────────────────────────────────────

    const [features, setFeatures] = useState<FeatureState[]>(() => {
        // 加载持久化的启用/禁用状态
        const savedStates: { id: string; isActive: boolean }[] = (() => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch { return []; }
        })();

        return FEATURE_REGISTRY.map(descriptor => {
            const saved = savedStates.find(s => s.id === descriptor.id);
            // 核心模块始终启用，可选模块参照保存的状态（默认启用）
            const isActive = descriptor.tier === 'core'
                ? true
                : (saved ? saved.isActive : true);

            return {
                // 初始时用占位 Feature 对象（懒加载前的 shell）
                feature: {
                    id: descriptor.id,
                    name: descriptor.name,
                    version: descriptor.version,
                    description: descriptor.description,
                    icon: descriptor.icon,
                    activate: () => {},
                    deactivate: () => {},
                } as Feature,
                isActive,
            };
        });
    });

    // ── 持久化 ────────────────────────────────────────────────────────────────

    useEffect(() => {
        const stateToSave = features.map(f => ({ id: f.feature.id, isActive: f.isActive }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, [features]);

    // ── 懒加载 + 初始激活 ──────────────────────────────────────────────────────

    const hydratedRef = useRef(false);
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;

        // 立即加载 eager 模块，延迟加载 lazy 模块
        const loadAndActivate = async () => {
            for (const descriptor of FEATURE_REGISTRY) {
                const featureState = features.find(f => f.feature.id === descriptor.id);
                if (!featureState?.isActive) continue;

                try {
                    const module = await descriptor.load();
                    const feature = module.default;
                    loadedFeaturesRef.current.set(descriptor.id, feature);

                    // 更新 features 列表中的 Feature 对象为真实的
                    setFeatures(prev => prev.map(f =>
                        f.feature.id === descriptor.id ? { ...f, feature } : f
                    ));

                    // 激活
                    const ctx = buildContextApi(feature.id);
                    feature.activate(ctx);
                } catch (e) {
                    console.error(`[Feature:${descriptor.id}] 加载失败:`, e);
                }
            }
        };

        void loadAndActivate();
    }, []); // 仅在 mount 时运行一次

    // ── 操作方法 ──────────────────────────────────────────────────────────────

    const activateFeature = useCallback(async (featureId: string) => {
        const descriptor = FEATURE_REGISTRY.find(d => d.id === featureId);
        if (!descriptor) return;

        try {
            // 加载模块（如果尚未加载）
            let feature = loadedFeaturesRef.current.get(featureId);
            if (!feature) {
                const module = await descriptor.load();
                feature = module.default;
                loadedFeaturesRef.current.set(featureId, feature);
            }

            const ctx = buildContextApi(featureId);
            feature.activate(ctx);

            setFeatures(prev => prev.map(f =>
                f.feature.id === featureId ? { ...f, feature, isActive: true } : f
            ));
        } catch (e) {
            console.error(`[Feature:${featureId}] 激活失败:`, e);
        }
    }, [buildContextApi]);

    const deactivateFeature = useCallback((featureId: string) => {
        const featureState = features.find(f => f.feature.id === featureId);
        if (!featureState || !featureState.isActive) return;

        // 核心模块不可关闭
        const descriptor = FEATURE_REGISTRY.find(d => d.id === featureId);
        if (descriptor?.tier === 'core') return;

        const ctx = buildContextApi(featureId);
        try {
            featureState.feature.deactivate(ctx);
        } catch (e) {
            console.error(`[Feature:${featureId}] 停用失败:`, e);
        }
        cleanupFeature(featureId);

        setFeatures(prev => prev.map(f =>
            f.feature.id === featureId ? { ...f, isActive: false } : f
        ));
    }, [features, buildContextApi, cleanupFeature]);

    const getFeature = useCallback((featureId: string) => {
        return features.find(f => f.feature.id === featureId)?.feature;
    }, [features]);

    const value: FeatureContextType = {
        features,
        activateFeature,
        deactivateFeature,
        getFeature,
    };

    return (
        <FeatureContext.Provider value={value}>
            {children}
        </FeatureContext.Provider>
    );
};

export { globalEventBus } from '../lib/EventBus';
export { useFeatureManager } from './FeatureContextShared';
