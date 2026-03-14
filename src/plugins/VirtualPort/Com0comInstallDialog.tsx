/**
 * Com0comInstallDialog.tsx
 * com0com 安装方式选择对话框。
 * 从 VirtualPortSidebar.tsx 中拆分出来。
 */
import React from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

interface Com0comInstallDialogProps {
    onClose: () => void;
}

export const Com0comInstallDialog = React.memo(({ onClose }: Com0comInstallDialogProps) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-[var(--menu-background)] border border-[var(--menu-border-color)] shadow-2xl w-[400px] flex flex-col rounded-md overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-2.5 border-b border-[var(--border-color)] bg-[var(--widget-background)]">
                    <span className="text-[11px] font-bold text-[var(--app-foreground)] uppercase tracking-wider">{t('monitor.installMethodTitle')}</span>
                    <button onClick={onClose} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors">
                        <X size={14} />
                    </button>
                </div>
                <div className="p-5 flex gap-4 items-start">
                    <div className="shrink-0 mt-0.5"><AlertCircle className="text-[var(--accent-color)]" size={24} /></div>
                    <div className="flex-1">
                        <p className="text-[13px] text-[var(--app-foreground)] leading-relaxed whitespace-pre-wrap">{t('monitor.installMethodDesc')}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 p-3 bg-[var(--app-background)] border-t border-[var(--border-color)]">
                    <button
                        onClick={async () => { onClose(); window.shellAPI?.openExternal('https://com0com.sourceforge.net/'); }}
                        className="px-4 py-1.5 text-[var(--app-foreground)] hover:bg-[var(--hover-background)] border border-[var(--border-color)] rounded-sm text-xs transition-colors"
                    >
                        {t('monitor.websiteDownload')}
                    </button>
                    <button
                        onClick={async () => {
                            onClose();
                            const res = await window.com0comAPI?.launchInstaller();
                            if (!res?.success) { showToast(res?.error || 'Launch failed', 'error'); }
                        }}
                        className="px-4 py-1.5 text-[var(--button-foreground)] bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] rounded-sm text-xs transition-all"
                    >
                        {t('monitor.builtinInstall')}
                    </button>
                </div>
            </div>
        </div>
    );
});

Com0comInstallDialog.displayName = 'Com0comInstallDialog';
