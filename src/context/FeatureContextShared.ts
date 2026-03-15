/**
 * FeatureContextShared.ts
 * 功能模块 Context 共享类型和 Hook — 供 UI 组件消费模块状态。
 */
import { createContext, useContext } from 'react';
import { Feature } from '../types/module';

/** 单个模块的运行时状态 */
export interface FeatureState {
    feature: Feature;
    isActive: boolean;
}

/** 模块管理 Context 类型 */
export interface FeatureContextType {
    features: FeatureState[];
    activateFeature: (featureId: string) => void;
    deactivateFeature: (featureId: string) => void;
    getFeature: (featureId: string) => Feature | undefined;
}

export const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

/** 获取模块管理 Context（必须在 FeatureProvider 内使用） */
export const useFeatureManager = () => {
    const context = useContext(FeatureContext);
    if (!context) {
        throw new Error('useFeatureManager must be used within a FeatureProvider');
    }
    return context;
};
