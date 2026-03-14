/**
 * tooltipPositioning.ts
 * Tooltip 定位计算 — 从 Tooltip.tsx 中提取。
 * 根据触发元素的 DOMRect 和期望方向计算定位样式，
 * 自动处理边界溢出（翻转方向、偏移修正）。
 */
import React from 'react';

type Position = 'top' | 'right' | 'bottom' | 'left';

/**
 * 根据目标元素 rect 和方向计算 Tooltip 绝对定位样式
 */
export function computeTooltipPosition(
    rect: DOMRect,
    position: Position,
    offset: number
): React.CSSProperties {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1000;
    const center = rect.left + rect.width / 2;
    const middle = rect.top + rect.height / 2;

    let style: React.CSSProperties = {};

    switch (position) {
        case 'right':
            style = { top: middle, left: rect.right + offset, transform: 'translateY(-50%)' };
            // 防止右侧溢出：强制反转到左侧
            if (rect.right + offset + 200 > vw) {
                style = { top: middle, right: vw - rect.left + offset, left: 'auto', transform: 'translateY(-50%)' };
            }
            break;
        case 'left':
            style = { top: middle, right: vw - rect.left + offset, left: 'auto', transform: 'translateY(-50%)' };
            if (rect.left - offset - 200 < 0) {
                style = { top: middle, left: rect.right + offset, right: 'auto', transform: 'translateY(-50%)' };
            }
            break;
        case 'top':
            style = { top: rect.top - offset, left: center, transform: 'translate(-50%, -100%)' };
            if (center > vw - 150) {
                style = { top: rect.top - offset, right: Math.max(4, vw - rect.right), left: 'auto', transform: 'translateY(-100%)' };
            } else if (center < 150) {
                style = { top: rect.top - offset, left: Math.max(4, rect.left), transform: 'translateY(-100%)' };
            }
            // 防止顶部溢出
            if (rect.top - offset - 50 < 0) {
                style.top = rect.bottom + offset;
                style.transform = style.transform?.replace('-100%', '0%');
            }
            break;
        case 'bottom':
            style = { top: rect.bottom + offset, left: center, transform: 'translateX(-50%)' };
            if (center > vw - 150) {
                style = { top: rect.bottom + offset, right: Math.max(4, vw - rect.right), left: 'auto', transform: 'none' };
            } else if (center < 150) {
                style = { top: rect.bottom + offset, left: Math.max(4, rect.left), transform: 'none' };
            }
            // 防止底部溢出
            if (rect.bottom + offset + 50 > vh) {
                style.top = rect.top - offset;
                style.transform = style.transform?.includes('translateX')
                    ? 'translate(-50%, -100%)'
                    : 'translateY(-100%)';
            }
            break;
        default:
            break;
    }

    style.zIndex = 99999;
    return style;
}
