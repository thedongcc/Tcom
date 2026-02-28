import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

// 全局 portal 容器，避免被父容器 overflow:hidden 截断
function getPortalContainer(): HTMLElement {
    let el = document.getElementById('custom-select-portal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'custom-select-portal';
        document.body.appendChild(el);
    }
    return el;
}

export interface SelectItem {
    label: string;
    value: string;
    description?: string;
    busy?: boolean;
    error?: string;
    disabled?: boolean;
}

interface CustomSelectProps {
    items: SelectItem[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    showStatus?: boolean;
    allowCustom?: boolean;
    className?: string;
    dropdownWidth?: number | string;
}

export const CustomSelect = ({ items, value, onChange, disabled, placeholder, showStatus = false, allowCustom = false, className = '', dropdownWidth }: CustomSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isCustomInput, setIsCustomInput] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [scrollRatio, setScrollRatio] = useState(0);
    const [thumbHeight, setThumbHeight] = useState(0);
    const selectedRef = useRef<HTMLButtonElement>(null);
    const [hoveredValue, setHoveredValue] = useState<string | null>(null);
    const [isScrolling, setIsScrolling] = useState(false);
    const [lastCustomValue, setLastCustomValue] = useState<string>(() => {
        return items.some(i => i.value === value) ? '' : value;
    });
    // 用于 fixed 定位的下拉菜单位置
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const selectedItem = items.find(item => item.value === value);

