/**
 * useMonitorTerminalState.ts
 * 监控器终端状态管理 Hook — 从 MonitorTerminal.tsx 中提取。
 * 管理 20+ 个 UI 状态、字体查询、UI 状态持久化和搜索/滚动逻辑。
 */
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useSession } from '../../context/SessionContext';
import { useLogSearch } from '../common/LogSearch';
import { SessionState } from '../../types/session';
import { matchesKeybinding, DEFAULT_KEYBINDINGS } from '../../utils/keybindings';

// ── 字体分类关键字 ──
const MONO_KEYWORDS = ['mono', 'console', 'code', 'courier', 'fixed', 'terminal'];

// ── 滚动位置缓存（跨组件实例共享） ──
const scrollPositions = new Map<string, number>();

/**
 * 查询系统可用字体并分类为等宽和比例字体
 */
function useAvailableFonts() {
    const [availableFonts, setAvailableFonts] = useState<any[]>([]);

    useEffect(() => {
        const queryFonts = window.queryLocalFonts || window.updateAPI?.listFonts;
        if (!queryFonts) return;

        queryFonts().then((res: any) => {
            const fonts = Array.isArray(res) ? res : ((res as { fonts?: string[] })?.fonts || []);
            const uniqueNames = Array.from(new Set(fonts.map((f: any) => typeof f === 'string' ? f : f.fullName))).sort();
            const mono: any[] = [];
            const prop: any[] = [];
            uniqueNames.forEach(name => {
                const lower = (name as string).toLowerCase();
                const item = { label: name as string, value: `"${name as string}"` };
                if (MONO_KEYWORDS.some(kw => lower.includes(kw))) { mono.push(item); } else { prop.push(item); }
            });
            const builtIn = [{ label: '内嵌字体 (Default)', value: 'AppCoreFont' }];
            setAvailableFonts([
                { label: '-- Built-in --', value: '', disabled: true }, ...builtIn,
                ...(mono.length > 0 ? [{ label: '-- Monospaced --', value: '', disabled: true }, ...mono] : []),
                ...(prop.length > 0 ? [{ label: '-- Proportional --', value: '', disabled: true }, ...prop] : [])
            ]);
        });
    }, []);

    return availableFonts;
}

/**
 * 监控器终端核心状态管理
 */
