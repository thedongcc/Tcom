import React from 'react';
import { DashboardSessionConfig } from '../../types/session';
import { useSession } from '../../context/SessionContext';
import { DashboardCanvas } from './DashboardCanvas';
import { CustomSelect } from '../common/CustomSelect';
import { LayoutDashboard } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

interface DashboardSessionProps {
    session: any;
    onUpdateConfig: (updates: Partial<DashboardSessionConfig>) => void;
}

export const DashboardSession: React.FC<DashboardSessionProps> = ({ session, onUpdateConfig }) => {
    const { sessions } = useSession();
    const { t } = useI18n();

    // The UI State persists the bound session
    const uiState = session.config.uiState || {};
    const targetSessionId = uiState.targetSessionId || '';

    // Filter available data sessions (Serial & MQTT)
    const validSessions = sessions.filter(
        (s: any) => s.config.type === 'serial' || s.config.type === 'mqtt' || s.config.type === 'monitor'
    );

    const sessionOptions = [
        { label: 'None (Unbound)', value: '' },
        ...validSessions.map((s: any) => ({
            label: `${s.config.name} (${s.config.type.toUpperCase()})`,
            value: s.id
        }))
    ];

    return (
        <div className="flex flex-col h-full w-full bg-[var(--app-background)] text-[var(--app-foreground)]">
            {/* Toolbar */}
            <div className="flex-shrink-0 h-[34px] px-3 border-b border-[var(--st-toolbar-border)] bg-[var(--st-toolbar-bg)] flex items-center gap-4">
                <div className="flex items-center gap-2 text-[var(--activitybar-inactive-foreground)]">
                    <LayoutDashboard size={16} />
                    <span className="text-[12px] font-semibold">{t('sidebar.dashboard') || 'Dashboard'}</span>
                </div>

                <div className="h-4 w-[1px] bg-[var(--widget-border-color)]"></div>

                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--st-monitor-config-label)]">Data Source:</span>
                    <div className="w-[200px]">
                        <CustomSelect
                            items={sessionOptions}
                            value={targetSessionId}
                            onChange={(val) => {
                                onUpdateConfig({
                                    uiState: {
                                        ...uiState,
                                        targetSessionId: val
                                    }
                                });
                            }}
                            placeholder="Select target session..."
                        />
                    </div>
                </div>

                {targetSessionId && (
                    <div className="ml-2 flex items-center gap-2 text-[11px] text-[var(--st-config-success-text)] animate-in fade-in">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--st-config-success-bg)] animate-pulse"></div>
                        <span>Bound to target</span>
                    </div>
                )}
            </div>

            {/* Canvas Area */}
            <div className="flex-1 min-h-0 relative">
                {targetSessionId ? (
                    <DashboardCanvas sessionId={targetSessionId} />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none text-center p-4">
                        <LayoutDashboard size={48} className="mb-4 text-[var(--st-panel-header-text)] opacity-50" />
                        <p className="text-[13px] font-medium text-[var(--st-panel-header-text)]">Unbound Dashboard</p>
                        <p className="text-[11px] text-[var(--activitybar-inactive-foreground)] mt-2 max-w-[300px]">
                            Please select a data source from the toolbar above to start visualizing realtime data and sending commands.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
