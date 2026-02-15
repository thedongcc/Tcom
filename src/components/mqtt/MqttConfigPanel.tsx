import { MqttSessionConfig } from '../../types/session';
import { Plus, Trash2, Play, Square } from 'lucide-react';
import { useState } from 'react';

interface MqttConfigPanelProps {
    config: MqttSessionConfig;
    isConnected: boolean;
    onUpdate: (updates: Partial<MqttSessionConfig>) => void;
    onConnectToken: () => void;
    onDisconnectToken: () => void;
}

export const MqttConfigPanel = ({ config, isConnected, onUpdate, onConnectToken, onDisconnectToken }: MqttConfigPanelProps) => {
    const [newTopic, setNewTopic] = useState('');

    const handleAddTopic = () => {
        if (!newTopic.trim()) return;
        if (config.topics.includes(newTopic.trim())) return;
        onUpdate({ topics: [...config.topics, newTopic.trim()] });
        setNewTopic('');
    };

    const handleRemoveTopic = (topic: string) => {
        onUpdate({ topics: config.topics.filter(t => t !== topic) });
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden min-w-0 bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            {/* Connection Settings */}
            <div className="border-b border-[var(--vscode-border)] shrink-0">
                <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[#252526] sticky top-0">
                    Broker Connection
                </div>
                <div className="p-4 flex flex-col gap-4">
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

                    {/* Connect Button */}
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
            </div>

            {/* Subscriptions */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[#252526] sticky top-0 border-b border-[var(--vscode-border)] shrink-0">
                    Subscriptions
                </div>

                <div className="p-4 flex flex-col gap-2 overflow-y-auto">
                    {/* Add Topic */}
                    <div className="flex gap-1">
                        <input
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] flex-1 min-w-0"
                            placeholder="Topic (e.g. sensors/#)"
                            value={newTopic}
                            onChange={(e) => setNewTopic(e.target.value)}
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
                    <div className="flex flex-col gap-1 mt-2">
                        {config.topics.length === 0 && (
                            <div className="text-[#666] italic text-[11px] text-center py-4">No subscriptions added.</div>
                        )}
                        {config.topics.map((topic, index) => (
                            <div key={index} className="flex items-center justify-between bg-[#2d2d2d] px-2 py-1.5 rounded-sm group hover:bg-[#383838]">
                                <span className="text-[12px] font-mono truncate mr-2" title={topic}>{topic}</span>
                                <Trash2
                                    size={12}
                                    className="text-[#666] hover:text-[#f48771] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleRemoveTopic(topic)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