    // 计算下拉菜单的 fixed 定位坐标
    const updateDropdownPosition = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const dropdownMaxH = 240; // max-h-60 = 240px
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        // 优先向下展开，空间不足时向上
        if (spaceBelow >= dropdownMaxH || spaceBelow >= spaceAbove) {
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 2,
                left: rect.left,
                width: dropdownWidth || rect.width,
                minWidth: rect.width,
                zIndex: 9999,
            });
        } else {
            setDropdownStyle({
                position: 'fixed',
                bottom: viewportHeight - rect.top + 2,
                left: rect.left,
                width: dropdownWidth || rect.width,
                minWidth: rect.width,
                zIndex: 9999,
            });
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                // 也检查下拉菜单 portal 区域
                const portal = document.getElementById('custom-select-portal');
                if (portal && portal.contains(event.target as Node)) return;
                setIsOpen(false);
                if (isCustomInput) {
                    if (inputRef.current) {
                        const val = inputRef.current.value;
                        setLastCustomValue(val);
                        onChange(val);
                    }
                    setIsCustomInput(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isCustomInput, onChange]);

    useEffect(() => {
        if (isCustomInput && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isCustomInput]);

    // 当下拉打开时更新位置，并监听滚动/resize
    useEffect(() => {
        if (isOpen) {
            updateDropdownPosition();
            const handleScroll = () => updateDropdownPosition();
            const handleResize = () => updateDropdownPosition();
            window.addEventListener('scroll', handleScroll, true);
            window.addEventListener('resize', handleResize);
            return () => {
                window.removeEventListener('scroll', handleScroll, true);
                window.removeEventListener('resize', handleResize);
            };
        }
    }, [isOpen]);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const ratio = scrollTop / (scrollHeight - clientHeight);
        setScrollRatio(ratio);
        setThumbHeight(Math.max((clientHeight / scrollHeight) * clientHeight, 35));
        setIsScrolling(true);
        const timer = setTimeout(() => setIsScrolling(false), 1000);
        return () => clearTimeout(timer);
    };

    useEffect(() => {
        if (isOpen && scrollRef.current) {
            handleScroll();
            if (selectedRef.current) {
                setTimeout(() => {
                    selectedRef.current?.scrollIntoView({ block: 'center' });
                }, 10);
            }
        } else {
            setHoveredValue(null);
        }
    }, [isOpen]);

    // 下拉菜单内容（渲染到 fixed 层）
    const dropdownContent = isOpen && !disabled ? (
        <div
            style={{
                ...dropdownStyle,
                backgroundColor: 'var(--dropdown-background)',
                border: '1px solid var(--dropdown-border-color)',
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}
            className="group/menu"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseLeave={() => setHoveredValue(null)}
        >
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="max-h-60 overflow-y-auto w-full scrollbar-none"
            >
                <style dangerouslySetInnerHTML={{
                    __html: `
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                    .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
                `}} />
                <div className="flex flex-col w-full">
                    {allowCustom && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsCustomInput(true);
                                setIsOpen(false);
                            }}
                            style={{
                                borderBottom: '1px solid var(--dropdown-border-color)',
                                backgroundColor: hoveredValue === '__custom__' ? 'var(--dropdown-item-hover-background)' : ''
                            }}
                            className="w-full h-7 text-left px-3 flex items-center gap-2 transition-colors border-none outline-none mb-0.5 text-[var(--input-placeholder-color)] italic"
                            onMouseEnter={() => setHoveredValue('__custom__')}
                        >
                            <span className="overflow-hidden text-ellipsis whitespace-pre flex-1 py-0.5">{lastCustomValue ? `Custom: ${lastCustomValue}` : 'Custom...'}</span>
                        </button>
                    )}
                    {items.map((item, index) => {
                        const isSelected = value === item.value;
                        const isHovered = hoveredValue === item.value;
                        const showHighlight = isHovered || (hoveredValue === null && isSelected);

                        return (
                            <button
                                key={`${item.value}-${index}`}
                                ref={isSelected ? selectedRef : null}
                                type="button"
                                disabled={item.disabled}
                                onClick={() => {
                                    if (item.disabled) return;
                                    onChange(item.value);
                                    setIsOpen(false);
                                }}
                                style={{
                                    color: isSelected
                                        ? 'var(--dropdown-item-selected-foreground)'
                                        : 'var(--app-foreground)',
                                    backgroundColor: showHighlight && !item.disabled ? 'var(--dropdown-item-hover-background)' : '',
                                }}
                                className={`w-full h-7 text-left px-3 flex items-center gap-2 transition-colors border-none outline-none text-[12px] font-normal ${item.disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                                onMouseEnter={() => {
                                    if (!item.disabled) setHoveredValue(item.value);
                                }}
                            >
                                {showStatus && (
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.busy ? 'bg-red-500' : 'bg-green-500'}`} />
                                )}
                                <span className="overflow-hidden text-ellipsis whitespace-pre flex-1 py-0.5">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 手动绝对定位的真·悬浮滑块 */}
            {(items.length + (allowCustom ? 1 : 0)) > 5 && (
                <div
                    className={`absolute right-[2px] transition-opacity duration-300 pointer-events-none ${isScrolling ? 'opacity-100' : 'opacity-0 group-hover/menu:opacity-60'}`}
                    style={{
                        top: `${scrollRatio * (Math.min((items.length + (allowCustom ? 1 : 0)) * 28, 240) - thumbHeight)}px`,
                        height: `${thumbHeight}px`,
                        width: '4px',
                        backgroundColor: 'var(--scrollbar-slider-hover-color)',
                        borderRadius: '4px',
                    }}
                />
            )}

            {items.length === 0 && !allowCustom && (
                <div
                    className="px-3 py-2 text-[11px] italic text-center"
                    style={{ color: 'var(--input-placeholder-color)' }}
                >
                    No items available
                </div>
            )}
        </div>
    ) : null;

    return (
        <div ref={containerRef} className={`relative w-full text-[13px] ${className}`}>
            {isCustomInput ? (
                <div
                    className="w-full h-7 flex items-center rounded-[4px] overflow-hidden"
                    style={{
                        backgroundColor: 'var(--input-background)',
                        border: '1px solid var(--focus-border-color)',
                        color: 'var(--input-foreground)',
                    }}
                >
                    <input
                        ref={inputRef}
                        type="text"
                        defaultValue={items.find(i => i.value === value) ? lastCustomValue : value}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const val = e.currentTarget.value;
                                setLastCustomValue(val);
                                onChange(val);
                                setIsCustomInput(false);
                            } else if (e.key === 'Escape') {
                                setIsCustomInput(false);
                            }
                        }}
                        onBlur={(e) => {
                            const val = e.target.value;
                            setLastCustomValue(val);
                            onChange(val);
                            setIsCustomInput(false);
                        }}
                        className="w-full bg-transparent border-none outline-none px-2 h-full text-[13px]"
                        style={{ color: 'var(--input-foreground)' }}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                        if (!isOpen) updateDropdownPosition();
                        setIsOpen(!isOpen);
                    }}
                    style={{
                        backgroundColor: 'var(--input-background)',
                        border: '1px solid var(--input-border-color)',
                        color: 'var(--input-foreground)',
                    }}
                    className={`w-full px-2 h-7 flex items-center justify-between outline-none rounded-[4px] transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onMouseEnter={e => {
                        if (!disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover-background)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--input-background)';
                    }}
                    onFocus={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--focus-border-color)';
                    }}
                    onBlur={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--input-border-color)';
                    }}
                >
                    <div className="flex items-center gap-1.5 truncate">
                        {showStatus && selectedItem && (
                            <div
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedItem.busy ? 'bg-red-500' : 'bg-green-500'}`}
                            />
                        )}
                        <span className="overflow-hidden text-ellipsis whitespace-pre">
                            {selectedItem ? selectedItem.label : (allowCustom && value ? value : (placeholder || 'Select...'))}
                        </span>
                    </div>
                    <ChevronDown
                        size={14}
                        style={{ color: 'var(--input-placeholder-color)' }}
                        className={`transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                </button>
            )}

            {/* 使用 portal 渲染到 body，避免被父容器 overflow:hidden 截断 */}
            {dropdownContent && createPortal(dropdownContent, getPortalContainer())}
        </div>
    );
};
