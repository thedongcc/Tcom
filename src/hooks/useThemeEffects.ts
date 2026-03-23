/**
 * useThemeEffects.ts
 * 主题/排版/背景图的 DOM 副效应 Hook。
 *
 * 【Fluent Glass 架构】
 * Glass 主题的面板色从出厂就是 rgba() 半透明值，无需 JS 动态混色。
 * 普通 Dark/Light 主题不支持背景图，不需要透明度处理。
 */
import { useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ThemeConfig } from '../types/theme';
import type { ThemeDefinition } from '../themes';
import { applyTheme } from '../themes';

/**
 * 判断主题是否支持背景图（Pic 主题）
 */
export function isGlassTheme(themeId: string): boolean {
    return themeId === 'pic';
}

/**
 * 将背景图效果应用到 DOM（仅 Glass 主题使用）。
 * Glass 主题的 rgba 值已在 JSON 中定义，无需 color-mix 动态计算。
 * 只需：注入图片元数据 + 释放布局变量级联。
 */
export function applyBgImageOverrides(config: ThemeConfig, _theme?: ThemeDefinition): void {
    const root = document.documentElement;
    const { rxBackground, bgSize, bgPosition, bgOpacity, bgBlur } = config.images;

    if (!rxBackground) return;

    const isUrl = /^https?:\/\//.test(rxBackground);
    const bgUrl = isUrl ? rxBackground : convertFileSrc(rxBackground);

    // 注入背景图元数据
    root.style.setProperty('--bg-image', `url("${bgUrl}")`);
    root.style.setProperty('--bg-size', bgSize || 'cover');
    root.style.setProperty('--bg-position', bgPosition || 'center');

    const finalBgOpacity = (bgOpacity ?? 100) / 100;
    root.style.setProperty('--bg-opacity', finalBgOpacity.toString());

    const finalBgBlur = bgBlur ?? 0;
    root.style.setProperty('--glass-filter', finalBgBlur > 0 ? `blur(${finalBgBlur}px)` : 'none');
    root.style.setProperty('--bg-inset', finalBgBlur > 0 ? `-${finalBgBlur * 2}px` : '0px');
    
    root.setAttribute('data-bg-image', 'true');

    // Glass 主题的面板色已在 JSON 中定义为 rgba()，
    // applyTheme() 已将它们设为 inline style，无需额外处理。
}

/**
 * 清除背景图 DOM 效果
 */
function clearBgImageOverrides(): void {
    const root = document.documentElement;
    root.style.removeProperty('--bg-image');
    root.style.removeProperty('--bg-size');
    root.style.removeProperty('--bg-position');
    root.style.removeProperty('--bg-opacity');
    root.style.removeProperty('--glass-blur');
    root.removeAttribute('data-bg-image');
    root.style.removeProperty('--tcom-ui-opacity');
    root.style.removeProperty('--sys-bg-base');
    root.style.removeProperty('--sys-bg-surface');
    root.style.removeProperty('--sys-bg-elevated');
}

interface UseThemeEffectsParams {
    config: ThemeConfig;
    availableThemes: ThemeDefinition[];
}

export function useThemeEffects({ config, availableThemes }: UseThemeEffectsParams): void {
    useEffect(() => {
        const root = document.documentElement;

        // 1. 应用主题
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

        // 3. Glass 主题 + 有背景图 → 注入图片元数据
        if (isGlassTheme(config.theme) && config.images.rxBackground) {
            applyBgImageOverrides(config, theme);
        } else {
            clearBgImageOverrides();
        }

        // 4. JIT Alpha 透明度缩放引擎 (Glass UI Opacity Controller)
        if (isGlassTheme(config.theme) && theme) {
            const uiOpacityScale = (config.images.uiOpacity ?? 100) / 100;
            Object.entries(theme.colors).forEach(([key, value]) => {
                if (typeof value === 'string' && value.startsWith('rgba(')) {
                    const match = value.match(/rgba\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([0-9.]+)\)/);
                    if (match) {
                        const alpha = parseFloat(match[4]) * uiOpacityScale;
                        root.style.setProperty(key, `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha.toFixed(3)})`);
                    }
                }
            });
        }
    }, [config.theme, config.images, config.typography, availableThemes]);
}
