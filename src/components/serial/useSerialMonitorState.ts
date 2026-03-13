/**
 * useSerialMonitorState.ts
 * 串口监视器的显示状态管理 Hook。
 * 从 SerialMonitor.tsx 中拆分出来，管理视图模式、编码、字体、过滤器等 UI 状态，
 * 并负责将这些状态持久化到 uiState。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionConfig } from '../../types/session';

/** 可用字体列表分类关键词 */
const MONO_KEYWORDS = ['mono', 'console', 'code', 'courier', 'fixed', 'terminal'];

export interface SerialMonitorDisplayState {
    viewMode: 'text' | 'hex' | 'both';
    setViewMode: (mode: 'text' | 'hex' | 'both') => void;
    showTimestamp: boolean;
    setShowTimestamp: (show: boolean) => void;
    showPacketType: boolean;
    setShowPacketType: (show: boolean) => void;
    showDataLength: boolean;
    setShowDataLength: (show: boolean) => void;
    showControlChars: boolean;
    setShowControlChars: (show: boolean) => void;
    mergeRepeats: boolean;
    setMergeRepeats: (merge: boolean) => void;
    filterMode: 'all' | 'rx' | 'tx';
    setFilterMode: (mode: 'all' | 'rx' | 'tx') => void;
    encoding: 'utf-8' | 'gbk' | 'ascii';
    setEncoding: (enc: 'utf-8' | 'gbk' | 'ascii') => void;
    fontSize: number;
    setFontSize: (size: number) => void;
    fontFamily: string;
    setFontFamily: (family: string) => void;
    autoScroll: boolean;
    setAutoScroll: (scroll: boolean) => void;
    flashNewMessage: boolean;
    setFlashNewMessage: (flash: boolean) => void;
    showCRCPanel: boolean;
    setShowCRCPanel: (show: boolean) => void;
    showOptionsMenu: boolean;
    setShowOptionsMenu: (show: boolean) => void;
    optionsMenuPos: { top: number; right: number };
    setOptionsMenuPos: (pos: { top: number; right: number }) => void;
    searchOpen: boolean;
    setSearchOpen: (open: boolean) => void;
    availableFonts: any[];
    uiState: Record<string, any>;
    saveUIState: (updates: Record<string, unknown>) => void;
}

/**
 * 初始化并管理串口监视器的所有显示相关状态。
 * 状态变更自动持久化到 session 的 uiState 中。
 */
export function useSerialMonitorState(
    config: SessionConfig,
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void,
): SerialMonitorDisplayState {
    const uiState = ((config as any).uiState as Record<string, any>) || {};

    // ── 显示状态 ──
    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'both'>((uiState.viewMode as any) || 'hex');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? !!uiState.showTimestamp : true);
    const [showPacketType, setShowPacketType] = useState(uiState.showPacketType !== undefined ? !!uiState.showPacketType : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? !!uiState.showDataLength : false);
    const [showControlChars, setShowControlChars] = useState(uiState.showControlChars !== undefined ? !!uiState.showControlChars : true);
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? !!uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>((uiState.filterMode as any) || 'all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>((uiState.encoding as any) || 'utf-8');
    const [fontSize, setFontSize] = useState<number>((uiState.fontSize as any) || 15);
    const [fontFamily, setFontFamily] = useState<string>((uiState.fontFamily as any) || 'AppCoreFont');
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [flashNewMessage, setFlashNewMessage] = useState(uiState.flashNewMessage !== false);

    // ── UI 控制状态 ──
    const [showCRCPanel, setShowCRCPanel] = useState(false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    const [optionsMenuPos, setOptionsMenuPos] = useState({ top: 0, right: 0 });
    const [searchOpen, setSearchOpen] = useState(!!uiState.searchOpen);

    // ── 字体列表 ──
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);

    useEffect(() => {
        const queryFonts = (window as unknown as Record<string, any>).queryLocalFonts || (window as unknown as Record<string, any>).updateAPI?.listFonts;
        if (queryFonts) {
            ((queryFonts as any)() as Promise<any>).then((res: any) => {
                const fonts = Array.isArray(res) ? res : ((res as any)?.fonts || []);
                const uniqueNames = Array.from(new Set(fonts.map((f: any) => typeof f === 'string' ? f : (f as any).fullName))).sort();

                const mono: Record<string, string>[] = [];
                const prop: Record<string, string>[] = [];

                uniqueNames.forEach(name => {
                    const lower = (name as string).toLowerCase();
                    const item = { label: name as string, value: `"${name as string}"` };
                    if (MONO_KEYWORDS.some(kw => lower.includes(kw))) {
                        mono.push(item);
                    } else {
                        prop.push(item);
                    }
                });

                const builtIn = [
                    { label: '内嵌字体 (Default)', value: 'AppCoreFont' },
                ];

                const final = [
                    { label: '-- Built-in --', value: 'header-built-in', disabled: true },
                    ...builtIn,
                    ...(mono.length > 0 ? [{ label: '-- Monospaced --', value: 'header-mono', disabled: true }, ...mono] : []),
                    ...(prop.length > 0 ? [{ label: '-- Proportional --', value: 'header-prop', disabled: true }, ...prop] : [])
                ];
                setAvailableFonts(final as any[]);
            });
        }
    }, []);

    // ── UI 状态持久化 ──
    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        return () => {
            const timeout = saveTimeoutRef.current;
            if (timeout) clearTimeout(timeout);
        };
    }, []);

    const saveUIState = useCallback((updates: Record<string, unknown>) => {
        if (!onUpdateConfig) return;

        const currentUIState = (configRef.current as unknown as Record<string, unknown>).uiState as Record<string, unknown> || {};

        // 逐字段比较，避免无意义更新
        const hasChanges = Object.keys(updates).some(k =>
            JSON.stringify(updates[k]) !== JSON.stringify(currentUIState[k])
        );

        if (!hasChanges) return;

        onUpdateConfig({ uiState: { ...currentUIState, ...updates } } as Partial<SessionConfig>);
    }, [onUpdateConfig]);

    return {
        viewMode, setViewMode,
        showTimestamp, setShowTimestamp,
        showPacketType, setShowPacketType,
        showDataLength, setShowDataLength,
        showControlChars, setShowControlChars,
        mergeRepeats, setMergeRepeats,
        filterMode, setFilterMode,
        encoding, setEncoding,
        fontSize, setFontSize,
        fontFamily, setFontFamily,
        autoScroll, setAutoScroll,
        flashNewMessage, setFlashNewMessage,
        showCRCPanel, setShowCRCPanel,
        showOptionsMenu, setShowOptionsMenu,
        optionsMenuPos, setOptionsMenuPos,
        searchOpen, setSearchOpen,
        availableFonts,
        uiState,
        saveUIState,
    };
}
