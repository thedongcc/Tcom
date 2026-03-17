/**
 * composeProviders.ts
 * Provider 组合工具 — 将多层嵌套的 Provider 扁平化为可读的声明式列表。
 *
 * 使用示例：
 *   const AppProviders = composeProviders(
 *     [SettingsProvider],
 *     [I18nProvider],
 *     [SessionProvider, { manager }],
 *   );
 *   return <AppProviders>{children}</AppProviders>;
 */
import React, { type ReactNode, type ComponentType } from 'react';

/** Provider 条目：组件本身，或 [组件, props] */
type ProviderEntry =
    | ComponentType<{ children: ReactNode }>
    | [ComponentType<Record<string, unknown> & { children?: ReactNode }>, Record<string, unknown>];

/** 将多个 Provider 组合为单一高阶组件 */
export function composeProviders(
    ...entries: ProviderEntry[]
): ComponentType<{ children: ReactNode }> {
    return ({ children }: { children: ReactNode }) => {
        // 从内到外包裹，因此反向遍历
        return entries.reduceRight<ReactNode>((acc, entry) => {
            if (Array.isArray(entry)) {
                const [Provider, props] = entry;
                return React.createElement(Provider, { ...props, children: acc } as Record<string, unknown>);
            }
            return React.createElement(entry, { children: acc });
        }, children) as React.ReactElement;
    };
}
