import { useState, useEffect } from 'react';
import { Cpu, MemoryStick, RefreshCw, Github, ArrowDownCircle } from 'lucide-react';

export const StatusBar = () => {
    const [version, setVersion] = useState('');
    const [cpu, setCpu] = useState(0);
    const [memUsed, setMemUsed] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<string | null>(null);

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
            if (data.type === 'checking') setUpdateStatus('Checking...');
            else if (data.type === 'available') setUpdateStatus(`v${data.version} available!`);
            else if (data.type === 'not-available') {
                setUpdateStatus('Up to date');
                setTimeout(() => setUpdateStatus(null), 3000);
            }
            else if (data.type === 'downloaded') setUpdateStatus('Ready to install');
            else if (data.type === 'error') {
                setUpdateStatus('Update failed');
                setTimeout(() => setUpdateStatus(null), 3000);
            }
        });
        return () => cleanup?.();
    }, []);

    const handleCheckUpdate = () => {
        setUpdateStatus('Checking...');
        window.updateAPI?.check().catch(() => setUpdateStatus('Check failed'));
    };

    const openGitHub = () => {
        window.shellAPI?.openExternal('https://github.com/thedongcc/Tcom');
    };

    return (
        <div className="h-[22px] bg-[var(--vscode-statusbar)] flex items-center justify-between px-2 text-[11px] text-[var(--vscode-fg)] select-none cursor-default shrink-0 border-t border-[var(--vscode-border)]">
            {/* Left Section */}
            <div className="flex items-center gap-3">
                {/* Version (leftmost) */}
                <div className="flex items-center gap-1 px-1 rounded-sm opacity-70">
                    <span>v{version || '...'}</span>
                </div>

                <div className="w-[1px] h-3 bg-[var(--vscode-fg)] opacity-15" />

                {/* CPU */}
                <div className="flex items-center gap-1 px-1 rounded-sm" title={`App CPU Usage: ${cpu}%`}>
                    <Cpu size={11} className="opacity-60" />
                    <span className={cpu > 30 ? 'text-[#f48771]' : 'opacity-80'}>{cpu}%</span>
                </div>

                {/* Memory */}
                <div className="flex items-center gap-1 px-1 rounded-sm" title={`App Memory (RSS): ${memUsed} MB`}>
                    <MemoryStick size={11} className="opacity-60" />
                    <span className={memUsed > 500 ? 'text-[#f48771]' : 'opacity-80'}>{memUsed} MB</span>
                </div>

                <div className="w-[1px] h-3 bg-[var(--vscode-fg)] opacity-15" />

                {/* Check Update */}
                <div
                    className="flex items-center gap-1 px-1 rounded-sm hover:bg-[var(--vscode-hover)] cursor-pointer transition-colors"
                    onClick={handleCheckUpdate}
                    title="Check for updates"
                >
                    {updateStatus ? (
                        <>
                            <ArrowDownCircle size={11} />
                            <span>{updateStatus}</span>
                        </>
                    ) : (
                        <>
                            <RefreshCw size={10} className="opacity-60" />
                            <span className="opacity-80">Check Update</span>
                        </>
                    )}
                </div>

                <div className="w-[1px] h-3 bg-[var(--vscode-fg)] opacity-15" />

                {/* GitHub */}
                <div
                    className="flex items-center gap-1 px-1 rounded-sm hover:bg-[var(--vscode-hover)] cursor-pointer transition-colors"
                    onClick={openGitHub}
                    title="Open project on GitHub"
                >
                    <Github size={11} className="opacity-60" />
                    <span className="opacity-80">GitHub</span>
                </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-3 opacity-50">
                <span>Created by Thedong</span>
            </div>
        </div>
    );
};
