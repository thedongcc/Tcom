import React, { ReactNode, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface TooltipProps {
    content: ReactNode;
    children: ReactNode;
    position?: 'top' | 'right' | 'bottom' | 'left';
    delay?: number;
    className?: string;
    /** 额外的包裹层 class，用于控制 Tooltip 触发区域的布局 */
    wrapperClassName?: string;
    offset?: number;
}

export const Tooltip = ({
    content,
    children,
    position = 'right',
    delay = 300,
    className = '',
    wrapperClassName,
    offset = 8,
}: TooltipProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout>();

    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
            setIsVisible(true);
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsVisible(false);
    };

    useEffect(() => {
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, []);

    useEffect(() => {
        if (!isVisible) return;
        const update = () => {
            if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
        };
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [isVisible]);

    const getPositionStyle = (): React.CSSProperties => {
        if (!rect) return {};
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
        const center = rect.left + rect.width / 2;

        switch (position) {
            case 'right':
                return { top: rect.top + rect.height / 2, left: rect.right + offset, transform: 'translateY(-50%)' };
            case 'left':
                return { top: rect.top + rect.height / 2, left: rect.left - offset, transform: 'translate(-100%, -50%)' };
            case 'top':
                if (center > vw - 120)
                    return { top: rect.top - offset, right: Math.max(4, vw - rect.right), transform: 'translateY(-100%)' };
                if (center < 120)
                    return { top: rect.top - offset, left: Math.max(4, rect.left), transform: 'translateY(-100%)' };
                return { top: rect.top - offset, left: center, transform: 'translate(-50%, -100%)' };
            case 'bottom':
                if (center > vw - 120)
                    return { top: rect.bottom + offset, right: Math.max(4, vw - rect.right), transform: 'none' };
                if (center < 120)
                    return { top: rect.bottom + offset, left: Math.max(4, rect.left), transform: 'none' };
                return { top: rect.bottom + offset, left: center, transform: 'translateX(-50%)' };
            default:
                return {};
        }
    };

    /**
     * 渲染策略：
     * - 有 wrapperClassName → span 包裹（保持子元素原始样式/布局不变）
     * - 无 wrapperClassName + 子元素是合法 ReactElement → cloneElement 透明注入（零额外 DOM）
     * - 其它情况 → span 包裹（默认 inline-flex）
     */
    let triggerNode: ReactNode;

    if (wrapperClassName) {
        triggerNode = (
            <div
                ref={triggerRef as React.RefObject<HTMLDivElement>}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                className={wrapperClassName}
            >
                {children}
            </div>
        );
    } else if (React.isValidElement(children)) {
        const origEnter = (children.props as any).onMouseEnter;
        const origLeave = (children.props as any).onMouseLeave;
        triggerNode = React.cloneElement(children as React.ReactElement<any>, {
            ref: (node: any) => {
                (triggerRef as any).current = node;
                const origRef = (children as any).ref;
                if (typeof origRef === 'function') origRef(node);
                else if (origRef) origRef.current = node;
            },
            onMouseEnter: (e: any) => { showTooltip(); if (origEnter) origEnter(e); },
            onMouseLeave: (e: any) => { hideTooltip(); if (origLeave) origLeave(e); },
        });
    } else {
        triggerNode = (
            <span
                ref={triggerRef as React.RefObject<HTMLSpanElement>}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                className="inline-flex items-center justify-center"
            >
                {children}
            </span>
        );
    }

    return (
        <>
            {triggerNode}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isVisible && content && (
                        <div style={getPositionStyle()} className="fixed z-[9999] pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.12 }}
                                className={`px-2 py-1 text-[12px] font-medium rounded shadow-md whitespace-nowrap bg-[var(--menu-background)] text-[var(--app-foreground)] border border-[var(--menu-border-color)] ${className}`}
                            >
                                {content}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};
