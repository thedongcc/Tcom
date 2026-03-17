/**
 * UpdateDialog.tsx
 * 软件更新对话框 — 检查、下载、安装更新。
 */
import { useState, useEffect } from 'react';
import { X, Download, Info, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { useI18n } from '../../context/I18nContext';

interface UpdateStatus {
    type: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'idle';
    version?: string;
    releaseNotes?: string;
    releaseDate?: string;
    error?: string;
    releaseUrl?: string;
}

interface ProgressInfo {
    percent: number;
    bytesPerSecond: number;
    total: number;
    transferred: number;
}

export const UpdateDialog = ({ onClose }: { onClose: () => void }) => {
    const { t } = useI18n();
    const [status, setStatus] = useState<UpdateStatus>({ type: 'idle' });
    const [progress, setProgress] = useState<ProgressInfo | null>(null);

    useEffect(() => {
        // 对话框打开时触发检查
        window.updateAPI.check().catch(err => {
            setStatus({ type: 'error', error: err.message, releaseUrl: 'https://github.com/thedongcc/Tcom/releases' });
        });

        const removeStatusListener = window.updateAPI.onStatus((data: unknown) => {
            const d = data as UpdateStatus;
            if (d.type === 'available' || d.type === 'downloaded' || d.type === 'error' || d.type === 'checking' || d.type === 'not-available') {
                setStatus(prev => ({ ...prev, ...d }));
            }
        });

        const removeProgressListener = window.updateAPI.onProgress((data: unknown) => {
            setProgress(data as ProgressInfo);
            setStatus(prev => ({ ...prev, type: 'downloading' }));
        });

        return () => {
            removeStatusListener();
            removeProgressListener();
        };
    }, []);

    const handleDownload = () => {
        window.updateAPI.download();
    };

    const handleInstall = () => {
        window.updateAPI.install();
    };

    const handleManualDownload = () => {
        if (status.releaseUrl && window.shellAPI) {
            window.shellAPI.openExternal(status.releaseUrl);
        } else if (window.shellAPI) {
            window.shellAPI.openExternal('https://github.com/thedongcc/Tcom/releases');
        }
    };

    const renderContent = () => {
        switch (status.type) {
            case 'checking':
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <Loader2 className="animate-spin text-[var(--st-update-spinner)]" size={32} />
                        <span className="text-[13px] text-[var(--st-update-text)]">{t('update.checking')}</span>
                    </div>
                );
            case 'not-available':
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <CheckCircle2 className="text-[var(--st-status-success)]" size={32} />
                        <span className="text-[13px] text-[var(--st-update-text)]">{t('update.upToDate', { version: status.version || '' })}</span>
                        <button onClick={onClose} className="px-4 py-1.5 bg-[var(--st-update-btn-bg)] text-[var(--st-update-btn-text)] rounded-sm text-xs hover:bg-[var(--st-update-btn-hover)]">{t('common.close')}</button>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <AlertCircle className="text-[var(--st-status-error)]" size={32} />
                        <div className="text-center">
                            <p className="text-[13px] text-[var(--st-update-text)]">{t('update.errorChecking')}</p>
                            <p className="text-[11px] text-[var(--st-status-error)] mt-1 max-w-[300px] break-words">{status.error}</p>
                            <p className="text-[11px] text-[var(--input-placeholder-color)] mt-2">{t('update.networkHint')}</p>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={handleManualDownload} className="px-4 py-1.5 bg-[var(--st-update-btn-bg)] text-[var(--st-update-btn-text)] rounded-sm text-xs hover:bg-[var(--st-update-btn-hover)] flex items-center gap-1">
                                <Download size={14} /> {t('update.manualDownload')}
                            </button>
                            <button onClick={onClose} className="px-4 py-1.5 bg-[var(--st-update-btn-bg)] text-[var(--st-update-btn-text)] rounded-sm text-xs hover:bg-[var(--st-update-btn-hover)]">{t('common.close')}</button>
                        </div>
                    </div>
                );
            case 'available':
                return (
                    <div className="flex flex-col gap-4 p-4">
                        <div className="flex items-start gap-3">
                            <Info className="text-[var(--st-status-info)] shrink-0" size={24} />
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[14px] font-bold text-[var(--st-dialog-text)]">{t('update.newVersion', { version: status.version || '' })}</h3>
                                <p className="text-[11px] text-[var(--st-dialog-muted-text)] mt-0.5">{t('update.releaseDate', { date: status.releaseDate ? new Date(status.releaseDate).toLocaleDateString() : t('update.releaseDateUnknown') })}</p>
                            </div>
                        </div>

                        <div className="bg-[var(--st-dialog-content-bg)] border border-[var(--st-dialog-border)] rounded-sm p-3 max-h-[200px] overflow-y-auto custom-scrollbar">
                            <h4 className="text-[12px] font-bold text-[var(--st-dialog-text)] mb-2">{t('update.changelog')}</h4>
                            <div
                                className="text-[12px] text-[var(--st-dialog-text)] leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none"
                                dangerouslySetInnerHTML={{ __html: status.releaseNotes || t('update.noChangelog') }}
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-2">
                            <button onClick={onClose} className="px-4 py-1.5 text-[var(--st-dialog-text)] hover:bg-[var(--st-update-btn-hover)] rounded-sm text-xs">{t('update.later')}</button>
                            <Tooltip content={t('update.manualHint')} position="bottom" wrapperClassName="flex">
                                <button onClick={handleManualDownload} className="px-4 py-1.5 text-[var(--st-dialog-text)] hover:bg-[var(--st-update-btn-hover)] rounded-sm text-xs flex items-center gap-1">
                                    {t('update.manualDownload')}
                                </button>
                            </Tooltip>
                            <button onClick={handleDownload} className="px-4 py-1.5 bg-[var(--st-status-info)] text-white rounded-sm text-xs hover:bg-[#0098ff] flex items-center gap-2">
                                <Download size={14} /> {t('update.downloadNow')}
                            </button>
                        </div>
                    </div>
                );
            case 'downloading':
                return (
                    <div className="flex flex-col gap-4 p-8">
                        <div className="flex justify-between text-[12px] text-[var(--st-dialog-text)]">
                            <span>{t('update.downloading')}</span>
                            <span>{progress?.percent.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--st-dialog-content-bg)] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[var(--st-status-info)] transition-all duration-300"
                                style={{ width: `${progress?.percent || 0}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[11px] text-[var(--st-dialog-muted-text)]">
                            <span>{((progress?.transferred || 0) / 1024 / 1024).toFixed(2)} MB / {((progress?.total || 0) / 1024 / 1024).toFixed(2)} MB</span>
                            <span>{((progress?.bytesPerSecond || 0) / 1024 / 1024).toFixed(2)} MB/s</span>
                        </div>
                        <div className="text-center mt-2">
                            <button onClick={handleManualDownload} className="text-[11px] text-[var(--st-dialog-muted-text)] hover:text-[var(--st-status-info)] underline">
                                {t('update.downloadSlow')}
                            </button>
                        </div>
                    </div>
                );
            case 'downloaded':
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <CheckCircle2 className="text-[var(--st-status-success)]" size={32} />
                        <div className="text-center">
                            <p className="text-[13px] text-[var(--st-dialog-text)]">{t('update.downloaded')}</p>
                            <p className="text-[11px] text-[var(--st-dialog-muted-text)] mt-1">{t('update.installHint')}</p>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={onClose} className="px-4 py-1.5 text-[var(--st-dialog-text)] hover:bg-[var(--st-update-btn-hover)] rounded-sm text-xs">{t('update.installLater')}</button>
                            <button onClick={handleInstall} className="px-4 py-1.5 bg-[var(--st-status-info)] text-white rounded-sm text-xs hover:bg-[#0098ff]">{t('update.installNow')}</button>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <Loader2 className="animate-spin text-[var(--st-status-info)]" size={32} />
                        <span className="text-[13px] text-[var(--st-dialog-text)]">{t('update.initializing')}</span>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="bg-[var(--st-popover-bg)] border border-[var(--st-popover-border)] shadow-2xl w-[450px] flex flex-col rounded-md overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-3 border-b border-[var(--st-dialog-border)] bg-[var(--st-dialog-header-bg)]">
                    <span className="text-xs font-bold text-[var(--st-dialog-text)] uppercase tracking-wider">{t('update.title')}</span>
                    <button onClick={onClose} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-icon-hover)] transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="min-h-[160px] flex flex-col justify-center">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};
