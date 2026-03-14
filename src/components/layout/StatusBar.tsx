import { useState, useEffect } from 'react';
import { Cpu, MemoryStick, RefreshCw, Github, ArrowDownCircle } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

interface StatusBarProps {
    /** 是否检测到可用更新 */
    hasUpdate?: boolean;
    /** 可用更新的版本号 */
    updateVersion?: string;
    /** 用户点击更新区域时调用 */
    onShowUpdate?: () => void;
}

export const StatusBar = ({ hasUpdate = false, updateVersion, onShowUpdate }: StatusBarProps) => {
    const [version, setVersion] = useState('');
    const [cpu, setCpu] = useState(0);
    const [memUsed, setMemUsed] = useState(0);
    // 临时状态文本（checking / up-to-date / error 等短暂提示）
    const [transientStatus, setTransientStatus] = useState<string | null>(null);
    const { t } = useI18n();

    // 获取当前版本号
    useEffect(() => {
        window.updateAPI?.getVersion().then(v => setVersion(v)).catch(() => setVersion('?'));
    }, []);

    // 轮询 CPU 和内存
    useEffect(() => {
        const fetchStats = () => {
            window.updateAPI?.getStats().then((stats: any) => {
                setCpu(stats.cpu);
                setMemUsed(stats.memUsed);
            }).catch(() => { });
        };
        fetchStats();
        const interval = setInterval(fetchStats, 3000);
        return () => clearInterval(interval);
    }, []);

    // 监听主进程更新状态推送（仅处理短暂提示）
    useEffect(() => {
        const cleanup = window.updateAPI?.onStatus((data: any) => {
            if (data.type === 'checking') {
                setTransientStatus(t('statusBar.checking'));
            } else if (data.type === 'not-available') {
                setTransientStatus(t('statusBar.upToDate'));
                setTimeout(() => setTransientStatus(null), 3000);
            } else if (data.type === 'available') {
                // 有新版本，清除短暂提示（由 hasUpdate prop 接管显示）
                setTransientStatus(null);
            } else if (data.type === 'downloaded') {
                setTransientStatus(t('statusBar.readyToInstall'));
            } else if (data.type === 'error') {
                setTransientStatus(t('statusBar.updateFailed'));
                setTimeout(() => setTransientStatus(null), 3000);
            }
        });
        return () => cleanup?.();
    }, [t]);

    // 点击更新区域
    const handleClick = () => {
        if (hasUpdate) {
            // 有更新，通知父组件弹出更新对话框
            onShowUpdate?.();
        } else {
            // 无更新，触发一次手动检查
            setTransientStatus(t('statusBar.checking'));
            window.updateAPI?.check().catch(() => setTransientStatus(t('statusBar.checkFailed')));
        }
    };

    // 确定状态栏更新区域的显示内容
    const renderUpdateSection = () => {
        // 1. 有可用更新 — 醒目的「检测到更新」样式
        if (hasUpdate) {
            return (
                <>
                    <ArrowDownCircle size={11} className="text-[var(--st-statusbar-success-text)]" />
                    <span className="text-[var(--st-statusbar-success-text)] font-medium">
                        {updateVersion ? `v${updateVersion} ${t('statusBar.available')}` : t('statusBar.available')}
                    </span>
                </>
            );
        }

        // 2. 有短暂状态文本（checking / up-to-date / error）
        if (transientStatus) {
            return (
                <>
                    <ArrowDownCircle size={11} />
                    <span>{transientStatus}</span>
                </>
            );
        }

        // 3. 默认：「检查更新」
        return (
            <>
                <RefreshCw size={10} className="opacity-60" />
                <span className="opacity-80">{t('statusBar.checkUpdate')}</span>
            </>
        );
    };

    return (
        <div
            className="h-[22px] bg-[var(--statusbar-background)] flex items-center justify-between px-2 text-[11px] text-[var(--st-statusbar-text)] select-none cursor-default shrink-0 border-t border-[var(--border-color)]"
            data-component="statusbar"
        >
            {/* 左侧 */}
            <div className="flex items-center gap-3">
                {/* 版本号 */}
                <div className="flex items-center gap-1 px-1 rounded-sm opacity-70">
                    <span>v{version || '...'}</span>
                </div>

                <div className="w-[1px] h-3 bg-[var(--st-statusbar-divider)] opacity-15" />

                {/* CPU */}
                <Tooltip content={t('statusBar.cpuUsage').replace('{val}', String(cpu))} position="top" wrapperClassName="h-full flex items-center">
                    <div className="flex items-center gap-1 px-1 rounded-sm">
                        <Cpu size={11} className="opacity-60" />
                        <span className={cpu > 30 ? 'text-[var(--st-status-danger-text)]' : 'opacity-80'}>{cpu}%</span>
                    </div>
                </Tooltip>

                {/* 内存 */}
                <Tooltip content={t('statusBar.memUsage').replace('{val}', String(memUsed))} position="top" wrapperClassName="h-full flex items-center">
                    <div className="flex items-center gap-1 px-1 rounded-sm">
                        <MemoryStick size={11} className="opacity-60" />
                        <span className={memUsed > 500 ? 'text-[var(--st-status-danger-text)]' : 'opacity-80'}>{memUsed} MB</span>
                    </div>
                </Tooltip>

                <div className="w-[1px] h-3 bg-[var(--st-statusbar-divider)] opacity-15" />

                {/* 检查更新 */}
                <Tooltip content={hasUpdate ? t('statusBar.clickToUpdate') : t('statusBar.checkUpdate')} position="top" wrapperClassName="h-full flex items-center">
                    <div
                        className="flex items-center gap-1 px-1 rounded-sm bg-[var(--st-statusbar-btn-bg)] hover:bg-[var(--st-statusbar-btn-hover)] cursor-pointer transition-colors"
                        onClick={handleClick}
                    >
                        {renderUpdateSection()}
                    </div>
                </Tooltip>

                <div className="w-[1px] h-3 bg-[var(--st-statusbar-divider)] opacity-15" />

                {/* GitHub */}
                <Tooltip content={t('statusBar.openGithub')} position="top" wrapperClassName="h-full flex items-center">
                    <div
                        className="flex items-center gap-1 px-1 rounded-sm bg-[var(--st-statusbar-btn-bg)] hover:bg-[var(--st-statusbar-btn-hover)] cursor-pointer transition-colors"
                        onClick={() => window.shellAPI?.openExternal('https://github.com/thedongcc/Tcom')}
                    >
                        <Github size={11} className="opacity-60" />
                        <span className="opacity-80">GitHub</span>
                    </div>
                </Tooltip>
            </div>

            {/* 右侧 */}
            <div className="flex items-center gap-3 opacity-50">
                <span>Created by Thedong</span>
            </div>
        </div>
    );
};
