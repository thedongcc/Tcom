/**
 * MqttPublishArea.tsx
 * MQTT 发布区域组件。
 * 从 MqttMonitor.tsx 中拆分出来，负责消息发布 UI（Topic 选择、Payload 输入、QoS、Retain、发送按钮）。
 */
import React, { useRef, useEffect } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';

interface MqttPublishAreaProps {
    isConnected: boolean;
    isConnecting?: boolean;
    // Topic
    topic: string;
    setTopic: (v: string) => void;
    showTopicDropdown: boolean;
    setShowTopicDropdown: (v: boolean) => void;
    subscribedTopics: any[];
    // Payload
    payload: string;
    setPayload: (v: string) => void;
    // 格式
    publishFormat: 'text' | 'hex' | 'json' | 'base64';
    setPublishFormat: (v: 'text' | 'hex' | 'json' | 'base64') => void;
    // QoS & Retain
    qos: 0 | 1 | 2;
    setQos: (v: 0 | 1 | 2) => void;
    retain: boolean;
    setRetain: (v: boolean) => void;
    // 字体设置
    fontSize: number;
    fontFamily: string;
    // 操作回调
    saveUIState: (updates: Record<string, unknown>) => void;
    handleSend: () => void;
}

export const MqttPublishArea = React.memo(({
    isConnected, isConnecting,
    topic, setTopic,
    showTopicDropdown, setShowTopicDropdown,
    subscribedTopics,
    payload, setPayload,
    publishFormat, setPublishFormat,
    qos, setQos,
    retain, setRetain,
    fontSize, fontFamily,
    saveUIState, handleSend,
}: MqttPublishAreaProps) => {
    const { t } = useI18n();
    const topicDropdownRef = useRef<HTMLDivElement>(null);

    // Topic 下拉框点击外部关闭
    useEffect(() => {
        if (!showTopicDropdown) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (topicDropdownRef.current && !topicDropdownRef.current.contains(e.target as Node)) {
                setShowTopicDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showTopicDropdown, setShowTopicDropdown]);

    // 计算字体样式
    const fontStyle = fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)');

    return (
        <div className="border-t border-[var(--st-widget-border)] bg-[var(--st-sendarea-bg)] p-2 flex flex-col gap-2 shrink-0 select-none">
            {/* 第一行：格式下拉 + Topic 选择 + QoS + Retain */}
            <div className="flex items-center gap-2 h-[26px]">
                {/* 格式选择下拉 */}
                <div className="shrink-0">
                    <CustomSelect
                        className="!w-[80px] [&_button]:!h-[26px] [&_div.h-7]:!h-[26px] [&_span.text-ellipsis]:!text-[11px]"
                        items={[
                            { label: 'Text', value: 'text' },
                            { label: 'JSON', value: 'json' },
                            { label: 'Base64', value: 'base64' },
                            { label: 'HEX', value: 'hex' },
                        ]}
                        value={publishFormat}
                        onChange={(val) => { setPublishFormat(val as 'text' | 'hex' | 'json' | 'base64'); saveUIState({ publishFormat: val }); }}
                    />
                </div>
                {/* Topic 输入框 */}
                <div className="relative flex-1 h-full" ref={topicDropdownRef}>
                    <div className="flex items-center gap-1.5 bg-[var(--input-background)] border border-[var(--input-border-color)] rounded px-2 h-full focus-within:border-[var(--focus-border-color)] cursor-text" onClick={() => document.getElementById('mqtt-topic-input')?.focus()}>
                        <span className="text-[var(--input-placeholder-color)] text-[11px] shrink-0 font-bold">Topic</span>
                        <div className="w-[1px] h-3 bg-[var(--st-widget-border)]"></div>
                        <input
                            id="mqtt-topic-input"
                            className="bg-transparent border-none outline-none text-[var(--input-foreground)] text-[12px] flex-1 font-mono min-w-0"
                            value={topic}
                            onChange={e => { setTopic(e.target.value); saveUIState({ publishTopic: e.target.value }); }}
                            placeholder="输入或选择主题..."
                        />
                        {subscribedTopics.length > 0 && (
                            <Tooltip content={t('mqtt.addTopic')} position="top" wrapperClassName="shrink-0 flex items-center">
                                <button
                                    className={`shrink-0 p-0.5 rounded hover:bg-[var(--list-hover-background)] text-[var(--input-placeholder-color)] hover:text-[var(--input-foreground)] transition-colors ${showTopicDropdown ? 'text-[var(--input-foreground)]' : ''}`}
                                    onClick={() => setShowTopicDropdown(!showTopicDropdown)}
                                >
                                    <ChevronDown size={12} />
                                </button>
                            </Tooltip>
                        )}
                    </div>
                    {showTopicDropdown && subscribedTopics.length > 0 && (
                        <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--menu-background)] border border-[var(--menu-border-color)] rounded shadow-lg z-50 max-h-40 overflow-auto">
                            {subscribedTopics.map((t: any) => (
                                <div
                                    key={t.path}
                                    className={`px-2 py-1.5 text-[11px] font-mono cursor-pointer hover:bg-[var(--list-hover-background)] flex items-center gap-1.5 ${topic === t.path ? 'text-[var(--st-mqtt-topic-selected-text)] font-bold' : 'text-[var(--input-foreground)]'}`}
                                    onClick={() => { setTopic(t.path); saveUIState({ publishTopic: t.path }); setShowTopicDropdown(false); }}
                                >
                                    {t.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />}
                                    {t.path}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="shrink-0">
                    <CustomSelect
                        className="!w-[68px] [&_button]:!h-[26px] [&_div.h-7]:!h-[26px] [&_span.text-ellipsis]:!text-[11px]"
                        items={[
                            { label: 'QoS 0', value: '0' },
                            { label: 'QoS 1', value: '1' },
                            { label: 'QoS 2', value: '2' },
                        ]}
                        value={String(qos)}
                        onChange={(val) => setQos(Number(val) as 0 | 1 | 2)}
                    />
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer select-none bg-[var(--input-background)] border border-[var(--input-border-color)] px-2 rounded h-full hover:bg-[var(--list-hover-background)] transition-colors shrink-0">
                    <input type="checkbox" className="accent-[var(--button-background)] w-3 h-3 cursor-pointer" checked={retain} onChange={e => setRetain(e.target.checked)} />
                    <span className="text-[var(--input-foreground)] text-[11px]">Retain</span>
                </label>
            </div>
            {/* 第二行：输入框 + 发送按钮 */}
            <div className="flex gap-2 items-stretch">
                <textarea
                    className="flex-1 bg-[var(--st-input-bg,var(--input-background))] border border-[var(--input-border-color)] text-[var(--input-foreground)] p-2 outline-none resize-none focus:border-[var(--focus-border-color)] rounded h-[80px] select-text"
                    style={{ fontSize: `${fontSize}px`, fontFamily: fontStyle }}
                    value={payload}
                    onChange={e => { setPayload(e.target.value); saveUIState({ publishPayload: e.target.value }); }}
                />
                <button
                    className={`w-16 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${isConnected
                        ? (payload.trim() === '' ? 'bg-[var(--input-background)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed' : 'bg-[var(--st-mqtt-btn-send-bg)] hover:bg-[var(--button-hover-background)] text-white')
                        : 'bg-[var(--input-background)] hover:bg-[var(--list-hover-background)] text-[var(--st-monitor-btn-text)] cursor-pointer border border-[var(--border-color)] hover:border-[var(--focus-border-color)]'
                        }`}
                    onClick={handleSend}
                    disabled={isConnecting}
                >
                    {isConnected
                        ? <Send size={16} />
                        : <div className="relative"><Send size={16} className="opacity-50" /><div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[var(--accent-color)] rounded-full border border-[var(--sidebar-background)]" /></div>
                    }
                    <span className="text-[10px]">{isConnected ? t('serial.send') : t('mqtt.connect')}</span>
                </button>
            </div>
        </div>
    );
});

MqttPublishArea.displayName = 'MqttPublishArea';
