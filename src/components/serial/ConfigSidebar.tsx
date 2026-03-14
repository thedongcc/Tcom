/**
 * ConfigSidebar.tsx
 * 配置侧边栏 — 根据当前活动会话类型显示对应配置面板。
 *
 * 子组件：
 * - SerialConfigPanel.tsx — 串口配置面板
 * - MqttConfigPanel.tsx — MQTT 配置面板
 * - MonitorConfig.tsx — 监控器配置面板
 */
import { useSessionManager } from '../../hooks/useSessionManager';
import { MqttSessionConfig } from '../../types/session';
import { MqttConfigPanel } from '../mqtt/MqttConfigPanel';
import { MonitorConfigPanel } from '../serial-monitor/MonitorConfig';
import { useI18n } from '../../context/I18nContext';
import { SerialConfigPanel } from './SerialConfigPanel';

interface ConfigSidebarProps {
    sessionManager: ReturnType<typeof useSessionManager>;
}

export const ConfigSidebar = ({ sessionManager }: ConfigSidebarProps) => {
    const { activeSessionId, sessions } = sessionManager;
    const activeSession = sessions.find(s => s.id === activeSessionId);
    const { t } = useI18n();

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
                sessionManager={sessionManager}
            />
        );
    }

    // 默认：串口会话
    return <SerialConfigPanel session={activeSession} sessionManager={sessionManager} />;
};
