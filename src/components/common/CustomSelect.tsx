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
}

export const CustomSelect = ({ items, value, onChange, disabled, placeholder, showStatus = false, allowCustom = false }: CustomSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isCustomInput, setIsCustomInput] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [scrollRatio, setScrollRatio] = useState(0);
    const [thumbHeight, setThumbHeight] = useState(0);
    const [isScrolling, setIsScrolling] = useState(false);
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
                width: rect.width,
                zIndex: 9999,
            });
        } else {
            setDropdownStyle({
                position: 'fixed',
                bottom: viewportHeight - rect.top + 2,
                left: rect.left,
                width: rect.width,
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
                if (isCustomInput) setIsCustomInput(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isCustomInput]);

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
        }
    }, [isOpen]);

    // 下拉菜单内容（渲染到 fixed 层）
    const dropdownContent = isOpen && !disabled ? (
        <div
            style={dropdownStyle}
            className="bg-[#1f1f1f] border border-[#454545] shadow-[0_10px_30px_rgba(0,0,0,0.5)] rounded-[4px] overflow-hidden group/menu"
            onMouseDown={(e) => e.stopPropagation()}
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
                            className="w-full h-7 text-left px-3 flex items-center gap-2 transition-colors border-none outline-none hover:bg-[#094771] text-[#969696] italic border-b border-[#333333] mb-0.5"
                        >
                            <span className="truncate flex-1 py-0.5">Custom...</span>
                        </button>
                    )}
                    {items.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            disabled={item.disabled}
                            onClick={() => {
                                if (item.disabled) return;
                                onChange(item.value);
                                setIsOpen(false);
                            }}
                            className={`w-full h-7 text-left px-3 flex items-center gap-2 transition-colors border-none outline-none text-[12px] font-normal ${item.disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[#094771]'} ${value === item.value ? 'text-white' : 'text-[#cccccc]'}`}
                        >
                            {showStatus && (
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.busy ? 'bg-red-500' : 'bg-green-500'}`} />
                            )}
                            <span className="truncate flex-1 py-0.5">{item.label}</span>
                        </button>
                    ))}
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
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        borderRadius: '4px',
                    }}
                />
            )}

            {items.length === 0 && !allowCustom && (
                <div className="px-3 py-2 text-[11px] text-[#969696] italic text-center">
                    No items available
                </div>
            )}
        </div>
    ) : null;

    return (
        <div ref={containerRef} className="relative w-full text-[13px]">
            {isCustomInput ? (
                <div className="w-full bg-[#1e1e1e] border border-[var(--vscode-focusBorder)] text-[#cccccc] h-7 flex items-center rounded-[4px] overflow-hidden">
                    <input
                        ref={inputRef}
                        type="text"
                        defaultValue={value}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onChange(e.currentTarget.value);
                                setIsCustomInput(false);
                            } else if (e.key === 'Escape') {
                                setIsCustomInput(false);
                            }
                        }}
                        onBlur={(e) => {
                            onChange(e.target.value);
                            setIsCustomInput(false);
                        }}
                        className="w-full bg-transparent border-none outline-none px-2 h-full text-[13px] text-[#cccccc]"
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
                    className={`w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] px-2 h-7 flex items-center justify-between outline-none focus:border-[var(--vscode-focusBorder)] transition-all rounded-[4px] ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#454545]'}`}
                >
                    <div className="flex items-center gap-1.5 truncate">
                        {showStatus && selectedItem && (
                            <div
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedItem.busy ? 'bg-red-500' : 'bg-green-500'}`}
                            />
                        )}
                        <span className="truncate">
                            {selectedItem ? selectedItem.label : (allowCustom && value ? value : (placeholder || 'Select...'))}
                        </span>
                    </div>
                    <ChevronDown size={14} className={`text-[#969696] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            )}

            {/* 使用 portal 渲染到 body，避免被父容器 overflow:hidden 截断 */}
            {dropdownContent && createPortal(dropdownContent, getPortalContainer())}
        </div>
    );
};
