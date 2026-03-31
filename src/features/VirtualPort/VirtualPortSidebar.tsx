/**
 * VirtualPortSidebar.tsx
 * 虚拟串口侧边栏 — com0com 驱动管理和虚拟端口对创建。
 *
 * 子模块：
 * - Com0comInstallDialog.tsx — 安装方式选择对话框
 * - useVirtualPortState.ts — 状态管理（路径检测、端口对 CRUD、监控器开关）
 */
import { RefreshCw, Wand2, ArrowRightLeft, FolderOpen, Trash2 } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { Com0Com } from '../../utils/com0com';
import { useConfirm } from '../../context/ConfirmContext';
import { CustomSelect } from '../../components/common/CustomSelect';
import { Tooltip } from '../../components/common/Tooltip';
import { Switch } from '../../components/common/Switch';
import { useI18n } from '../../context/I18nContext';
import { Com0comInstallDialog } from './Com0comInstallDialog';
import { useVirtualPortState } from './useVirtualPortState';
import { FeatureSidebarProps } from '../../types/module';

export const VirtualPortSidebar = ({ onNavigate: _onNavigate, editorLayout: _editorLayout }: FeatureSidebarProps) => {
    const sessionManager = useSession();
    const { confirm } = useConfirm();
    const { t } = useI18n();

    // ── 核心状态（全部委托给 Hook） ──
    const {
        pathStatus, showInstallDialog, setShowInstallDialog,
        setupcPath, setSetupcPath,
        isAdmin, monitorEnabled,
        existingPairs, isCreatingPair,
        newPairExt, setNewPairExt, newPairInt, setNewPairInt,
        usedPorts, physicalPorts, ghostPorts,
        refreshPairs, suggestNextPair, createNewPair, handleToggleMonitor,
    } = useVirtualPortState(sessionManager);

    return (
        <div className="flex flex-col h-full bg-[var(--serial-config-bg)] text-[var(--serial-config-text)] overflow-y-auto w-full">
            <div className="px-4 py-2 flex flex-col gap-3 border-b border-[var(--border-color)] shrink-0">
                {/* 启用开关 — 与其他侧边栏保持一致，直接放在 px-4 py-2 区域，不套卡片 */}
                <Switch
                    label={t('monitor.enableVirtualMonitor')}
                    checked={monitorEnabled}
                    onChange={(checked) => handleToggleMonitor(checked)}
                    disabled={!isAdmin}
                />
                {!isAdmin && (
                    <div className="p-2 bg-[var(--st-status-error-bg)] border border-[var(--st-status-error)]/50 rounded-sm">
                        <p className="text-[11px] text-[var(--st-status-error)]">
                            {t('monitor.adminRequired')}
                        </p>
                    </div>
                )}
            </div>

            <div className={`${(!monitorEnabled || !isAdmin) ? 'opacity-40 pointer-events-none grayscale-[0.5]' : ''} flex flex-col gap-3 px-4 pb-4 transition-all duration-300`}>

                {/* setupc.exe 路径 */}
                <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">
                            {t('monitor.setupcPath')}
                        </label>
                        <button
                            className="text-[11px] text-[var(--focus-border-color)] hover:underline transition-colors"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowInstallDialog(true); }}
                        >
                            {t('monitor.installCom0com')}
                        </button>
                    </div>
                    <div className="flex gap-1 w-full">
                        <input
                            className="flex-1 min-w-0 h-7 px-2 text-[12px] bg-[var(--input-background)] border border-[var(--input-border-color)] text-[var(--input-foreground)] font-mono rounded-sm outline-none focus:border-[var(--focus-border-color)] transition-colors"
                            value={setupcPath}
                            onChange={(e) => setSetupcPath(e.target.value)}
                        />
                        <button
                            className="h-7 w-7 flex items-center justify-center bg-[var(--button-secondary-background)] border border-[var(--input-border-color)] text-[var(--serial-config-text)] rounded-sm transition-colors hover:bg-[var(--button-secondary-hover-background)] shrink-0"
                            onClick={async () => {
                                try {
                                    const result = await window.shellAPI?.showOpenDialog({
                                        title: t('monitor.selectSetupcExe'),
                                        filters: [{ name: 'com0com installer (setupc.exe)', extensions: ['exe'] }],
                                        properties: ['openFile']
                                    });
                                    if (result && !result.canceled && result.filePaths.length > 0) {
                                        setSetupcPath(result.filePaths[0]);
                                    }
                                } catch (e) {
                                    console.error(e);
                                }
                            }}
                        >
                            <FolderOpen size={13} />
                        </button>
                    </div>
                    <div className="h-4 text-[11px] flex items-center">
                        {pathStatus === 'checking' && <span className="text-[var(--activitybar-inactive-foreground)]">{t('monitor.pathChecking')}</span>}
                        {pathStatus === 'valid' && <span className="text-[var(--st-status-success)]">✓ {t('monitor.pathValid').replace(' {version}', '')}</span>}
                        {pathStatus === 'invalid' && <span className="text-[var(--st-status-error)]">✗ {t('monitor.pathInvalid')}</span>}
                    </div>
                </div>

                {/* 虚拟端口对管理 */}
                <div className="flex flex-col gap-2 border border-[var(--border-color)] p-3 bg-[var(--widget-background)] rounded-sm">
                    <div className="text-[11px] text-[var(--serial-config-label)] opacity-80 flex justify-between items-center font-medium">
                        <span>{t('monitor.virtualPairs')}</span>
                        <div className="flex gap-1 items-center">
                            <Tooltip content={t('monitor.suggestNextPair')} position="top" wrapperClassName="flex">
                                <button
                                    onClick={(e) => { e.preventDefault(); suggestNextPair(); }}
                                    className="w-6 h-6 flex items-center justify-center rounded-sm text-[var(--activitybar-inactive-foreground)] transition-colors hover:bg-[var(--list-hover-background)] hover:text-[var(--app-foreground)]"
                                >
                                    <Wand2 size={13} />
                                </button>
                            </Tooltip>
                            <Tooltip content={t('monitor.refresh')} position="top" wrapperClassName="flex">
                                <button
                                    onClick={(e) => { e.preventDefault(); if (pathStatus === 'valid') void refreshPairs(); }}
                                    className={`w-6 h-6 flex items-center justify-center rounded-sm text-[var(--activitybar-inactive-foreground)] transition-colors ${pathStatus !== 'valid' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--list-hover-background)] hover:text-[var(--app-foreground)]'}`}
                                    disabled={pathStatus !== 'valid'}
                                >
                                    <RefreshCw size={13} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 items-center">
                            <CustomSelect
                                items={Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => ({
                                    label: ghostPorts.has(com) ? `👻 ${com}` : com,
                                    value: com,
                                    disabled: usedPorts.has(com) || physicalPorts.includes(com) || ghostPorts.has(com),
                                    description: ghostPorts.has(com) ? t('monitor.ghostPortDesc') : undefined
                                }))}
                                value={newPairExt}
                                onChange={val => setNewPairExt(val)}
                                disabled={pathStatus !== 'valid'}
                            />
                            <ArrowRightLeft size={10} className="text-[var(--activitybar-inactive-foreground)] shrink-0" />
                            <CustomSelect
                                items={Array.from({ length: 255 }, (_, i) => `COM${i + 1}`).map(com => ({
                                    label: ghostPorts.has(com) ? `👻 ${com}` : com,
                                    value: com,
                                    disabled: usedPorts.has(com) || physicalPorts.includes(com) || ghostPorts.has(com) || com === newPairExt,
                                    description: ghostPorts.has(com) ? t('monitor.ghostPortDesc') : undefined
                                }))}
                                value={newPairInt}
                                onChange={val => setNewPairInt(val)}
                                disabled={pathStatus !== 'valid'}
                            />
                        </div>
                        <button
                            onClick={() => { if (pathStatus !== 'valid') return; void createNewPair(); }}
                            disabled={isCreatingPair || !isAdmin || !monitorEnabled || pathStatus !== 'valid'}
                            className={`w-full h-7 text-[12px] rounded-sm transition-colors ${!isAdmin || !monitorEnabled || pathStatus !== 'valid'
                                ? 'bg-[var(--button-secondary-background)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed'
                                : 'bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)]'
                                }`}
                        >
                            {isCreatingPair ? t('monitor.creating') : t('monitor.createVirtualPair')}
                        </button>
                    </div>

                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {existingPairs.map(pair => (
                            <div key={pair.id} className="group flex justify-between items-center text-[12px] bg-[var(--input-background)] border border-[var(--border-color)] px-2 py-1.5 relative hover:bg-[var(--list-hover-background)] transition-colors rounded-sm">
                                <div className="grid grid-cols-[45px_20px_45px] items-center font-mono">
                                    <span className="text-[var(--app-foreground)]">{pair.portA}</span>
                                    <ArrowRightLeft size={10} className="text-[var(--activitybar-inactive-foreground)]" />
                                    <span className="text-[var(--app-foreground)]">{pair.portB}</span>
                                </div>
                                <button
                                    className="w-6 h-6 flex items-center justify-center rounded-sm transition-colors text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-status-error)] hover:bg-[var(--list-hover-background)]"
                                    onClick={async () => {
                                        const ok = await confirm({
                                            title: t('monitor.deletePairTitle'),
                                            message: t('monitor.deletePairMessage', { portA: pair.portA, portB: pair.portB }),
                                            type: 'danger',
                                            confirmText: t('monitor.deletePairConfirm')
                                        });
                                        if (ok) {
                                            await Com0Com.removePair(setupcPath, pair.id);
                                            void refreshPairs();
                                        }
                                    }}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                        {existingPairs.length === 0 && (
                            <span className="text-[11px] text-[var(--activitybar-inactive-foreground)] italic">
                                {!monitorEnabled ? t('monitor.monitorDisabled') : (!isAdmin ? t('monitor.adminPermRequired') : t('monitor.noPairsFound'))}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* 安装 com0com 对话框 */}
            {showInstallDialog && <Com0comInstallDialog onClose={() => setShowInstallDialog(false)} />}
        </div>
    );
};
