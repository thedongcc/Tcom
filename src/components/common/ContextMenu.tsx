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
        // Also close on scroll or window resize
        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', onClose, true);
        window.addEventListener('resize', onClose);
        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', onClose, true);
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
            className="fixed z-[9999] bg-[var(--menu-background)] border border-[var(--menu-border-color)] shadow-xl rounded-md py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
            style={style}
        >
            {items.map((item, idx) => {
                if (item.separator) {
                    return <div key={idx} className="h-[1px] bg-[var(--menu-border-color)] my-1" />;
                }
                return (
                    <div
                        key={idx}
                        className={`px-3 py-1.5 text-[13px] hover:bg-[var(--list-hover-background)] hover:text-[var(--app-foreground)] cursor-pointer flex items-center gap-2 transition-colors ${item.color === 'red' ? 'text-[var(--st-error-text)]' : 'text-[var(--menu-foreground)]'}`}
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
