/**
 * ModuleManagerSidebar.tsx
 * 模块管理侧边栏 — 简洁的模块开关列表。
 *
 * 显示所有注册的功能模块，核心模块显示"核心"标签，可选模块显示 Switch 开关。
 */
import React from 'react';
import { Box } from 'lucide-react';
import { useFeatureManager } from '../../context/FeatureContextShared';
import { FEATURE_REGISTRY, FeatureDescriptor } from '../../features/registry';
import { Switch } from '../common/Switch';
import { useI18n } from '../../context/I18nContext';

// ─── 单个模块卡片 ──────────────────────────────────────────────────────────────

const ModuleCard = React.memo(({
    descriptor,
    isActive,
    onToggle,
    coreText,
}: {
    descriptor: FeatureDescriptor;
    isActive: boolean;
    onToggle?: (checked: boolean) => void;
    coreText: string;
}) => {
    const Icon = descriptor.icon;

    return (
        <div className="px-4 py-3 hover:bg-[var(--module-manager-item-hover)] transition-colors border-l-2 border-transparent hover:border-[var(--focus-border-color)]">
            <div className="flex items-start gap-3">
                {/* 图标 */}
                <div className="pt-0.5 flex-shrink-0">
                    {Icon
                        ? <Icon size={28} className="text-[var(--module-manager-text)] opacity-70" />
                        : <Box size={28} className="text-[var(--module-manager-text)] opacity-40" />
                    }
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[13px] font-bold text-[var(--module-manager-text)] truncate pr-2">
                            {descriptor.name}
                        </span>
                        {/* 核心模块：标签 / 可选模块：开关 */}
                        {descriptor.tier === 'core' ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-[var(--button-background)] text-[var(--button-foreground)] rounded-sm flex-shrink-0 opacity-80">
                                {coreText}
                            </span>
                        ) : onToggle ? (
                            <div className="flex-shrink-0">
                                <Switch
                                    checked={isActive}
                                    onChange={onToggle}
                                />
                            </div>
                        ) : null}
                    </div>
                    <div className="text-[12px] text-[var(--input-placeholder-color)] truncate">
                        {descriptor.description}
                    </div>
                    <div className="text-[11px] text-[var(--input-placeholder-color)] mt-0.5 opacity-60">
                        v{descriptor.version}
                    </div>
                </div>
            </div>
        </div>
    );
});

// ─── 分区标题 ──────────────────────────────────────────────────────────────────

const SectionTitle = React.memo(({ title, count }: { title: string; count: number }) => (
    <div className="px-4 py-2 text-[11px] font-bold text-[var(--input-placeholder-color)] uppercase tracking-wide flex items-center justify-between">
        <span>{title}</span>
        <span className="font-normal normal-case text-[10px] opacity-60">{count}</span>
    </div>
));

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export const ModuleManagerSidebar = () => {
    const { features, activateFeature, deactivateFeature } = useFeatureManager();
    const { t } = useI18n();

    // 按 tier 分组
    const coreDescriptors = FEATURE_REGISTRY.filter(d => d.tier === 'core');
    const optionalDescriptors = FEATURE_REGISTRY.filter(d => d.tier === 'optional');

    const isFeatureActive = (id: string): boolean => {
        return features.find(f => f.feature.id === id)?.isActive ?? false;
    };

    const handleToggle = (id: string, checked: boolean) => {
        if (checked) {
            activateFeature(id);
        } else {
            deactivateFeature(id);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--module-manager-bg)]" data-component="module-manager-sidebar">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* 核心功能 */}
                <SectionTitle title={t('modules.core')} count={coreDescriptors.length} />
                <div>
                    {coreDescriptors.map(descriptor => (
                        <ModuleCard
                            key={descriptor.id}
                            descriptor={descriptor}
                            isActive={true}
                            coreText={t('modules.core')}
                        />
                    ))}
                </div>

                {/* 可选模块 */}
                {optionalDescriptors.length > 0 && (
                    <>
                        <div className="h-[1px] bg-[var(--module-manager-border)] mx-4 my-1" />
                        <SectionTitle title={t('modules.optional')} count={optionalDescriptors.length} />
                        <div>
                            {optionalDescriptors.map(descriptor => (
                                <ModuleCard
                                    key={descriptor.id}
                                    descriptor={descriptor}
                                    isActive={isFeatureActive(descriptor.id)}
                                    onToggle={(checked) => handleToggle(descriptor.id, checked)}
                                    coreText={t('modules.core')}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
