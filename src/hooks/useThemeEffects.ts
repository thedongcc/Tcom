/**
 * useThemeEffects.ts
 * 主题/排版/背景图的 DOM 副效应 Hook。
 * 监听配置与可用主题变化，将主题 CSS 变量、排版样式、背景图注入到 DOM。
 */
import { useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ThemeConfig } from '../types/theme';
import type { ThemeDefinition } from '../themes';
import { applyTheme } from '../themes';

/**
 * 背景图激活时需要覆盖为 transparent 的 CSS 变量列表。
 * 与 index.css 中 [data-bg-image] 块保持一致。
 */
const BG_TRANSPARENT_VARS = [
    // 核心布局
    '--app-background', '--sidebar-background', '--activitybar-background',
    '--statusbar-background', '--titlebar-background', '--panel-background',
    '--editor-background', '--widget-background', '--settings-header-background',
    // 编辑器/标签栏
    '--editor-area-bg', '--editor-area-tabs-bg', '--st-editor-tabs-bg',
    '--st-tab-active-bg', '--st-tab-inactive-bg',
    // 设置
    '--settings-editor-bg', '--settings-editor-toolbar-bg',
    // 监视区
    '--monitor-terminal-bg', '--st-monitor-toolbar-bg', '--st-monitor-log-bg', '--st-monitor-rx-bg',
    // 发送区
    '--st-sendarea-bg', '--st-sendarea-toolbar-bg',
    // 侧边栏
    '--session-list-sidebar-bg', '--session-list-sidebar-header-bg',
    '--command-sidebar-bg', '--module-manager-bg', '--serial-config-bg',
    '--st-sidebar-panel-bg', '--st-config-item-bg',
    // MQTT
    '--st-mqtt-toolbar-bg', '--mqtt-config-bg', '--st-mqtt-monitor-bg',
    // 虚拟串口
    '--monitor-terminal-toolbar-bg',
    // 搜索/工具栏
    '--log-search-bg', '--st-logsearch-bg', '--log-search-input-bg',
    '--st-toolbar-bg', '--serial-input-toolbar-bg',
    // 输入框/下拉框
    '--input-background', '--st-input-bg', '--mqtt-config-input-bg',
    '--custom-select-bg', '--custom-select-trigger-bg', '--st-select-bg',
];

/** 背景图激活时需要半透明化的边框变量 */
const BG_BORDER_OVERRIDES: Record<string, string> = {
    '--border-color': 'rgba(255, 255, 255, 0.1)',
    '--widget-border-color': 'rgba(255, 255, 255, 0.08)',
    '--session-list-sidebar-border': 'rgba(255, 255, 255, 0.1)',
    '--command-sidebar-border': 'rgba(255, 255, 255, 0.1)',
    '--module-manager-border': 'rgba(255, 255, 255, 0.1)',
    '--editor-area-tab-border': 'rgba(255, 255, 255, 0.08)',
    '--st-monitor-divider': 'rgba(255, 255, 255, 0.08)',
    '--st-monitor-toolbar-border': 'rgba(255, 255, 255, 0.08)',
    '--st-sendarea-toolbar-border': 'rgba(255, 255, 255, 0.08)',
    '--serial-input-toolbar-border': 'rgba(255, 255, 255, 0.08)',
    '--st-mqtt-toolbar-border': 'rgba(255, 255, 255, 0.08)',
    '--log-search-border': 'rgba(255, 255, 255, 0.08)',
    '--st-logsearch-border': 'rgba(255, 255, 255, 0.08)',
};

interface UseThemeEffectsParams {
    config: ThemeConfig;
    availableThemes: ThemeDefinition[];
}

export function useThemeEffects({ config, availableThemes }: UseThemeEffectsParams): void {
    // 用 ref 跟踪背景图状态，供主题 effect 使用
    const bgActiveRef = useRef(false);

    // ── 统一的主题 + 背景图 effect ──
    // 合并为单个 effect，确保执行顺序正确：先 applyTheme，再叠加背景覆盖
    useEffect(() => {
        const root = document.documentElement;
        const { rxBackground, bgSize, bgPosition, bgOpacity } = config.images;

        // 1. 应用主题（会清除所有 -- 内联变量并重新设置主题色）
        const theme = availableThemes.find(t => t.id === config.theme);
        if (theme) {
            applyTheme(theme);

            // 同步窗口原生背景色（resize 时露出的背景应与主题一致）
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

            // 注入背景图 CSS 变量
            root.style.setProperty('--bg-image', `url("${bgUrl}")`);
            root.style.setProperty('--bg-size', bgSize || 'cover');
            root.style.setProperty('--bg-position', bgPosition || 'center');
            root.style.setProperty('--bg-opacity', String((bgOpacity ?? 100) / 100));

            // 设置 data-bg-image 属性
            root.setAttribute('data-bg-image', 'true');

            // 覆盖背景色为 transparent（必须在 applyTheme 之后，因为 applyTheme 设置了内联样式）
            BG_TRANSPARENT_VARS.forEach(v => root.style.setProperty(v, 'transparent'));
            Object.entries(BG_BORDER_OVERRIDES).forEach(([k, v]) => root.style.setProperty(k, v));

            bgActiveRef.current = true;
        } else {
            // 移除背景图变量
            root.style.removeProperty('--bg-image');
            root.style.removeProperty('--bg-size');
            root.style.removeProperty('--bg-position');
            root.style.removeProperty('--bg-opacity');

            // 移除 data-bg-image 属性
            root.removeAttribute('data-bg-image');
            bgActiveRef.current = false;
        }
    }, [config.theme, config.images, config.typography, availableThemes]);

    // ── 持久化到 localStorage ──
    useEffect(() => {
        try {
            localStorage.setItem('tcom-settings', JSON.stringify(config));
            localStorage.setItem('tcom-theme', config.theme);
        } catch {
            // localStorage 满或不可用时静默失败
        }
    }, [config]);
}
