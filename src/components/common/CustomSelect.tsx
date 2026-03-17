/**
 * CustomSelect.tsx
 * 自定义下拉选择组件 — 支持状态指示、自定义输入、Portal 渲染。
 *
 * 子模块：
 * - useDropdownPosition.ts — 下拉菜单 fixed 定位计算
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { useDropdownPosition } from './useDropdownPosition';

// 全局 portal 容器
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
    const [containerHeight, setContainerHeight] = useState(0);
    const selectedRef = useRef<HTMLButtonElement>(null);
    const [hoveredValue, setHoveredValue] = useState<string | null>(null);
    const [isScrolling, setIsScrolling] = useState(false);
    const [lastCustomValue, setLastCustomValue] = useState<string>(() => {
        return items.some(i => i.value === value) ? '' : value;
    });

    const selectedItem = items.find(item => item.value === value);

    // 下拉菜单定位
    const { dropdownStyle, updatePosition } = useDropdownPosition(containerRef as React.RefObject<HTMLElement>, isOpen, dropdownWidth);

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

    // 滚动条逻辑
    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const maxScroll = scrollHeight - clientHeight;
        const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
        setScrollRatio(ratio);
        setThumbHeight(Math.max((clientHeight / scrollHeight) * clientHeight, 35));
        setContainerHeight(clientHeight);
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

    // 下拉菜单内容
    const dropdownContent = isOpen && !disabled ? (
        <div
            style={{
                ...dropdownStyle,
                backgroundColor: 'var(--st-select-bg)',
                border: '1px solid var(--st-select-border)',
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}
            className="group/menu"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseLeave={() => setHoveredValue(null)}
            data-component="dropdown"
        >
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="overflow-y-auto w-full scrollbar-none"
                style={{ maxHeight: `${dropdownStyle.maxHeight}px` }}
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
                                borderBottom: '1px solid var(--st-select-border)',
                                backgroundColor: hoveredValue === '__custom__' ? 'var(--st-select-hover)' : ''
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

                        const buttonHtml = (
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
                                        ? 'var(--st-select-selected)'
                                        : 'var(--st-select-text)',
                                    backgroundColor: showHighlight && !item.disabled ? 'var(--st-select-hover)' : '',
                                    fontWeight: isSelected ? 600 : 'normal',
                                }}
                                className={`w-full h-7 text-left px-3 flex items-center gap-2 transition-colors border-none outline-none text-[12px] ${item.disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                                onMouseEnter={() => {
                                    if (!item.disabled) setHoveredValue(item.value);
                                }}
                            >
                                {showStatus && (
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.busy ? 'bg-[var(--st-status-error)]' : 'bg-[var(--st-status-success)]'}`} />
                                )}
                                <span className="overflow-hidden text-ellipsis whitespace-pre flex-1 py-0.5">{item.label}</span>
                            </button>
                        );

                        if (item.description) {
                            return (
                                <Tooltip key={`${item.value}-${index}`} content={item.description} position="left" wrapperClassName="w-full">
                                    {buttonHtml}
                                </Tooltip>
                            );
                        }
                        return buttonHtml;
                    })}
                </div>
            </div>

            {/* 悬浮滚动条 */}
            {(items.length + (allowCustom ? 1 : 0)) > 5 && (
                <div
                    className={`absolute right-[2px] transition-opacity duration-300 pointer-events-none ${isScrolling ? 'opacity-100' : 'opacity-0 group-hover/menu:opacity-60'}`}
                    style={{
                        top: `${scrollRatio * ((containerHeight || (dropdownStyle.maxHeight as number || 240)) - thumbHeight)}px`,
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
                        if (!isOpen) updatePosition();
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
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedItem.busy ? 'bg-[var(--st-status-error)]' : 'bg-[var(--st-status-success)]'}`}
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

            {dropdownContent && createPortal(dropdownContent, getPortalContainer())}
        </div>
    );
};
