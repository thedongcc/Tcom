/**
 * useColorPicker.ts
 * 元素拾取器 / 颜色选取逻辑。
 * 从 SettingsContext.tsx 中拆分出来，管理 DOM 事件（mouseover/click/mouseout）和高亮覆盖层。
 */
import { useEffect } from 'react';
import { ThemeDefinition, applyTheme } from '../themes';
import { ThemeConfig } from '../types/theme';

interface UseColorPickerOptions {
    availableThemes: ThemeDefinition[];
    config: ThemeConfig;
}

/**
 * 主题编辑器拾取器 + 预览同步 Hook。
 * 订阅主题 API 的 IPC 消息，处理元素拾取和颜色预览。
 */
export function useColorPicker({ availableThemes, config }: UseColorPickerOptions) {
    useEffect(() => {
        const api = (window as any).themeAPI;
        if (!api) return;

        // 1. 监听颜色预览同步
        const unApplyPreview = api.onApplyPreview?.((edits: Record<string, string>) => {
            if (Object.keys(edits).length === 0) {
                if (availableThemes.length > 0) {
                    let activeDef = availableThemes.find(t => t.id === config.theme) || availableThemes[0];
                    if (activeDef) applyTheme(activeDef);
                }
            } else {
                Object.entries(edits).forEach(([key, val]) => {
                    document.documentElement.style.setProperty(key, val);
                });
            }
        });

        // 2. 监听编辑器关闭
        const unEditorClosed = api.onEditorClosed?.(() => {
            if (availableThemes.length > 0) {
                const activeDef = availableThemes.find(t => t.id === config.theme) || availableThemes[0];
                if (activeDef) applyTheme(activeDef);
            }
        });

        // 拾取器状态变量
        let highlightEl: HTMLDivElement | null = null;
        let lastTarget: HTMLElement | null = null;

        // ── 内部逻辑函数 ──

        // 仅移除高亮层和恢复光标，不卸载监听器 (用于离场/失焦)
        function removeHighlight() {
            if (highlightEl) {
                highlightEl.remove();
                highlightEl = null;
            }
            const iStyle = document.getElementById('tcom-inspector-style');
            if (iStyle) iStyle.remove();

            document.body.style.cursor = '';
        }

        // 彻底停止拾取模式并卸载所有监听器
        function stopEverything() {
            removeHighlight();
            window.removeEventListener('mouseover', handleMouseOver, true);
            window.removeEventListener('click', handleClick, true);
            window.removeEventListener('mouseout', handleMouseOut, true);
            window.removeEventListener('blur', removeHighlight, true);
        }

        function handleMouseOver(e: MouseEvent) {
            const target = e.target as HTMLElement;
            if (!target || target === highlightEl || target.id === 'tcom-inspector-overlay') return;
            lastTarget = target;

            // 移动进入时确保恢复光标
            document.body.style.cursor = 'crosshair';

            if (!highlightEl) {
                // 注入脉冲动画样式
                if (!document.getElementById('tcom-inspector-style')) {
                    const style = document.createElement('style');
                    style.id = 'tcom-inspector-style';
                    style.textContent = `
                        @keyframes tcom-pulse {
                            0% { box-shadow: 0 0 0 0 rgba(0, 122, 204, 0.7); }
                            70% { box-shadow: 0 0 0 15px rgba(0, 122, 204, 0); }
                            100% { box-shadow: 0 0 0 0 rgba(0, 122, 204, 0); }
                        }
                    `;
                    document.head.appendChild(style);
                }

                highlightEl = document.createElement('div');
                highlightEl.id = 'tcom-inspector-overlay';
                highlightEl.style.position = 'fixed';
                highlightEl.style.pointerEvents = 'none';
                highlightEl.style.zIndex = '2147483647';
                highlightEl.style.border = '2px solid #007acc';
                highlightEl.style.backgroundColor = 'rgba(0, 122, 204, 0.15)';
                highlightEl.style.whiteSpace = 'nowrap';
                highlightEl.style.transition = 'all 0.08s cubic-bezier(0.23, 1, 0.32, 1)';
                highlightEl.style.borderRadius = '4px';
                highlightEl.style.animation = 'tcom-pulse 1.5s infinite';

                document.body.appendChild(highlightEl);
            }

            const rect = target.getBoundingClientRect();
            highlightEl.style.top = `${rect.top}px`;
            highlightEl.style.left = `${rect.left}px`;
            highlightEl.style.width = `${rect.width}px`;
            highlightEl.style.height = `${rect.height}px`;
        }

        // 监测鼠标是否完全移出窗口边界
        function handleMouseOut(e: MouseEvent) {
            if (!e.relatedTarget || (e.relatedTarget as Node).nodeName === 'HTML') {
                removeHighlight();
            }
        }

        function handleClick(e: MouseEvent) {
            e.preventDefault();
            e.stopPropagation();

            if (lastTarget && api.componentPicked) {
                api.componentPicked({
                    className: lastTarget.className || '',
                    outerHTML: lastTarget.outerHTML.substring(0, 500),
                    tagName: lastTarget.tagName.toLowerCase()
                });
            }

            stopEverything();
            api.stopInspectorMode?.();
        }

        // ── 事件订阅 ──

        const unInspectorStart = (api as any).onInspectorStarted?.(() => {
            document.body.style.cursor = 'crosshair';
            window.addEventListener('mouseover', handleMouseOver, true);
            window.addEventListener('mouseout', handleMouseOut, true);
            window.addEventListener('click', handleClick, true);
            window.addEventListener('blur', removeHighlight, true);
        });

        const unInspectorStop = api.onInspectorStopped?.(() => {
            stopEverything();
        });

        return () => {
            unApplyPreview?.();
            unEditorClosed?.();
            unInspectorStart?.();
            unInspectorStop?.();
            stopEverything();
        };
    }, [availableThemes, config.theme]);
}
