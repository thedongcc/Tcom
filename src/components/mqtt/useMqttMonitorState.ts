/**
 * useMqttMonitorState.ts
 * MQTT 监视器的状态管理 Hook。
 * 从 MqttMonitor.tsx 中拆分出来，负责所有 UI 状态的声明、初始化和持久化。
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { MqttSessionConfig } from '../../types/session';

/** 字体列表中的条目 */
interface FontItem {
    label: string;
    value: string;
    disabled?: boolean;
}

interface UseMqttMonitorStateParams {
    config: MqttSessionConfig;
    onUpdateConfig?: (updates: Partial<MqttSessionConfig>) => void;
}

// 等宽字体关键字（用于分类系统字体）
const MONO_KEYWORDS = ['mono', 'console', 'code', 'courier', 'fixed', 'terminal'];

export function useMqttMonitorState({ config, onUpdateConfig }: UseMqttMonitorStateParams) {
    const uiState = config.uiState || {};

    // 显示设置
    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'json' | 'base64'>(uiState.viewMode || 'text');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [flashNewMessage, setFlashNewMessage] = useState(uiState.flashNewMessage !== false);
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || 15);
    const [fontFamily, setFontFamily] = useState<string>(uiState.fontFamily || 'AppCoreFont');
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [availableFonts, setAvailableFonts] = useState<FontItem[]>([]);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);

    // 搜索状态
    const [searchOpen, setSearchOpen] = useState(uiState.searchOpen || false);

    // 发布区状态（从 uiState 恢复持久化数据）
    const [topic, setTopic] = useState(uiState.publishTopic || '');
    const [payload, setPayload] = useState(uiState.publishPayload || '{"msg": "hello"}');
    const [qos, setQos] = useState<0 | 1 | 2>(0);
    const [retain, setRetain] = useState(false);
    const [publishFormat, setPublishFormat] = useState<'text' | 'hex' | 'json' | 'base64'>(uiState.publishFormat || 'text');
    const [showTopicDropdown, setShowTopicDropdown] = useState(false);

    // 加载系统字体列表
    useEffect(() => {
        const queryFonts = (window as any).queryLocalFonts || (window as any).updateAPI?.listFonts;
        if (queryFonts) {
            queryFonts().then((res: any) => {
                const fonts = Array.isArray(res) ? res : (res?.fonts || []);
                const uniqueNames = Array.from(new Set(fonts.map((f: any) => typeof f === 'string' ? f : f.fullName))).sort();

                const mono: FontItem[] = [];
                const prop: FontItem[] = [];

                uniqueNames.forEach(name => {
                    const lower = (name as string).toLowerCase();
                    const item = { label: name as string, value: `"${name as string}"` };
                    if (MONO_KEYWORDS.some(kw => lower.includes(kw))) {
                        mono.push(item);
                    } else {
                        prop.push(item);
                    }
                });

                const builtIn: FontItem[] = [
                    { label: '内嵌字体 (Default)', value: 'AppCoreFont' },
                ];

                const final: FontItem[] = [
                    { label: '-- Built-in --', value: 'header-built-in', disabled: true },
                    ...builtIn,
                    ...(mono.length > 0 ? [{ label: '-- Monospaced --', value: 'header-mono', disabled: true }, ...mono] : []),
                    ...(prop.length > 0 ? [{ label: '-- Proportional --', value: 'header-prop', disabled: true }, ...prop] : [])
                ];
                setAvailableFonts(final);
            });
        }
    }, []);

    // 将 UI 状态变更持久化到 config
    const saveUIState = useCallback((updates: Record<string, unknown>) => {
        if (!onUpdateConfig) return;
        const currentUI = config.uiState || {};
        onUpdateConfig({
            uiState: {
                ...currentUI,
                viewMode, showTimestamp, showDataLength, autoScroll, flashNewMessage,
                fontSize, fontFamily, mergeRepeats, filterMode,
                ...updates,  // updates 最后展开，确保新值不被旧 state 覆盖
            }
        });
    }, [onUpdateConfig, config.uiState, viewMode, showTimestamp, showDataLength, autoScroll, flashNewMessage, fontSize, fontFamily, mergeRepeats, filterMode]);

    // 已订阅的主题列表
    const subscribedTopics = useMemo(() =>
        (config.topics || []).filter((t: any) => t.subscribed),
        [config.topics]
    );

    return {
        // 显示设置
        viewMode, setViewMode,
        showTimestamp, setShowTimestamp,
        showDataLength, setShowDataLength,
        autoScroll, setAutoScroll,
        flashNewMessage, setFlashNewMessage,
        fontSize, setFontSize,
        fontFamily, setFontFamily,
        mergeRepeats, setMergeRepeats,
        filterMode, setFilterMode,
        availableFonts,
        showOptionsMenu, setShowOptionsMenu,
        // 搜索
        searchOpen, setSearchOpen,
        // 发布区
        topic, setTopic,
        payload, setPayload,
        qos, setQos,
        retain, setRetain,
        publishFormat, setPublishFormat,
        showTopicDropdown, setShowTopicDropdown,
        // 工具函数
        saveUIState,
        subscribedTopics,
        // 原始 UI state（给子组件读取搜索初始值用）
        uiState,
    };
}
