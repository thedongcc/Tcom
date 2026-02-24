import { useState, useEffect } from 'react';
import { X, Download, Info, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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
    const [status, setStatus] = useState<UpdateStatus>({ type: 'idle' });
    const [progress, setProgress] = useState<ProgressInfo | null>(null);

    useEffect(() => {
        // Initial check when dialog opens manually
        window.updateAPI.check().catch(err => {
            setStatus({ type: 'error', error: err.message, releaseUrl: 'https://github.com/thedongcc/Tcom/releases' });
        });

        const removeStatusListener = window.updateAPI.onStatus((data) => {
            console.log('Update Status:', data);
            if (data.type === 'available' || data.type === 'downloaded' || data.type === 'error' || data.type === 'checking' || data.type === 'not-available') {
                setStatus(prev => ({ ...prev, ...data }));
            }
            if (data.type === 'downloading') {
                // This might be sent via status or progress
            }
        });

        const removeProgressListener = window.updateAPI.onProgress((data) => {
            setProgress(data);
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
                        <Loader2 className="animate-spin text-[#007acc]" size={32} />
                        <span className="text-[13px] text-[#cccccc]">正在检查更新...</span>
                    </div>
                );
            case 'not-available':
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <CheckCircle2 className="text-green-500" size={32} />
                        <span className="text-[13px] text-[#cccccc]">您的软件已是最新版本 (v{status.version})</span>
                        <button onClick={onClose} className="px-4 py-1.5 bg-[#3c3c3c] text-white rounded-sm text-xs hover:bg-[#4c4c4c]">关闭</button>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <AlertCircle className="text-red-500" size={32} />
                        <div className="text-center">
                            <p className="text-[13px] text-[#cccccc]">检查更新时出错</p>
                            <p className="text-[11px] text-red-400 mt-1 max-w-[300px] break-words">{status.error}</p>
                            <p className="text-[11px] text-[#969696] mt-2">若是网络问题，请尝试手动下载</p>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={handleManualDownload} className="px-4 py-1.5 bg-[#3c3c3c] text-white rounded-sm text-xs hover:bg-[#4c4c4c] flex items-center gap-1">
                                <Download size={14} /> 手动下载
                            </button>
                            <button onClick={onClose} className="px-4 py-1.5 bg-[#3c3c3c] text-white rounded-sm text-xs hover:bg-[#4c4c4c]">关闭</button>
                        </div>
                    </div>
                );
            case 'available':
                return (
                    <div className="flex flex-col gap-4 p-4">
                        <div className="flex items-start gap-3">
                            <Info className="text-[#007acc] shrink-0" size={24} />
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[14px] font-bold text-white">发现新版本: v{status.version}</h3>
                                <p className="text-[11px] text-[#969696] mt-0.5">发布日期: {status.releaseDate ? new Date(status.releaseDate).toLocaleDateString() : '未知'}</p>
                            </div>
                        </div>

                        <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm p-3 max-h-[200px] overflow-y-auto custom-scrollbar">
                            <h4 className="text-[12px] font-bold text-[#cccccc] mb-2">更新日志:</h4>
                            <div
                                className="text-[12px] text-[#cccccc] leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none"
                                dangerouslySetInnerHTML={{ __html: status.releaseNotes || '暂无详细更新说明' }}
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-2">
                            <button onClick={onClose} className="px-4 py-1.5 text-[#cccccc] hover:bg-[#3c3c3c] rounded-sm text-xs">稍后再说</button>
                            <button onClick={handleManualDownload} className="px-4 py-1.5 text-[#cccccc] hover:bg-[#3c3c3c] rounded-sm text-xs flex items-center gap-1" title="若自动下载失败请尝试此选项">
                                手动下载
                            </button>
                            <button onClick={handleDownload} className="px-4 py-1.5 bg-[#007acc] text-white rounded-sm text-xs hover:bg-[#0098ff] flex items-center gap-2">
                                <Download size={14} /> 立即下载
                            </button>
                        </div>
                    </div>
                );
            case 'downloading':
                return (
                    <div className="flex flex-col gap-4 p-8">
                        <div className="flex justify-between text-[12px] text-[#cccccc]">
                            <span>正在下载更新...</span>
                            <span>{progress?.percent.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#007acc] transition-all duration-300"
                                style={{ width: `${progress?.percent || 0}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[11px] text-[#969696]">
                            <span>{((progress?.transferred || 0) / 1024 / 1024).toFixed(2)} MB / {((progress?.total || 0) / 1024 / 1024).toFixed(2)} MB</span>
                            <span>{((progress?.bytesPerSecond || 0) / 1024 / 1024).toFixed(2)} MB/s</span>
                        </div>
                        <div className="text-center mt-2">
                            <button onClick={handleManualDownload} className="text-[11px] text-[#666] hover:text-[#007acc] underline">
                                下载太慢或失败？尝试手动下载
                            </button>
                        </div>
                    </div>
                );
            case 'downloaded':
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <CheckCircle2 className="text-green-500" size={32} />
                        <div className="text-center">
                            <p className="text-[13px] text-[#cccccc]">更新已下载完成</p>
                            <p className="text-[11px] text-[#969696] mt-1">软件将自动关闭并开始安装更新</p>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={onClose} className="px-4 py-1.5 text-[#cccccc] hover:bg-[#3c3c3c] rounded-sm text-xs">稍后安装</button>
                            <button onClick={handleInstall} className="px-4 py-1.5 bg-[#007acc] text-white rounded-sm text-xs hover:bg-[#0098ff]">立即重启并安装</button>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <Loader2 className="animate-spin text-[#007acc]" size={32} />
                        <span className="text-[13px] text-[#cccccc]">正在初始化...</span>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="bg-[#252526] border border-[#3c3c3c] shadow-2xl w-[450px] flex flex-col rounded-md overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-3 border-b border-[#3c3c3c] bg-[#2d2d2d]">
                    <span className="text-xs font-bold text-[#cccccc] uppercase tracking-wider">软件更新</span>
                    <button onClick={onClose} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] transition-colors">
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
