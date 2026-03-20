import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle, AlertCircle, Info as InfoIcon } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

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
    confirmText,
    cancelText,
    type = 'info',
    onResolve
}) => {
    const { t } = useI18n();
    const resolvedConfirmText = confirmText || t('common.ok');
    const resolvedCancelText = cancelText || t('common.cancel');
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        // Auto-focus cancel button to prevent accidental dangerous actions
        cancelRef.current?.focus();
    }, []);

    const getIcon = () => {
        switch (type) {
            case 'danger': return <AlertCircle className="text-[var(--st-status-error)]" size={24} />;
            case 'warning': return <AlertTriangle className="text-[var(--st-status-warning)]" size={24} />;
            default: return <InfoIcon className="text-[var(--st-status-info)]" size={24} />;
        }
    };

    const getConfirmColor = () => {
        switch (type) {
            case 'danger': return 'bg-[var(--st-settings-danger-bg)] hover:bg-[#c93f24]';
            default: return 'bg-[var(--st-status-info)] hover:bg-[#1177bb]';
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-[var(--st-dialog-content-bg)] border border-[var(--st-dialog-border)] shadow-2xl w-[420px] flex flex-col rounded-md overflow-hidden animate-in zoom-in-95 fade-in duration-300"
                onClick={e => e.stopPropagation()}
                data-component="dialog"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-2.5 border-b border-[var(--st-dialog-border)] bg-[var(--st-dialog-header-bg)]">
                    <span className="text-[11px] font-bold text-[var(--st-dialog-text)] uppercase tracking-wider">{title}</span>
                    <button onClick={() => onResolve(false)} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-icon-hover)] transition-colors">
                        <X size={14} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 flex gap-4 items-start min-h-[100px]">
                    <div className="shrink-0 mt-0.5">
                        {getIcon()}
                    </div>
                    <div className="flex-1">
                        <p className="text-[13px] text-[var(--st-dialog-text)] leading-relaxed whitespace-pre-wrap">{message}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-3 bg-[var(--st-dialog-footer-bg)] border-t border-[var(--st-dialog-border)]">
                    <button
                        ref={cancelRef}
                        onClick={() => onResolve(false)}
                        className="px-4 py-1.5 text-[var(--st-dialog-text)] hover:bg-[var(--st-dialog-header-bg)] rounded-sm text-xs transition-colors min-w-[70px]"
                    >
                        {resolvedCancelText}
                    </button>
                    <button
                        onClick={() => onResolve(true)}
                        className={`px-4 py-1.5 text-white rounded-sm text-xs transition-all min-w-[70px] ${getConfirmColor()}`}
                    >
                        {resolvedConfirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
