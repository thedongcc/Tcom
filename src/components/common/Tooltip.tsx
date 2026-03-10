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
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1000;
        const center = rect.left + rect.width / 2;
        const middle = rect.top + rect.height / 2;

        let style: React.CSSProperties = {};

        // 我们将以像素绝对定位赋予 Tooltip，并借助 CSS max-width 预估范围，
        // 实际上 framer-motion 会渲染它，这里先给出大致安全区的 transform 和定位点。
        switch (position) {
            case 'right':
                style = { top: middle, left: rect.right + offset, transform: 'translateY(-50%)' };
                // 防止右侧溢出：如果距离右侧不够，就强制反转到左侧
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

        // 附加最大的安全 z-index 以保证穿透所有面板层级
        style.zIndex = 99999;
        return style;
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
                        <div style={getPositionStyle()} className="fixed z-[99999] pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.12 }}
                                className={`px-2 py-1 text-[12px] font-medium rounded shadow-lg bg-[var(--st-tooltip-bg)] text-[var(--st-tooltip-text)] border border-[var(--st-tooltip-border)] max-w-[300px] whitespace-normal break-words text-left leading-relaxed backdrop-blur-md ${className}`}
                                style={{ textWrap: 'balance' }}
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
