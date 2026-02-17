import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectItem {
    label: string;
    value: string;
    description?: string;
    busy?: boolean;
    error?: string;
}

interface CustomSelectProps {
    items: SelectItem[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

export const CustomSelect = ({ items, value, onChange, disabled, placeholder }: CustomSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedItem = items.find(item => item.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 h-7 flex items-center justify-between outline-none focus:border-[var(--vscode-selection)] transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#454545]'}`}
            >
                <div className="flex items-center gap-1.5 truncate">
                    {selectedItem && (
                        <div
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedItem.busy ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]' : 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'}`}
                            title={selectedItem.busy ? `Occupied: ${selectedItem.error || 'Accessed by another program'}` : 'Available'}
                        />
                    )}
                    <span className="truncate">{selectedItem ? selectedItem.label : (placeholder || 'Select...')}</span>
                </div>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && !disabled && (
                <div className="absolute z-50 w-full mt-0.5 bg-[#252526] border border-[#454545] shadow-lg max-h-60 overflow-y-auto py-1">
                    {items.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => {
                                onChange(item.value);
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-2 py-1 flex items-center gap-2 hover:bg-[#2a2d2e] text-[13px] ${value === item.value ? 'bg-[#37373d] text-white' : 'text-[#cccccc]'}`}
                            title={item.busy ? `Occupied: ${item.error || 'Accessed by another program'}` : item.description || 'Available'}
                        >
                            <div
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.busy ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]' : 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'}`}
                                title={item.busy ? `Occupied: ${item.error || 'Accessed by another program'}` : 'Available'}
                            />
                            <span className="truncate flex-1">
                                {item.label}
                            </span>
                        </button>
                    ))}
                    {items.length === 0 && (
                        <div className="px-2 py-1 text-[11px] text-[#969696] italic text-center">
                            No items available
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
