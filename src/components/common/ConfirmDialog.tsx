import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle, AlertCircle, Info as InfoIcon } from 'lucide-react';

export type ConfirmType = 'info' | 'warning' | 'danger';

interface ConfirmDialogProps {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: ConfirmType;
    onResolve: (value: boolean) => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    title,
    message,
    confirmText = '确定',
    cancelText = '取消',
    type = 'info',
    onResolve
}) => {
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        // Auto-focus cancel button to prevent accidental dangerous actions
        cancelRef.current?.focus();
    }, []);

    const getIcon = () => {
        switch (type) {
            case 'danger': return <AlertCircle className="text-[#f48771]" size={24} />;
            case 'warning': return <AlertTriangle className="text-[#eab308]" size={24} />;
            default: return <InfoIcon className="text-[#007acc]" size={24} />;
        }
    };

    const getConfirmColor = () => {
        switch (type) {
            case 'danger': return 'bg-[#a1260d] hover:bg-[#c93f24]';
            default: return 'bg-[#0e639c] hover:bg-[#1177bb]';
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-[#252526] border border-[#3c3c3c] shadow-2xl w-[420px] flex flex-col rounded-md overflow-hidden animate-in zoom-in-95 fade-in duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-2.5 border-b border-[#3c3c3c] bg-[#2d2d2d]">
                    <span className="text-[11px] font-bold text-[#cccccc] uppercase tracking-wider">{title}</span>
                    <button onClick={() => onResolve(false)} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors">
                        <X size={14} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 flex gap-4 items-start min-h-[100px]">
                    <div className="shrink-0 mt-0.5">
                        {getIcon()}
                    </div>
                    <div className="flex-1">
                        <p className="text-[13px] text-[#cccccc] leading-relaxed whitespace-pre-wrap">{message}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-3 bg-[#1e1e1e] border-t border-[#3c3c3c]">
                    <button
                        ref={cancelRef}
                        onClick={() => onResolve(false)}
                        className="px-4 py-1.5 text-[#cccccc] hover:bg-[#3c3c3c] rounded-sm text-xs transition-colors min-w-[70px]"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => onResolve(true)}
                        className={`px-4 py-1.5 text-white rounded-sm text-xs transition-all min-w-[70px] ${getConfirmColor()}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
