/**
 * MqttMonitor.tsx
 * MQTT 监视器主组件 — 组装工具栏、日志列表和发布区。
 *
 * 子模块：
 * - useMqttMonitorState.ts — 所有 UI 状态管理
 * - MqttMonitorToolbar.tsx — 工具栏 UI
 * - MqttPublishArea.tsx   — 消息发布区 UI
 * - useMqttMonitorActions.ts — 操作函数（发送、导出等）
 * - MqttLogItem.tsx — 单条日志渲染
 */
import { MqttSessionConfig, LogEntry } from '../../types/session';
import { useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { mqttTopicMatch } from '../../utils/mqttUtils';
import { LogSearch, useLogSearch } from '../common/LogSearch';
import { useMqttMonitorActions } from './useMqttMonitorActions';
import { MqttLogItem } from './MqttLogItem';
import { useMqttMonitorState } from './useMqttMonitorState';
import { MqttMonitorToolbar } from './MqttMonitorToolbar';
import { MqttPublishArea } from './MqttPublishArea';
import { matchesKeybinding, DEFAULT_KEYBINDINGS } from '../../utils/keybindings';
import { useSettings } from '../../context/SettingsContext';
import { useSession } from '../../context/SessionContext';

interface MqttMonitorProps {
    session: {
        id: string;
        config: MqttSessionConfig;
        isConnected: boolean;
        isConnecting: boolean;
        logs: LogEntry[];
    };
    onShowSettings?: (view: string) => void;
    onPublish: (topic: string, payload: string | Uint8Array, qos: 0 | 1 | 2, retain: boolean) => void;
    onUpdateConfig?: (updates: Partial<MqttSessionConfig>) => void;
    onClearLogs?: () => void;
    onConnectRequest?: () => Promise<boolean>;
}

const scrollPositions = new Map<string, number>();

export const MqttMonitor = ({ session, onShowSettings, onPublish, onUpdateConfig, onClearLogs, onConnectRequest }: MqttMonitorProps) => {
    const { logs, isConnected, config } = session;
    const { disconnectSession } = useSession();
    const scrollRef = useRef<HTMLDivElement>(null);

    // ── 状态管理 ──
    const state = useMqttMonitorState({ config, onUpdateConfig });
    const {
        viewMode, setViewMode,
        showTimestamp, showDataLength,
        autoScroll, setAutoScroll,
        flashNewMessage, fontSize, fontFamily,
        mergeRepeats, filterMode, setFilterMode,
        availableFonts,
        showOptionsMenu, setShowOptionsMenu,
        searchOpen, setSearchOpen,
        topic, payload, publishFormat, qos, retain,
        saveUIState, subscribedTopics, uiState,
    } = state;

    // ── 数据格式化 ──
    const formatData = useCallback((data: string | Uint8Array, mode: string, _encoding: string = 'utf-8') => {
        if (mode === 'hex') {
            const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
            return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }
        if (mode === 'json') {
            try {
                const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
                const obj = JSON.parse(str);
                return JSON.stringify(obj, null, 2);
            } catch { /* fallback */ }
        }
        if (mode === 'base64') {
            try {
                const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
                const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
                return btoa(binString);
            } catch { return '[Base64 Error]'; }
        }
        if (typeof data === 'string') return data;
        try {
            return new TextDecoder().decode(data);
        } catch {
            return `[Binary ${data.length} bytes]`;
        }
    }, []);

    // ── 操作函数 ──
    const { handleSend, handleSaveLogs, formatTimestamp, getDataLengthText } = useMqttMonitorActions({
        isConnected, topic, payload, publishFormat, qos, retain,
        logs, viewMode, formatData,
        onPublish, onShowSettings, onConnectRequest,
    });

    // ── 搜索 ──
    const {
        query, setQuery, isRegex, setIsRegex, matchCase, setMatchCase,
        matches, currentIndex, nextMatch, prevMatch, regexError, activeMatchRev
    } = useLogSearch(logs, uiState.searchOpen ? (uiState.searchQuery || '') : '', uiState.searchRegex || false, uiState.searchMatchCase || false, viewMode, formatData, 'utf-8');
    const activeMatch = matches[currentIndex];

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        saveUIState({ searchQuery: newQuery });
    };

    const handleRegexChange = (newRegex: boolean) => {
        setIsRegex(newRegex);
        saveUIState({ searchRegex: newRegex });
    };

    const handleMatchCaseChange = (newMatchCase: boolean) => {
        setMatchCase(newMatchCase);
        saveUIState({ searchMatchCase: newMatchCase });
    };

    const handleToggleSearch = useCallback(() => {
        setSearchOpen(prev => {
            const next = !prev;
            saveUIState({ searchOpen: next });
            return next;
        });
    }, [saveUIState, setSearchOpen]);

    // 搜索切换快捷键（从设置读取）
    const { config: settingsConfig } = useSettings();
    const toggleSearchBinding = settingsConfig.keybindings?.toggleSearch || DEFAULT_KEYBINDINGS.toggleSearch;
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (matchesKeybinding(e, toggleSearchBinding)) {
                e.preventDefault();
                handleToggleSearch();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleToggleSearch, toggleSearchBinding]);

    // 搜索结果自动滚动
    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }, [activeMatchRev]);

    // ── 新消息闪烁屏障 ──
    const initialLogCountRef = useRef(logs.length);
    const mountTimeRef = useRef(Date.now());

    useEffect(() => {
        mountTimeRef.current = Date.now();
        initialLogCountRef.current = logs.length;
    }, []);

    // ── 日志过滤 ──
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (log.type === 'INFO' || log.type === 'ERROR') return true;
            if (filterMode === 'tx' && log.type !== 'TX') return false;
            if (filterMode === 'rx' && log.type !== 'RX') return false;
            if (log.topic && (log.type === 'RX' || log.type === 'TX')) {
                const topicConfigs = config.topics || [];
                if (topicConfigs.length > 0) {
                    const matched = topicConfigs.filter(t => mqttTopicMatch(t.path, log.topic!));
                    if (matched.length > 0) return matched.some(m => m.subscribed);
                }
            }
            return true;
        });
    }, [logs, filterMode, config.topics]);

    useLayoutEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            scrollPositions.set(session.id, scrollRef.current.scrollHeight);
        }
    }, [filteredLogs.length, autoScroll, session.id]);

    useLayoutEffect(() => {
        if (scrollRef.current && scrollPositions.has(session.id)) {
            scrollRef.current.scrollTop = scrollPositions.get(session.id)!;
        }
    }, [session.id]);

    useEffect(() => {
        if (!scrollRef.current) return;
        const observer = new ResizeObserver(() => {
            if (scrollRef.current && scrollRef.current.clientHeight > 0) {
                if (autoScroll) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                } else if (scrollPositions.has(session.id)) {
                    scrollRef.current.scrollTop = scrollPositions.get(session.id)!;
                }
            }
        });
        observer.observe(scrollRef.current);
        return () => observer.disconnect();
    }, [session.id, autoScroll]);

    // 计算字体样式
    const fontStyle = fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)');

    return (
        <div
            className="absolute inset-0 flex flex-col bg-[var(--st-mqtt-monitor-bg)] select-none"
            data-component="mqtt-monitor"
        >
            <style>{`
                @keyframes flash-new { 
                    0% { background-color: rgba(30, 255, 0, 0.2); } 
                    100% { background-color: var(--input-background); } 
                } 
                .animate-flash-new { 
                    animation: flash-new 1s ease-out forwards; 
                }
            `}</style>

            {/* 工具栏 */}
            <MqttMonitorToolbar
                isConnected={isConnected}
                host={config.host}
                port={config.port}
                logs={logs}
                filterMode={filterMode}
                setFilterMode={setFilterMode}
                viewMode={viewMode}
                setViewMode={setViewMode}
                showOptionsMenu={showOptionsMenu}
                setShowOptionsMenu={setShowOptionsMenu}
                encoding={state.encoding}
                setEncoding={state.setEncoding}
                showControlChars={state.showControlChars}
                setShowControlChars={state.setShowControlChars}
                showPacketType={state.showPacketType}
                setShowPacketType={state.setShowPacketType}
                flashNewMessage={state.flashNewMessage}
                setFlashNewMessage={state.setFlashNewMessage}
                showTimestamp={state.showTimestamp}
                setShowTimestamp={state.setShowTimestamp}
                showDataLength={state.showDataLength}
                setShowDataLength={state.setShowDataLength}
                mergeRepeats={state.mergeRepeats}
                setMergeRepeats={state.setMergeRepeats}
                fontSize={state.fontSize}
                setFontSize={state.setFontSize}
                fontFamily={state.fontFamily}
                setFontFamily={state.setFontFamily}
                availableFonts={availableFonts}
                autoScroll={autoScroll}
                setAutoScroll={setAutoScroll}
                saveUIState={saveUIState}
                uiState={uiState}
                onClearLogs={onClearLogs}
                handleSaveLogs={handleSaveLogs}
                onDisconnect={() => disconnectSession(session.id)}
                onConnect={onConnectRequest ? () => onConnectRequest() : undefined}
            />

            {/* 日志区域 */}
            <div className="flex-1 relative overflow-hidden">
                <div className="absolute top-4 right-4 z-10">
                    <LogSearch
                        isOpen={searchOpen}
                        onToggle={handleToggleSearch}
                        query={query}
                        isRegex={isRegex}
                        isMatchCase={matchCase}
                        onQueryChange={handleQueryChange}
                        onRegexChange={handleRegexChange}
                        onMatchCaseChange={handleMatchCaseChange}
                        onNext={nextMatch}
                        onPrev={prevMatch}
                        logs={logs}
                        currentIndex={currentIndex}
                        totalMatches={matches.length}
                        viewMode={viewMode}
                        formatData={formatData}
                        encoding="utf-8"
                        regexError={regexError}
                    />
                </div>
                <div
                    className="absolute inset-0 overflow-auto p-2 flex flex-col gap-1.5 select-text"
                    ref={scrollRef}
                    onScroll={(e) => scrollPositions.set(session.id, e.currentTarget.scrollTop)}
                    style={{ fontSize: `${fontSize}px`, fontFamily: fontStyle, lineHeight: '1.5' }}
                >
                    {filteredLogs.map((log, index) => {
                        const isTX = log.type === 'TX';
                        const isNewLog = flashNewMessage && (Date.now() - log.timestamp < 300);
                        const topicColor = (config.topics || []).find(t => t.path === log.topic)?.color || (isTX ? 'var(--st-mqtt-topic-default-tx-color)' : 'var(--st-mqtt-topic-default-rx-color)');

                        return (
                            <MqttLogItem
                                key={`${log.id}-${log.repeatCount || 1}`}
                                log={log}
                                isNewLog={isNewLog}
                                isTX={isTX}
                                topicColor={topicColor}
                                viewMode={viewMode}
                                showTimestamp={showTimestamp}
                                showDataLength={showDataLength}
                                mergeRepeats={mergeRepeats}
                                flashNewMessage={flashNewMessage}
                                fontSize={fontSize}
                                formatTimestamp={formatTimestamp}
                                getDataLengthText={getDataLengthText}
                                formatData={formatData}
                                matches={matches}
                                activeMatch={activeMatch}
                            />
                        );
                    })}
                </div>
            </div>

            {/* 发布区 */}
            <MqttPublishArea
                isConnected={isConnected}
                isConnecting={session.isConnecting}
                topic={state.topic}
                setTopic={state.setTopic}
                showTopicDropdown={state.showTopicDropdown}
                setShowTopicDropdown={state.setShowTopicDropdown}
                subscribedTopics={subscribedTopics}
                payload={state.payload}
                setPayload={state.setPayload}
                publishFormat={state.publishFormat}
                setPublishFormat={state.setPublishFormat}
                qos={state.qos}
                setQos={state.setQos}
                retain={state.retain}
                setRetain={state.setRetain}
                fontSize={fontSize}
                fontFamily={fontFamily}
                saveUIState={saveUIState}
                handleSend={handleSend}
            />
        </div >
    );
};
