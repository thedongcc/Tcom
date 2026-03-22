/**
 * useThemeEffects.ts
 * 主题/排版/背景图的 DOM 副效应 Hook。
 * 监听配置与可用主题变化，将主题 CSS 变量、排版样式、背景图注入到 DOM。
 *
 * Phase 2 后，JSON 已瘦身至 ~50 个核心变量，组件级变量仅存在于 CSS 中
 * 通过 var(--sys-bg-*) 级联，背景图覆盖逻辑极其简洁：
 * 只需覆盖 --sys-bg-* 语义变量 + 移除少量保留的布局背景 inline style。
 */
import { useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ThemeConfig } from '../types/theme';
import type { ThemeDefinition } from '../themes';
import { applyTheme } from '../themes';

/**
 * JSON 中保留的布局级背景变量（Phase 2 后仅约 10 个）。
 * 背景图模式下需要从 inline style 移除，让它们回退到 CSS var(--sys-bg-*) 级联。
 */
const BG_LAYOUT_VARS = [
    '--app-background', '--editor-background', '--panel-background',
    '--sidebar-background', '--statusbar-background', '--widget-background',
    '--settings-header-background', '--input-background',
    '--titlebar-background', '--activitybar-background',
];

interface UseThemeEffectsParams {
    config: ThemeConfig;
    availableThemes: ThemeDefinition[];
}

export function useThemeEffects({ config, availableThemes }: UseThemeEffectsParams): void {
    useEffect(() => {
        const root = document.documentElement;
        const { rxBackground, bgSize, bgPosition, bgOpacity } = config.images;

        // 1. 应用主题（清除旧 inline 变量并注入新主题的 ~50 个核心变量）
        const theme = availableThemes.find(t => t.id === config.theme);
        if (theme) {
            applyTheme(theme);

            // 同步窗口原生背景色
            const bgColor = getComputedStyle(root).getPropertyValue('--editor-background').trim();
            if (bgColor) {
                import('@tauri-apps/api/core').then(({ invoke }) => {
                    invoke('window_set_bg_color', { color: bgColor }).catch(() => {});
                });
            }
        }

        // 2. 重新注入排版变量（被 applyTheme 清除了）
        const { fontFamily, fontSize, lineHeight } = config.typography;
        root.style.setProperty('--st-font-family', fontFamily);
        root.style.setProperty('--st-font-size', `${fontSize}px`);
        root.style.setProperty('--st-line-height', `${lineHeight}`);

        // 3. 处理背景图
        if (rxBackground) {
            const isUrl = /^https?:\/\//.test(rxBackground);
            const bgUrl = isUrl ? rxBackground : convertFileSrc(rxBackground);

            root.style.setProperty('--bg-image', `url("${bgUrl}")`);
            root.style.setProperty('--bg-size', bgSize || 'cover');
            root.style.setProperty('--bg-position', bgPosition || 'center');
            root.style.setProperty('--bg-opacity', String((bgOpacity ?? 100) / 100));
            root.setAttribute('data-bg-image', 'true');

            // 覆盖 3 个语义变量 → 所有 CSS var() 级联组件自动穿透
            root.style.setProperty('--sys-bg-base', 'transparent');
            root.style.setProperty('--sys-bg-surface', 'rgba(30, 30, 30, 0.3)');
            root.style.setProperty('--sys-bg-elevated', 'rgba(30, 30, 30, 0.5)');

            // 边框半透明化
            root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.12)');
            root.style.setProperty('--widget-border-color', 'rgba(255, 255, 255, 0.08)');

            // 移除保留的布局背景 inline → 回退到 CSS var(--sys-bg-*) 级联
            BG_LAYOUT_VARS.forEach(v => root.style.removeProperty(v));
        } else {
            root.style.removeProperty('--bg-image');
            root.style.removeProperty('--bg-size');
            root.style.removeProperty('--bg-position');
            root.style.removeProperty('--bg-opacity');
            root.removeAttribute('data-bg-image');

            // 清理语义覆盖
            root.style.removeProperty('--sys-bg-base');
            root.style.removeProperty('--sys-bg-surface');
            root.style.removeProperty('--sys-bg-elevated');
        }
    }, [config.theme, config.images, config.typography, availableThemes]);
}
