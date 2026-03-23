/**
 * ConfigSidebar.tsx
 * 配置侧边栏 — 根据当前活动会话类型显示对应配置面板。
 *
 * 子组件：
 * - SerialConfigPanel.tsx — 串口配置面板
 * - MqttConfigPanel.tsx — MQTT 配置面板
 * - MonitorConfig.tsx — 监控器配置面板
 */
import { useSession } from '../../context/SessionContext';
import { MqttSessionConfig } from '../../types/session';
import { MqttConfigPanel } from '../mqtt/MqttConfigPanel';
import { MonitorConfigPanel } from '../serial-monitor/MonitorConfig';
import { useI18n } from '../../context/I18nContext';
import { SerialConfigPanel } from './SerialConfigPanel';

export const ConfigSidebar = () => {
    const sessionManager = useSession();
    const { activeSessionId, sessions } = sessionManager;
    const activeSession = sessions.find(s => s.id === activeSessionId);
    const { t } = useI18n();

    const getConfigTitle = () => {
        if (!activeSession) return t('sidebar.configuration');
        switch (activeSession.config.type) {
            case 'settings': { const res = t('configSidebar.globalSettings'); return res === 'configSidebar.globalSettings' ? '全局设置' : res; }
            case 'mqtt': { const res = t('configSidebar.mqttConfig'); return res === 'configSidebar.mqttConfig' ? 'MQTT配置' : res; }
            case 'monitor': { const res = t('configSidebar.monitorConfig'); return res === 'configSidebar.monitorConfig' ? '监控配置' : res; }
            case 'graph': { const res = t('configSidebar.graphConfig'); return res === 'configSidebar.graphConfig' ? '图表配置' : res; }
            case 'serial':
            default: { const res = t('configSidebar.serialConfig'); return res === 'configSidebar.serialConfig' ? '串口配置' : res; }
        }
    };

    const renderContent = () => {
        if (!activeSession) {
            return (
                <div className="p-4 text-[var(--st-config-muted-text)] text-xs text-center mt-10">
                    {t('configSidebar.noActiveSession')}<br />
                    {t('configSidebar.clickToCreate')}
                </div>
            );
        }

        // 设置会话
        if (activeSession.config.type === 'settings') {
            return (
                <div className="p-4 text-[var(--st-config-muted-text)] text-xs text-center mt-10">
                    <div className="mb-2 font-bold text-[var(--st-config-title-text)]">{t('configSidebar.globalSettings')}</div>
                    <div className="opacity-70 text-[11px]">{t('configSidebar.globalSettingsDesc')}</div>
                </div>
            );
        }

        // MQTT 会话
        if (activeSession.config.type === 'mqtt') {
            return (
                <MqttConfigPanel
                    config={activeSession.config as MqttSessionConfig}
                    isConnected={activeSession.isConnected}
                    isConnecting={activeSession.isConnecting}
                    onUpdate={(updates) => { void sessionManager.updateSessionConfig(activeSession.id, updates); }}
                    onConnectToken={() => sessionManager.connectSession(activeSession.id)}
                    onDisconnectToken={() => sessionManager.disconnectSession(activeSession.id)}
                />
            );
        }

        // 图编辑器会话
        if (activeSession.config.type === 'graph') {
            return (
                <div className="p-4 text-[var(--st-config-muted-text)] text-xs text-center mt-10">
                    {t('configSidebar.graphActive')}<br />
                    {t('configSidebar.noSidebarSettings')}
                </div>
            );
        }

        // 监控器会话
        if (activeSession.config.type === 'monitor') {
            return (
                <MonitorConfigPanel
                    session={activeSession}
                />
            );
        }

        // 默认：串口会话
        return <SerialConfigPanel session={activeSession} />;
    };

    return (
        <div className="flex flex-col h-full w-full">
            <div className="px-3 h-[42px] flex items-center border-b border-[var(--border-color)] shrink-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-80 min-w-0 flex-1 cursor-default">
                    <span className="truncate">{getConfigTitle()}</span>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto w-full">
                {renderContent()}
            </div>
        </div>
    );
};