export function useMonitorTerminalState(session: SessionState) {
    const { config: themeConfig } = useSettings();
    const sessionManager = useSession();
    const { logs, isConnected, config } = session;
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialLogCountRef = useRef(logs.length);
    const mountTimeRef = useRef(Date.now());

    const monitorConfig = config as import('../../types/session').MonitorSessionConfig;
    const uiState = monitorConfig.uiState || {};

    // ── UI 状态（从会话配置持久化恢复） ──
    const [viewMode, setViewMode] = useState<'text' | 'hex' | 'both'>(uiState.viewMode || 'hex');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [showPacketType, setShowPacketType] = useState(uiState.showPacketType !== undefined ? uiState.showPacketType : true);
    const [showDataLength, setShowDataLength] = useState(uiState.showDataLength !== undefined ? uiState.showDataLength : false);
    const [mergeRepeats, setMergeRepeats] = useState(uiState.mergeRepeats !== undefined ? uiState.mergeRepeats : false);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>(uiState.encoding || 'utf-8');
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || themeConfig.typography.fontSize || 15);
    const [fontFamily, setFontFamily] = useState<string>(uiState.fontFamily || 'AppCoreFont');
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [flashNewMessage, setFlashNewMessage] = useState(uiState.flashNewMessage !== false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    const [showControlChars, setShowControlChars] = useState(uiState.showControlChars !== undefined ? uiState.showControlChars : false);
    const [showCRCPanel, setShowCRCPanel] = useState(false);
    const [sendTarget, setSendTarget] = useState<'virtual' | 'physical'>(uiState.sendTarget || 'physical');
    const [partnerConnected] = useState(true);
    const [searchOpen, setSearchOpen] = useState(uiState.searchOpen || false);

    // 字体大小跟随全局主题（当未自定义时）
    useEffect(() => {
        if (uiState.fontSize === undefined) {
            setFontSize(themeConfig.typography.fontSize || 15);
        }
    }, [themeConfig.typography.fontSize, uiState.fontSize]);

    const availableFonts = useAvailableFonts();

    // ── 持久化 UI 状态到会话配置 ──
    const saveUIState = useCallback((updates: any) => {
        const currentUIState = config.uiState || {};
        void sessionManager.updateSessionConfig(session.id, { uiState: { ...currentUIState, ...updates } } as Partial<import('../../types/session').SessionConfig>);
    }, [session.id, sessionManager, config]);

    // ── 数据格式化 ──
    const formatData = useCallback((data: string | Uint8Array, mode: string, enc: string) => {
        let hexStr = '';
        let textStr = '';
        if (mode === 'hex' || mode === 'both') {
            const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
            hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }
        if (mode === 'text' || mode === 'both') {
            if (typeof data === 'string') { textStr = data; }
            else { try { textStr = new TextDecoder(enc).decode(data); } catch { textStr = new TextDecoder().decode(data); } }
        }
        return mode === 'both' ? `${hexStr} [${textStr}]` : mode === 'hex' ? hexStr : textStr;
    }, []);

    const getDataLengthText = useCallback((data: string | Uint8Array) =>
        `${(typeof data === 'string' ? new TextEncoder().encode(data).length : data.length)}B`, []);

    // ── 搜索 ──
    const { query, setQuery, isRegex, setIsRegex, matchCase, setMatchCase, matches, currentIndex, nextMatch, prevMatch, regexError, activeMatchRev } =
        useLogSearch(logs, uiState.searchOpen ? (uiState.searchQuery || '') : '', uiState.searchRegex || false, uiState.searchMatchCase || false, viewMode, formatData, encoding);
    const activeMatch = matches[currentIndex];

    const handleQueryChange = (q: string) => { setQuery(q); saveUIState({ searchQuery: q }); };
    const handleRegexChange = (v: boolean) => { setIsRegex(v); saveUIState({ searchRegex: v }); };
    const handleMatchCaseChange = (v: boolean) => { setMatchCase(v); saveUIState({ searchMatchCase: v }); };
    const handleToggleSearch = useCallback(() => {
        setSearchOpen((prev: boolean) => { const next = !prev; saveUIState({ searchOpen: next }); return next; });
    }, [saveUIState]);

    // 搜索切换快捷键（从设置读取）
    const toggleSearchBinding = themeConfig.keybindings?.toggleSearch || DEFAULT_KEYBINDINGS.toggleSearch;
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (matchesKeybinding(e, toggleSearchBinding)) { e.preventDefault(); handleToggleSearch(); } };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleToggleSearch, toggleSearchBinding]);

    // 搜索结果自动滚动
    useEffect(() => {
        if (activeMatch && scrollRef.current) {
            const element = document.getElementById(`log-${activeMatch.logId}`);
            if (element) element.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
    }, [activeMatchRev]);

    // ── 自动滚动 ──
    useLayoutEffect(() => {
        if (autoScroll && scrollRef.current) { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; scrollPositions.set(session.id, scrollRef.current.scrollHeight); }
    }, [logs, autoScroll, session.id]);

    useLayoutEffect(() => {
        if (scrollRef.current && scrollPositions.has(session.id)) { scrollRef.current.scrollTop = scrollPositions.get(session.id)!; }
    }, [session.id]);

    useEffect(() => {
        if (!scrollRef.current || !autoScroll) return;
        const observer = new ResizeObserver(() => {
            if (scrollRef.current && scrollRef.current.clientHeight > 0) {
                if (scrollPositions.has(session.id)) { scrollRef.current.scrollTop = scrollPositions.get(session.id)!; }
            }
        });
        observer.observe(scrollRef.current);
        return () => observer.disconnect();
    }, [session.id, autoScroll]);

    // ── 日志过滤 ──
    const filteredLogs = useMemo(() => logs.filter(log => {
        if (log.type === 'INFO' || log.type === 'ERROR') return true;
        return filterMode === 'rx' ? log.topic === 'physical' : filterMode === 'tx' ? log.topic === 'virtual' : true;
    }), [logs, filterMode]);

    // ── 工具栏回调（带持久化） ──
    const handleFilterChange = useCallback((mode: 'all' | 'rx' | 'tx') => { setFilterMode(mode); saveUIState({ filterMode: mode }); }, [saveUIState]);
    const handleViewModeChange = useCallback((mode: 'text' | 'hex' | 'both') => { setViewMode(mode); saveUIState({ viewMode: mode }); }, [saveUIState]);
    const handleAutoScrollToggle = useCallback(() => {
        setAutoScroll((prev: boolean) => {
            const newState = !prev;
            saveUIState({ autoScroll: newState });
            if (newState && scrollRef.current) {
                requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
            }
            return newState;
        });
    }, [saveUIState]);

    const handleInputStateChange = useCallback((state: any) => {
        saveUIState({ inputContent: state.content, inputHTML: state.html, inputTokens: state.tokens, inputMode: state.mode, lineEnding: state.lineEnding, inputTimerInterval: state.timerInterval });
    }, [saveUIState]);

    return {
        // refs
        scrollRef, initialLogCountRef, mountTimeRef, scrollPositions,
        // 会话数据
        sessionManager, logs, isConnected, config, themeConfig, uiState,
        // UI 状态
        viewMode, showTimestamp, showPacketType, showDataLength,
        mergeRepeats, filterMode, encoding, fontSize, fontFamily,
        autoScroll, flashNewMessage, showOptionsMenu, showControlChars, showCRCPanel, sendTarget,
        partnerConnected, searchOpen, availableFonts,
        // 状态 setter（需要同步持久化的用 handle* 包装）
        setShowOptionsMenu, setShowCRCPanel, setSendTarget,
        // 格式化
        formatData, getDataLengthText,
        // 搜索
        query, isRegex, matchCase, matches, currentIndex, activeMatch, regexError,
        handleQueryChange, handleRegexChange, handleMatchCaseChange, handleToggleSearch,
        nextMatch, prevMatch,
        // 过滤与日志
        filteredLogs,
        // 工具栏回调
        handleFilterChange, handleViewModeChange, handleAutoScrollToggle,
        onShowTimestamp: (v: boolean) => { setShowTimestamp(v); saveUIState({ showTimestamp: v }); },
        onShowPacketType: (v: boolean) => { setShowPacketType(v); saveUIState({ showPacketType: v }); },
        onShowDataLength: (v: boolean) => { setShowDataLength(v); saveUIState({ showDataLength: v }); },
        onMergeRepeats: (v: boolean) => { setMergeRepeats(v); saveUIState({ mergeRepeats: v }); },
        onFlashNewMessage: (v: boolean) => { setFlashNewMessage(v); saveUIState({ flashNewMessage: v }); },
        onShowControlChars: (v: boolean) => { setShowControlChars(v); saveUIState({ showControlChars: v }); },
        onEncoding: (v: string) => { setEncoding(v as 'utf-8' | 'gbk' | 'ascii'); saveUIState({ encoding: v }); },
        onFontFamily: (v: string) => { setFontFamily(v); saveUIState({ fontFamily: v }); },
        onFontSize: (v: number) => { setFontSize(v); saveUIState({ fontSize: v }); },
        onSendTarget: (v: 'virtual' | 'physical') => { setSendTarget(v); saveUIState({ sendTarget: v }); },
        // 输入状态
        handleInputStateChange,
        saveUIState,
        // 日志统计
        txBytes: session.txBytes || 0,
        rxBytes: session.rxBytes || 0,
    };
}
