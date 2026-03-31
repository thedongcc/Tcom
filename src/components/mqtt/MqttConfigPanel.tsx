/**
 * MqttConfigPanel.tsx
 * MQTT 配置面板 — Broker 连接设置 + 订阅主题管理。
 *
 * 子模块：
 * - MqttTopicList.tsx — 订阅主题列表组件
 */
import { MqttSessionConfig } from '../../types/session';
import { Play, Square, ChevronDown, ChevronRight, RefreshCw, Check } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { MqttTopicList } from './MqttTopicList';
import { CustomSelect } from '../common/CustomSelect';

interface MqttConfigPanelProps {
    config: MqttSessionConfig;
    isConnected: boolean;
    isConnecting?: boolean;
    onUpdate: (updates: Partial<MqttSessionConfig>) => void;
    onConnectToken: () => void;
    onDisconnectToken: () => void;
}

// 公共输入框样式 — h-7 与 CustomSelect 等高
const inputCls = 'w-full h-7 bg-[var(--input-background)] border border-[var(--input-border-color)] text-[var(--input-foreground)] text-[12px] px-2 outline-none rounded-sm focus:border-[var(--focus-border-color)] disabled:opacity-50 transition-colors';
const labelCls = 'text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium';


export const MqttConfigPanel = ({ config, isConnected, isConnecting, onUpdate, onConnectToken, onDisconnectToken }: MqttConfigPanelProps) => {
    const isConnectionExpanded = config.uiState?.connectionExpanded !== undefined ? config.uiState.connectionExpanded : (!isConnected);
    const { t } = useI18n();

    const toggleConnectionExpanded = () => {
        onUpdate({
            uiState: {
                ...config.uiState,
                connectionExpanded: !isConnectionExpanded
            }
        });
    };

    const isLocked = isConnected || isConnecting;

    return (
        <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden min-w-0 bg-[var(--serial-config-bg)] text-[var(--serial-config-text)]" data-component="mqtt-config">
            {/* 连接设置 */}
            <div className="border-b border-[var(--border-color)] shrink-0">
                <div
                    className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[var(--serial-config-bg)] sticky top-0 flex items-center gap-2 cursor-pointer hover:bg-[var(--list-hover-background)] border-b border-[var(--border-color)]"
                    onClick={toggleConnectionExpanded}
                >
                    {isConnectionExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {t('mqtt.brokerConnection')}
                </div>

                {isConnectionExpanded && (
                    <div className="px-4 py-2 gap-3 flex flex-col animate-in slide-in-from-top-2 duration-200">
                        {/* Host */}
                        <div className="flex flex-col gap-1 min-w-0">
                            <label className={labelCls}>{t('mqtt.broker')}</label>
                            <input
                                className={inputCls}
                                placeholder="broker.emqx.io"
                                value={config.host}
                                onChange={(e) => onUpdate({ host: e.target.value })}
                                disabled={isLocked}
                            />
                        </div>

                        {/* Protocol + Port + Path */}
                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 w-[80px] shrink-0">
                                <label className={labelCls}>{t('mqtt.protocol')}</label>
                                <CustomSelect
                                    items={['TCP', 'WS', 'WSS', 'SSL'].map(p => ({ label: p, value: p.toLowerCase() }))}
                                    value={config.protocol}
                                    onChange={(newProto) => {
                                        const proto = newProto as 'tcp' | 'ws' | 'wss' | 'ssl';
                                        let newPort = config.port;
                                        const standards: Record<string, number> = { tcp: 1883, ssl: 8883, ws: 8083, wss: 8084 };
                                        const isStandard = Object.values(standards).includes(config.port);
                                        if (isStandard || config.port === 0) {
                                            newPort = standards[proto] || 1883;
                                        }
                                        onUpdate({ protocol: proto, port: newPort });
                                    }}
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="flex flex-col gap-1 w-[70px] shrink-0">
                                <label className={labelCls}>{t('mqtt.port')}</label>
                                <input
                                    type="number"
                                    className={inputCls}
                                    value={config.port}
                                    onChange={(e) => onUpdate({ port: parseInt(e.target.value) || 1883 })}
                                    disabled={isLocked}
                                />
                            </div>
                            {(config.protocol === 'ws' || config.protocol === 'wss') && (
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                    <label className={labelCls}>{t('mqtt.path')}</label>
                                    <input
                                        className={inputCls}
                                        placeholder="/mqtt"
                                        value={config.path || ''}
                                        onChange={(e) => onUpdate({ path: e.target.value })}
                                        disabled={isLocked}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <label className={labelCls}>{t('mqtt.clientId')}</label>
                                <div className="flex gap-1 w-full">
                                    <input
                                        className={`${inputCls} flex-1 min-w-0`}
                                        value={config.clientId}
                                        onChange={(e) => onUpdate({ clientId: e.target.value })}
                                        disabled={isLocked}
                                    />
                                    <Tooltip content={t('mqtt.generateId')} position="bottom" wrapperClassName="flex">
                                        <button
                                            className="h-7 w-7 flex items-center justify-center bg-[var(--button-secondary-background)] hover:bg-[var(--button-secondary-hover-background)] text-[var(--button-foreground)] text-[14px] rounded-sm shrink-0 disabled:opacity-50 transition-colors"
                                            onClick={() => onUpdate({ clientId: `client-${Math.random().toString(16).substring(2, 8)}` })}
                                            disabled={isLocked}
                                        >
                                            ↻
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <label className={labelCls}>{t('mqtt.username')}</label>
                                <input
                                    className={inputCls}
                                    value={config.username || ''}
                                    onChange={(e) => onUpdate({ username: e.target.value })}
                                    placeholder={t('mqtt.optional')}
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <label className={labelCls}>{t('mqtt.password')}</label>
                                <input
                                    type="password"
                                    className={inputCls}
                                    value={config.password || ''}
                                    onChange={(e) => onUpdate({ password: e.target.value })}
                                    placeholder={t('mqtt.optional')}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>

                        {/* KeepAlive + Timeout */}
                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 flex-1">
                                <label className={labelCls}>{t('mqtt.keepAlive')}</label>
                                <input
                                    type="number"
                                    className={inputCls}
                                    value={config.keepAlive}
                                    onChange={(e) => onUpdate({ keepAlive: parseInt(e.target.value) || 60 })}
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="flex flex-col gap-1 flex-1">
                                <label className={labelCls}>{t('mqtt.timeout')}</label>
                                <input
                                    type="number"
                                    className={inputCls}
                                    value={config.connectTimeout}
                                    onChange={(e) => onUpdate({ connectTimeout: parseInt(e.target.value) || 30 })}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <div
                                    onClick={() => !isLocked && onUpdate({ cleanSession: !config.cleanSession })}
                                    className={`w-[18px] h-[18px] rounded-[3px] flex items-center justify-center cursor-pointer transition-all shrink-0 ${config.cleanSession
                                        ? 'bg-[var(--checkbox-background)] border border-[var(--checkbox-border-color)]'
                                        : 'bg-transparent border-2 border-[var(--input-border-color)] hover:border-[var(--input-placeholder-color)]'
                                    } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {config.cleanSession && <Check size={14} strokeWidth={3} className="text-[var(--checkbox-foreground)]" />}
                                </div>
                                <label className={labelCls}>{t('mqtt.cleanSession')}</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <div
                                    onClick={() => !isLocked && onUpdate({ autoReconnect: !config.autoReconnect })}
                                    className={`w-[18px] h-[18px] rounded-[3px] flex items-center justify-center cursor-pointer transition-all shrink-0 ${config.autoReconnect
                                        ? 'bg-[var(--checkbox-background)] border border-[var(--checkbox-border-color)]'
                                        : 'bg-transparent border-2 border-[var(--input-border-color)] hover:border-[var(--input-placeholder-color)]'
                                    } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {config.autoReconnect && <Check size={14} strokeWidth={3} className="text-[var(--checkbox-foreground)]" />}
                                </div>
                                <label className={labelCls}>{t('mqtt.autoReconnect')}</label>
                            </div>
                        </div>

                        {/* 连接按钮 */}
                        <div className="pt-3">
                            <button
                                className={`w-full py-1.5 px-3 text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                                    ? 'bg-[var(--st-settings-danger-bg)] text-[var(--st-settings-danger-text)] hover:bg-[var(--st-settings-danger-hover)]'
                                    : 'bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)] disabled:opacity-50 disabled:cursor-not-allowed'
                                    }`}
                                onClick={isConnected ? onDisconnectToken : onConnectToken}
                                disabled={isConnecting}
                            >
                                {isConnecting ? (
                                    <RefreshCw size={12} className="animate-spin" />
                                ) : isConnected ? (
                                    <Square size={12} fill="currentColor" />
                                ) : (
                                    <Play size={12} fill="currentColor" />
                                )}
                                {isConnecting ? t('mqtt.connecting') : isConnected ? t('mqtt.disconnect') : t('mqtt.connect')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 订阅主题 */}
            <MqttTopicList
                topics={config.topics || []}
                onUpdate={(topics) => onUpdate({ topics })}
            />
        </div>
    );
};
