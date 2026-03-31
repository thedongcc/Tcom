/**
 * SerialConfigPanel.tsx
 * 串口配置面板 — 端口选择、波特率、数据位/停止位/校验位及连接控制。
 * 从 ConfigSidebar.tsx 中拆分出来。
 */
import { useState, useEffect } from 'react';
import { RefreshCw, Play, Square } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { SerialSessionConfig, COMMON_BAUD_RATES } from '../../types/session';
import { CustomSelect } from '../common/CustomSelect';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { useParserStore } from '../../store/useParserStore';

interface SerialConfigPanelProps {
    session: any;
}

export const SerialConfigPanel = ({ session }: SerialConfigPanelProps) => {
    const { config, isConnected } = session;
    const { connection } = config as SerialSessionConfig;
    const { t } = useI18n();

    const { updateSessionConfig, connectSession, disconnectSession, listPorts, ports } = useSession();
    const uiState = config.uiState || {};
    const { config: parserConfig, loadConfig, isLoading: parserLoading } = useParserStore();
    const [highlight, setHighlight] = useState(false);

    useEffect(() => {
        if (!parserConfig && !parserLoading) {
            void loadConfig();
        }
    }, [parserConfig, parserLoading, loadConfig]);

    useEffect(() => {
        if (uiState.highlightConnect) {
            setHighlight(true);
            const t = setTimeout(() => setHighlight(false), 1500);
            return () => clearTimeout(t);
        }
    }, [uiState.highlightConnect]);

    const handleToggleConnection = () => {
        if (isConnected) {
            disconnectSession(session.id);
        } else {
            if (connection.path) {
                connectSession(session.id);
            }
        }
    };

    const updateConnection = (updates: Partial<typeof connection>) => {
        void updateSessionConfig(session.id, { connection: { ...connection, ...updates } });
    };

    const portItems = ports.map(port => ({
        label: `${port.path} ${port.friendlyName ? port.friendlyName.replace(`(${port.path})`, '').trim() : ''}`,
        value: port.path,
        busy: port.busy,
        error: port.error,
        description: port.manufacturer ? `Manufacturer: ${port.manufacturer}` : undefined
    }));

    return (
        <div
            className="flex flex-col h-full bg-[var(--serial-config-bg)] text-[var(--serial-config-text)]"
            data-component="serial-config"
        >
            <div className="px-4 py-2 flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
                {/* 端口选择 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                            {t('serial.portLabel')}
                        </div>
                        <Tooltip content={t('configSidebar.refreshPorts')} position="bottom" wrapperClassName="flex items-center">
                            <button onClick={() => listPorts()} className="hover:text-[var(--button-foreground)] transition-colors cursor-pointer">
                                <RefreshCw size={12} />
                            </button>
                        </Tooltip>
                    </label>
                    <CustomSelect
                        items={portItems}
                        value={connection.path}
                        onChange={(val) => updateConnection({ path: val })}
                        disabled={isConnected}
                        placeholder={t('configSidebar.selectPort')}
                        showStatus={true}
                    />
                </div>

                {/* 波特率 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('serial.baudRate')}</label>
                    <CustomSelect
                        items={COMMON_BAUD_RATES.map(rate => ({
                            label: String(rate),
                            value: String(rate)
                        }))}
                        value={String(connection.baudRate)}
                        onChange={(val) => updateConnection({ baudRate: Number(val) || 115200 })}
                        disabled={isConnected}
                        allowCustom={true}
                        placeholder={t('serial.baudRate')}
                    />
                </div>

                {/* 数据位 / 停止位 */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('serial.dataBits')}</label>
                        <CustomSelect
                            items={[5, 6, 7, 8].map(bit => ({ label: String(bit), value: String(bit) }))}
                            value={String(connection.dataBits)}
                            onChange={(val) => updateConnection({ dataBits: Number(val) as 5 | 6 | 7 | 8 })}
                            disabled={isConnected}
                        />
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('serial.stopBits')}</label>
                        <CustomSelect
                            items={[1, 1.5, 2].map(bit => ({ label: String(bit), value: String(bit) }))}
                            value={String(connection.stopBits)}
                            onChange={(val) => updateConnection({ stopBits: Number(val) as 1 | 1.5 | 2 })}
                            disabled={isConnected}
                        />
                    </div>
                </div>

                {/* 校验位 */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('serial.parity')}</label>
                    <CustomSelect
                        items={[
                            { label: t('serial.none'), value: 'none' },
                            { label: t('serial.even'), value: 'even' },
                            { label: t('serial.odd'), value: 'odd' },
                            { label: t('configSidebar.mark'), value: 'mark' },
                            { label: t('configSidebar.space'), value: 'space' },
                        ]}
                        value={connection.parity || 'none'}
                        onChange={(val) => updateConnection({ parity: val as 'none' | 'even' | 'mark' | 'odd' | 'space' })}
                        disabled={isConnected}
                    />
                </div>

                {/* 连接/断开按钮 */}
                <div className="pt-3 flex flex-col gap-2 border-t border-[var(--border-color)] mt-1">
                    <button
                        className={`w-full py-1.5 px-3 text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-[var(--st-settings-danger-bg)] text-[var(--st-settings-danger-text)] hover:bg-[var(--st-settings-danger-hover)]'
                            : (highlight
                                ? 'bg-[var(--button-background)] text-[var(--button-foreground)] ring-2 ring-[var(--focus-border-color)] animate-pulse'
                                : 'bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)] disabled:opacity-50 disabled:cursor-not-allowed')
                            }`}
                        disabled={!connection.path && !isConnected}
                        onClick={handleToggleConnection}
                    >
                        {isConnected ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        {isConnected ? t('serial.disconnect') : t('serial.connect')}
                    </button>

                    {isConnected ? (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[var(--st-config-success-text)]">
                            <div className="w-2 h-2 rounded-full bg-[var(--st-config-success-bg)] animate-pulse"></div>
                            <span>{t('configSidebar.monitoringActive')}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[var(--st-config-muted-text)]">
                            <div className="w-2 h-2 rounded-full bg-[var(--st-status-error)]"></div>
                            <span>{t('serial.disconnected')}</span>
                        </div>
                    )}
                </div>

                {/* 解码方案绑定 (多选) */}
                <div className="flex flex-col gap-1 border-t border-[var(--border-color)] pt-2 mt-2">
                    <label className="text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium">{t('serial.parser') || '解析引擎绑定'}</label>
                    {(!parserConfig?.schemes || parserConfig.schemes.length === 0) ? (
                        <span className="text-[11px] opacity-50">无可用方案，请先在下方创建</span>
                    ) : (
                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {parserConfig.schemes.map(s => {
                                const selected = config.parserSchemeIds?.includes(s.id) || config.parserSchemeId === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        disabled={isConnected}
                                        onClick={() => {
                                            const currentIds = config.parserSchemeIds || (config.parserSchemeId ? [config.parserSchemeId] : []);
                                            const newIds = selected ? currentIds.filter((id: string) => id !== s.id) : [...currentIds, s.id];
                                            void updateSessionConfig(session.id, { parserSchemeIds: newIds, parserSchemeId: undefined });
                                        }}
                                        className={`px-1.5 py-[3px] text-[11px] rounded-[3px] border border-solid transition-colors ${
                                            selected
                                                ? 'bg-[var(--focus-border-color)] border-[var(--focus-border-color)] text-white'
                                                : 'bg-transparent border-[var(--border-color)] text-[var(--activitybar-inactive-foreground)] hover:border-[var(--focus-border-color)] opacity-70 hover:opacity-100'
                                        } disabled:opacity-50`}
                                    >
                                        {s.name || '未命名'}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>


        </div>
    );
};
