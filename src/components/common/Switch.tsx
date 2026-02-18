import React from 'react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
    className?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled, className = "" }) => {
    return (
        <label
            className={`flex items-center justify-between group/switch cursor-pointer gap-4 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
            onClick={(e) => {
                if (!disabled) {
                    onChange(!checked);
                }
            }}
        >
            {label && (
                <span className="text-[11px] text-[#C0C0C0] group-hover/switch:text-[#ffffff] transition-colors select-none">
                    {label}
                </span>
            )}
            <div
                className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)] focus-visible:ring-offset-2 ${checked ? 'bg-[#0e639c]' : 'bg-[#3c3c3c]'}`}
            >
                <span
                    className={`pointer-events-none block h-3 w-3 rounded-full bg-white shadow-lg ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
                />
            </div>
        </label>
    );
};
