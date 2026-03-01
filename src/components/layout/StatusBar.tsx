import { useState, useEffect } from 'react';
import { Cpu, MemoryStick, RefreshCw, Github, ArrowDownCircle } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

export const StatusBar = () => {
    const [version, setVersion] = useState('');
    const [cpu, setCpu] = useState(0);
    const [memUsed, setMemUsed] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<string | null>(null);
    const { t } = useI18n();

    // Get version on mount
    useEffect(() => {
        window.updateAPI?.getVersion().then(v => setVersion(v)).catch(() => setVersion('?'));
    }, []);

    // Poll app-specific stats every 3s
    useEffect(() => {
        const fetchStats = () => {
            window.updateAPI?.getStats().then(stats => {
                setCpu(stats.cpu);
                setMemUsed(stats.memUsed);
            }).catch(() => { });
        };
        fetchStats();
        const interval = setInterval(fetchStats, 3000);
        return () => clearInterval(interval);
    }, []);

    // Listen for update status
    useEffect(() => {
        const cleanup = window.updateAPI?.onStatus((data) => {
            if (data.type === 'checking') setUpdateStatus(t('statusBar.checking'));
            else if (data.type === 'available') setUpdateStatus(`v${data.version} ${t('statusBar.available')}`);
            else if (data.type === 'not-available') {
                setUpdateStatus(t('statusBar.upToDate'));
                setTimeout(() => setUpdateStatus(null), 3000);
            }
            else if (data.type === 'downloaded') setUpdateStatus(t('statusBar.readyToInstall'));
            else if (data.type === 'error') {
                setUpdateStatus(t('statusBar.updateFailed'));
                setTimeout(() => setUpdateStatus(null), 3000);
            }
        });
        return () => cleanup?.();
    }, [t]);

    const handleCheckUpdate = () => {
        setUpdateStatus(t('statusBar.checking'));
        window.updateAPI?.check().catch(() => setUpdateStatus(t('statusBar.checkFailed')));
    };

    const openGitHub = () => {
        window.shellAPI?.openExternal('https://github.com/thedongcc/Tcom');
    };

    return (
        <div className="h-[22px] bg-[var(--statusbar-background)] flex items-center justify-between px-2 text-[11px] text-[var(--app-foreground)] select-none cursor-default shrink-0 border-t border-[var(--border-color)]">
            {/* Left Section */}
            <div className="flex items-center gap-3">
                {/* Version (leftmost) */}
                <div className="flex items-center gap-1 px-1 rounded-sm opacity-70">
                    <span>v{version || '...'}</span>
                </div>

                <div className="w-[1px] h-3 bg-[var(--app-foreground)] opacity-15" />

                {/* CPU */}
                <Tooltip content={t('statusBar.cpuUsage').replace('{val}', String(cpu))} position="top" wrapperClassName="h-full flex items-center">
                    <div className="flex items-center gap-1 px-1 rounded-sm">
                        <Cpu size={11} className="opacity-60" />
                        <span className={cpu > 30 ? 'text-[#f48771]' : 'opacity-80'}>{cpu}%</span>
                    </div>
                </Tooltip>

                {/* Memory */}
                <Tooltip content={t('statusBar.memUsage').replace('{val}', String(memUsed))} position="top" wrapperClassName="h-full flex items-center">
                    <div className="flex items-center gap-1 px-1 rounded-sm">
                        <MemoryStick size={11} className="opacity-60" />
                        <span className={memUsed > 500 ? 'text-[#f48771]' : 'opacity-80'}>{memUsed} MB</span>
                    </div>
                </Tooltip>

                <div className="w-[1px] h-3 bg-[var(--app-foreground)] opacity-15" />

                {/* Check Update */}
                <Tooltip content={t('statusBar.checkUpdate')} position="top" wrapperClassName="h-full flex items-center">
                    <div
                        className="flex items-center gap-1 px-1 rounded-sm hover:bg-[var(--hover-background)] cursor-pointer transition-colors"
                        onClick={handleCheckUpdate}
                    >
                        {updateStatus ? (
                            <>
                                <ArrowDownCircle size={11} />
                                <span>{updateStatus}</span>
                            </>
                        ) : (
                            <>
                                <RefreshCw size={10} className="opacity-60" />
                                <span className="opacity-80">{t('statusBar.checkUpdate')}</span>
                            </>
                        )}
                    </div>
                </Tooltip>

                <div className="w-[1px] h-3 bg-[var(--app-foreground)] opacity-15" />

                {/* GitHub */}
                <Tooltip content={t('statusBar.openGithub')} position="top" wrapperClassName="h-full flex items-center">
                    <div
                        className="flex items-center gap-1 px-1 rounded-sm hover:bg-[var(--hover-background)] cursor-pointer transition-colors"
                        onClick={openGitHub}
                    >
                        <Github size={11} className="opacity-60" />
                        <span className="opacity-80">GitHub</span>
                    </div>
                </Tooltip>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-3 opacity-50">
                <span>Created by Thedong</span>
            </div>
        </div>
    );
};
