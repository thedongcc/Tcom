/**
 * useDropdownPosition.ts
 * 下拉菜单定位 Hook — 计算 fixed 定位坐标以避免被父容器 overflow:hidden 截断。
 * 从 CustomSelect.tsx 中拆分出来。
 */
import { useState, useEffect, useCallback, RefObject } from 'react';

interface DropdownPositionStyle {
    position: 'fixed';
    top?: number;
    bottom?: number;
    left: number;
    width: number | string;
    minWidth: number;
    maxHeight: number;
    zIndex: number;
}

export function useDropdownPosition(
    containerRef: RefObject<HTMLElement>,
    isOpen: boolean,
    dropdownWidth?: number | string,
) {
    const [dropdownStyle, setDropdownStyle] = useState<DropdownPositionStyle>({
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        minWidth: 0,
        maxHeight: 240,
        zIndex: 999999,
    });

    const updatePosition = useCallback(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const defaultMaxH = 240;
        const spaceBelow = viewportHeight - rect.bottom - 10;
        const spaceAbove = rect.top - 10;

        let top: number | undefined;
        let bottom: number | undefined;
        let maxHeight = defaultMaxH;

        // 优先向下展开
        if (spaceBelow >= defaultMaxH || spaceBelow > spaceAbove) {
            top = rect.bottom + 2;
            maxHeight = Math.min(defaultMaxH, Math.max(0, spaceBelow));
        } else {
            // 向上展开，使用 bottom 定位，紧贴元素的上边缘
            bottom = viewportHeight - rect.top + 2;
            maxHeight = Math.min(defaultMaxH, Math.max(0, spaceAbove));
        }

        setDropdownStyle({
            position: 'fixed',
            ...(top !== undefined ? { top } : {}),
            ...(bottom !== undefined ? { bottom } : {}),
            left: rect.left,
            width: dropdownWidth || rect.width,
            minWidth: rect.width,
            maxHeight,
            zIndex: 999999,
        });
    }, [containerRef, dropdownWidth]);

    // 当下拉打开时更新位置，并监听滚动/resize
    useEffect(() => {
        if (isOpen) {
            updatePosition();
            const handler = () => updatePosition();
            window.addEventListener('scroll', handler, true);
            window.addEventListener('resize', handler);
            return () => {
                window.removeEventListener('scroll', handler, true);
                window.removeEventListener('resize', handler);
            };
        }
    }, [isOpen, updatePosition]);

    return { dropdownStyle, updatePosition };
}
