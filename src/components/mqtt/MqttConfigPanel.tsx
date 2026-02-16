import { MqttSessionConfig, MqttTopicConfig } from '../../types/session';
import { Plus, Trash2, Play, Square, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface MqttConfigPanelProps {
    config: MqttSessionConfig;
    isConnected: boolean;
    onUpdate: (updates: Partial<MqttSessionConfig>) => void;
    onConnectToken: () => void;
    onDisconnectToken: () => void;
}

const COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e',
    '#cccccc', '#9ca3af'
];

export const MqttConfigPanel = ({ config, isConnected, onUpdate, onConnectToken, onDisconnectToken }: MqttConfigPanelProps) => {
    // Collapsible Connection Settings
    const isConnectionExpanded = config.uiState?.connectionExpanded !== undefined ? config.uiState.connectionExpanded : (!isConnected);

    const toggleConnectionExpanded = () => {
        onUpdate({
            uiState: {
                ...config.uiState,
                connectionExpanded: !isConnectionExpanded
            }
        });
    };

    const [newTopicPath, setNewTopicPath] = useState('');

    const handleAddTopic = () => {
        if (!newTopicPath.trim()) return;

        // Check duplicate path
        if (config.topics.some(t => t.path === newTopicPath.trim())) {
            // Shake animation or alert? For now just return.
            return;
        }

        const newTopic: MqttTopicConfig = {
            id: Date.now().toString(),
            path: newTopicPath.trim(),
            color: COLORS[Math.floor(Math.random() * (COLORS.length - 2))], // Random color (excluding grays)
            subscribed: true
        };
        onUpdate({ topics: [...config.topics, newTopic] });
        setNewTopicPath('');
    };

    const handleRemoveTopic = (id: string) => {
        onUpdate({ topics: config.topics.filter(t => t.id !== id) });
    };

    const updateTopic = (id: string, updates: Partial<MqttTopicConfig>) => {
        onUpdate({
            topics: config.topics.map(t => t.id === id ? { ...t, ...updates } : t)
        });
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden min-w-0 bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            {/* Connection Settings */}
            <div className="border-b border-[var(--vscode-border)] shrink-0">
                <div
                    className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[#252526] sticky top-0 flex items-center gap-2 cursor-pointer hover:bg-[#2a2d2e]"
                    onClick={toggleConnectionExpanded}
                >
                    {isConnectionExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Broker Connection
                </div>

                {isConnectionExpanded && (
                    <div className="p-4 flex flex-col gap-4 animate-in slide-in-from-top-2 duration-200">
                        {/* Host */}
                        <div className="flex flex-col gap-1 min-w-0">
                            <label className="text-[11px] text-[#969696]">Host</label>
                            <input
                                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                placeholder="broker.emqx.io"
                                value={config.host}
                                onChange={(e) => onUpdate({ host: e.target.value })}
                                disabled={isConnected}
                            />
                        </div>

                        {/* Protocol + Port + Path */}
                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 w-[80px] shrink-0">
                                <label className="text-[11px] text-[#969696]">Protocol</label>
                                <select
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                    value={config.protocol}
                                    onChange={(e) => {
                                        const newProto = e.target.value as any;
                                        let newPort = config.port;

                                        // Auto-switch port if current port is a standard one
                                        const standards: Record<string, number> = { tcp: 1883, ssl: 8883, ws: 8083, wss: 8084 };
                                        const isStandard = Object.values(standards).includes(config.port);

                                        if (isStandard || config.port === 0) {
                                            newPort = standards[newProto] || 1883;
                                        }

                                        onUpdate({ protocol: newProto, port: newPort });
                                    }}
                                    disabled={isConnected}
                                >
                                    {['tcp', 'ws', 'wss', 'ssl'].map(p => (
                                        <option key={p} value={p}>{p.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1 w-[70px] shrink-0">
                                <label className="text-[11px] text-[#969696]">Port</label>
                                <input
                                    type="number"
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                    value={config.port}
                                    onChange={(e) => onUpdate({ port: parseInt(e.target.value) || 1883 })}
                                    disabled={isConnected}
                                />
                            </div>
                            {(config.protocol === 'ws' || config.protocol === 'wss') && (
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                    <label className="text-[11px] text-[#969696]">Path</label>
                                    <input
                                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                        placeholder="/mqtt"
                                        value={config.path || ''}
                                        onChange={(e) => onUpdate({ path: e.target.value })}
                                        disabled={isConnected}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <label className="text-[11px] text-[#969696]">Client ID</label>
                                <div className="flex gap-1 w-full">
                                    <input
                                        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] flex-1 min-w-0"
                                        value={config.clientId}
                                        onChange={(e) => onUpdate({ clientId: e.target.value })}
                                        disabled={isConnected}
                                    />
                                    <button
                                        className="px-2 bg-[var(--vscode-button-secondary-bg)] hover:bg-[var(--vscode-button-secondary-hover-bg)] text-[11px] rounded-sm shrink-0"
                                        onClick={() => onUpdate({ clientId: `client-${Math.random().toString(16).substring(2, 8)}` })}
                                        title="Generate Random ID"
                                        disabled={isConnected}
                                    >
                                        ↻
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <label className="text-[11px] text-[#969696]">Username</label>
                                <input
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                    value={config.username || ''}
                                    onChange={(e) => onUpdate({ username: e.target.value })}
                                    placeholder="Optional"
                                    disabled={isConnected}
                                />
                            </div>
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <label className="text-[11px] text-[#969696]">Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                    value={config.password || ''}
                                    onChange={(e) => onUpdate({ password: e.target.value })}
                                    placeholder="Optional"
                                    disabled={isConnected}
                                />
                            </div>
                        </div>

                        {/* Advanced: KeepAlive, Timeout, Clean, AutoReconnect */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] text-[#969696]">Keep Alive (s)</label>
                                <input
                                    type="number"
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                    value={config.keepAlive}
                                    onChange={(e) => onUpdate({ keepAlive: parseInt(e.target.value) || 60 })}
                                    disabled={isConnected}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] text-[#969696]">Timeout (s)</label>
                                <input
                                    type="number"
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                    value={config.connectTimeout}
                                    onChange={(e) => onUpdate({ connectTimeout: parseInt(e.target.value) || 30 })}
                                    disabled={isConnected}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="bg-[#3c3c3c] border border-[#3c3c3c]"
                                    checked={config.cleanSession}
                                    onChange={(e) => onUpdate({ cleanSession: e.target.checked })}
                                    disabled={isConnected}
                                />
                                <label className="text-[11px] text-[#969696]">Clean Session</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="bg-[#3c3c3c] border border-[#3c3c3c]"
                                    checked={config.autoReconnect}
                                    onChange={(e) => onUpdate({ autoReconnect: e.target.checked })}
                                    disabled={isConnected}
                                />
                                <label className="text-[11px] text-[#969696]">Auto Reconnect</label>
                            </div>
                        </div>

                        {/* Connect Button (Moved Inside) */}
                        <div className="pt-2">
                            <button
                                className={`w-full py-1.5 px-3 text-white text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                                    ? 'bg-[#a1260d] hover:bg-[#c93f24]'
                                    : 'bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed'
                                    }`}
                                onClick={isConnected ? onDisconnectToken : onConnectToken}
                            >
                                {isConnected ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                {isConnected ? 'Disconnect' : 'Connect'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Subscriptions */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[#252526] sticky top-0 border-b border-[var(--vscode-border)] shrink-0">
                    Subscriptions
                </div>

                <div className="p-4 flex flex-col gap-2 overflow-y-auto">
                    {/* Add Topic */}
                    <div className="flex gap-1 mb-2">
                        <input
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] flex-1 min-w-0"
                            placeholder="Topic (e.g. sensors/#)"
                            value={newTopicPath}
                            onChange={(e) => setNewTopicPath(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                        />
                        <button
                            className="p-1.5 bg-[var(--vscode-button-bg)] text-white hover:bg-[var(--vscode-button-hover-bg)] rounded-sm shrink-0"
                            onClick={handleAddTopic}
                        >
                            <Plus size={14} />
                        </button>
                    </div>

                    {/* Topic List */}
                    <div className="flex flex-col gap-2">
                        {config.topics.length === 0 && (
                            <div className="text-[#666] italic text-[11px] text-center py-4">No subscriptions added.</div>
                        )}
                        {config.topics.map((topic) => (
                            <div key={topic.id} className="flex flex-col bg-[#2d2d2d] rounded-sm p-2 gap-2 group border border-transparent hover:border-[#3c3c3c] transition-colors">
                                <div className="flex items-center gap-2">
                                    {/* Re-doing color input purely */}
                                    <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-[#444] relative">
                                        <input
                                            type="color"
                                            value={topic.color}
                                            onChange={(e) => updateTopic(topic.id, { color: e.target.value })}
                                            className="absolute opacity-0 w-full h-full cursor-pointer top-0 left-0"
                                        />
                                        <div className="w-full h-full pointer-events-none" style={{ backgroundColor: topic.color }} />
                                    </div>

                                    {/* Topic Path */}
                                    <input
                                        className="flex-1 bg-transparent border-none outline-none text-[12px] font-mono text-[#cccccc] min-w-0"
                                        value={topic.path}
                                        onChange={(e) => updateTopic(topic.id, { path: e.target.value })}
                                    />

                                    {/* Subscribe Toggle */}
                                    <button
                                        className={`w-8 h-4 rounded-full flex items-center transition-colors px-0.5 ${topic.subscribed ? 'bg-[#10b981]' : 'bg-[#3c3c3c]'}`}
                                        onClick={() => updateTopic(topic.id, { subscribed: !topic.subscribed })}
                                        title={topic.subscribed ? 'Subscribed' : 'Unsubscribed'}
                                    >
                                        <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${topic.subscribed ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>

                                    {/* Delete */}
                                    <Trash2
                                        size={14}
                                        className="text-[#666] hover:text-[#f48771] cursor-pointer"
                                        onClick={() => handleRemoveTopic(topic.id)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
