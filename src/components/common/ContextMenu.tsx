import { useRef, useEffect } from 'react';

interface MenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    color?: string; // e.g. 'red'
    separator?: boolean;
}

interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
}

export const ContextMenu = ({ x, y, items, onClose }: Props) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // 仅监听菜单所在区域的滚动（冒泡），不使用 capture 避免干扰其他区域
        const handleScroll = (e: Event) => {
            // 忽略不包含右键菜单的滚动事件
            const target = e.target as HTMLElement;
            if (ref.current && target && target.contains?.(ref.current)) {
                onClose();
            }
        };
        // 使用 capture 模式确保在捕获阶段触发，不受子组件的 stopPropagation 影响
        window.addEventListener('mousedown', handleClickOutside, true);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', onClose);
        return () => {
            window.removeEventListener('mousedown', handleClickOutside, true);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);

    // Adjust position to viewport
    const style: React.CSSProperties = {
        top: y,
        left: x,
    };

    // Naive adjust: if too close to bottom/right, flip?
    // For now simple absolute pos.

    return (
        <div

            ref={ref}
            className="fixed z-[9999] bg-[var(--context-menu-bg)] border border-[var(--context-menu-border)] shadow-xl rounded-md py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
            style={style}
            data-component="context-menu"
        >
            {items.map((item, idx) => {
                if (item.separator) {
                    return <div key={idx} className="h-[1px] bg-[var(--context-menu-border)] my-1" />;
                }
                return (
                    <div
                        key={idx}
                        className={`px-3 py-1.5 text-[13px] hover:bg-[var(--context-menu-item-hover)] hover:text-[var(--st-contextmenu-text-hover)] cursor-pointer flex items-center gap-2 transition-colors ${item.color === 'red' ? 'text-[var(--st-error-text)]' : 'text-[var(--context-menu-text)]'}`}
                        onClick={() => {
                            item.onClick();
                            onClose();
                        }}
                    >
                        {item.icon && <span className="w-4 flex justify-center">{item.icon}</span>}
                        <span>{item.label}</span>
                    </div>
                );
            })}
        </div>
    );
};
