import { MqttSessionConfig, LogEntry } from '../../types/session';
import { useRef, useEffect, useState } from 'react';
import { Send, History } from 'lucide-react';

interface MqttMonitorProps {
    session: {
        id: string;
        config: MqttSessionConfig;
        isConnected: boolean;
        logs: LogEntry[];
    };
    onShowSettings?: (view: string) => void;
    onPublish: (topic: string, payload: string | Uint8Array, qos: 0 | 1 | 2, retain: boolean) => void;
}

export const MqttMonitor = ({ session, onShowSettings, onPublish }: MqttMonitorProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Publish State
    const [topic, setTopic] = useState('test/topic');
    const [payload, setPayload] = useState('{"msg": "hello"}');
    const [qos, setQos] = useState<0 | 1 | 2>(0);
    const [retain, setRetain] = useState(false);
    const [format, setFormat] = useState<'text' | 'hex' | 'json'>('text');

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [session.logs]);

    const handleSend = () => {
        if (!session.isConnected || !topic) return;

        let data: string | Uint8Array = payload;

        if (format === 'hex') {
            // Convert Hex string to Uint8Array
            const cleanHex = payload.replace(/\s+/g, '');
            if (!/^[0-9A-Fa-f]*$/.test(cleanHex) || cleanHex.length % 2 !== 0) {
                // TODO: Show error
                return;
            }
            const bytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            data = bytes;
        } else if (format === 'json') {
            // Validate JSON
            try {
                JSON.parse(payload);
            } catch (e) {
                // Allow sending invalid JSON? User choice. Let's send as string.
            }
        }

        onPublish(topic, data, qos, retain);
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[#1e1e1e] font-mono text-sm">
            {/* Logs Area */}
            <div className="flex-1 overflow-auto p-4" ref={scrollRef}>
                {session.logs.length === 0 && (
                    <div className="text-[#666] italic text-center mt-10">
                        {session.isConnected ? 'Connected. Waiting for messages...' : 'Disconnected.'}
                    </div>
                )}
                {session.logs.map((log, i) => (
                    <div key={i} className="mb-1 break-words font-mono text-[13px] flex items-start gap-2 group hover:bg-[#2a2d2e] -mx-2 px-2 py-0.5">
                        <span className="text-[#666] shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>

                        {/* Direction & Type */}
                        <span className={`font-bold shrink-0 w-8 text-center ${log.type === 'RX' ? 'text-[#ce9178]' :
                            log.type === 'TX' ? 'text-[#4ec9b0]' :
                                log.type === 'ERROR' ? 'text-red-500' : 'text-[#569cd6]'
                            }`}>
                            {log.type === 'RX' ? 'IN' : log.type === 'TX' ? 'OUT' : log.type}
                        </span>

                        {/* Topic Pill */}
                        {log.topic && (
                            <span className="bg-[#333] text-[#9cdcfe] px-1.5 rounded text-[11px] shrink-0 border border-[#444]">
                                {log.topic}
                            </span>
                        )}

                        {/* Payload */}
                        <span className="text-[#d4d4d4] break-all whitespace-pre-wrap">
                            {(() => {
                                if (typeof log.data === 'string') return log.data;
                                try {
                                    return new TextDecoder().decode(log.data);
                                } catch (e) {
                                    return `[Binary ${log.data.length} bytes]`;
                                }
                            })()}
                        </span>
                    </div>
                ))}
            </div>

            {/* Rich Publish Area */}
            <div className="border-t border-[var(--vscode-border)] bg-[#252526] p-2 flex flex-col gap-2 shrink-0">
                {/* Top Row: Topic, QoS, Retain */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#3c3c3c] border border-[#3c3c3c] rounded-sm px-2 py-1 flex-1">
                        <span className="text-[#969696] text-[11px]">Topic</span>
                        <input
                            className="bg-transparent border-none outline-none text-[#cccccc] text-[12px] flex-1 font-mono"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="topic/path"
                        />
                        <History size={12} className="text-[#969696] cursor-pointer hover:text-white" />
                    </div>

                    <div className="flex items-center gap-1">
                        <span className="text-[#969696] text-[11px]">QoS</span>
                        <select
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-[12px] p-1 rounded-sm outline-none"
                            value={qos}
                            onChange={(e) => setQos(Number(e.target.value) as 0 | 1 | 2)}
                        >
                            <option value={0}>0</option>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1 cursor-pointer">
                        <input
                            type="checkbox"
                            id="retain-check"
                            checked={retain}
                            onChange={(e) => setRetain(e.target.checked)}
                            className="bg-[#3c3c3c]"
                        />
                        <label htmlFor="retain-check" className="text-[#969696] text-[11px] select-none cursor-pointer">Retain</label>
                    </div>
                </div>

                {/* Middle Row: Format & Payload */}
                <div className="flex gap-2 h-20">
                    <div className="flex flex-col gap-1 w-24 shrink-0">
                        <div className="flex flex-col gap-0.5 bg-[#1e1e1e] rounded p-0.5 border border-[#3c3c3c]">
                            {['text', 'json', 'hex'].map((fmt) => (
                                <div
                                    key={fmt}
                                    className={`text-[10px] text-center cursor-pointer py-1 rounded-sm uppercase ${format === fmt ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:bg-[#333]'}`}
                                    onClick={() => setFormat(fmt as any)}
                                >
                                    {fmt}
                                </div>
                            ))}
                        </div>
                    </div>

                    <textarea
                        className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc] p-2 text-[12px] font-mono outline-none focus:border-[var(--vscode-focusBorder)] resize-none"
                        value={payload}
                        onChange={(e) => setPayload(e.target.value)}
                        placeholder={`Enter ${format} payload...`}
                    />

                    <button
                        className={`w-16 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${session.isConnected ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white' : 'bg-[#2d2d2d] text-[#666] cursor-not-allowed'
                            }`}
                        onClick={handleSend}
                        disabled={!session.isConnected}
                    >
                        <Send size={16} />
                        <span className="text-[10px]">Send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
