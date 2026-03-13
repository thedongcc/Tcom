import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Send, Upload, Timer } from 'lucide-react';
import { Token } from '../../types/token';
import { tokenRegistry } from '../../tokens';
import { TokenConfigPopover } from './TokenConfigPopover';

// TipTap Imports
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SerialToken, SERIAL_TOKEN_CLICK_EVENT } from './SerialTokenExtension';
import { SuggestionExtension, getSuggestionOptions } from './SuggestionExtension';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
import { useSerialInputLogic } from './useSerialInputLogic';

interface SerialInputProps {
    onSend: (data: string | Uint8Array, mode: 'text' | 'hex') => void;
    sessionId?: string;
    initialContent?: string;
    initialHTML?: string;
    initialTokens?: Record<string, Token>;
    initialMode?: 'text' | 'hex';
    initialLineEnding?: string;
    initialTimerInterval?: number;
    isConnected?: boolean;
    fontSize?: number;
    fontFamily?: string;
    onConnectRequest?: () => Promise<void> | void;
    onStateChange?: (state: { content: string, html: string, tokens: Record<string, any>, mode: 'text' | 'hex', lineEnding: string, timerInterval: number }) => void;
    /** Hide toolbar, timer, and send button (e.g. for Command Editor) */
    hideExtras?: boolean;
}

export const SerialInput = ({
    onSend,
    sessionId,
    initialContent = '',
    initialHTML = '',
    initialTokens = {},
    initialMode = 'hex',
    initialLineEnding = '',
    initialTimerInterval = 1000,
    isConnected = false,
    fontSize = 15,
    fontFamily = 'AppCoreFont',
    onConnectRequest,
    onStateChange,
    hideExtras = false
}: SerialInputProps) => {
    const { showToast } = useToast();
    const { t } = useI18n();
    const [mode, setMode] = useState<'text' | 'hex'>(initialMode);
    const [lineEnding, setLineEnding] = useState<string>(initialLineEnding);
    const [isEmpty, setIsEmpty] = useState(true);
    const [popover, setPopover] = useState<{ id: string; type: string; x: number; y: number; pos: number } | null>(null);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [timerInterval, setTimerInterval] = useState(initialTimerInterval);
    const [timerIntervalInput, setTimerIntervalInput] = useState(initialTimerInterval.toString()); // String state for input
    // 编辑器内容版本号：每次 docChanged 时 +1，用于触发定时发送 effect 重新运行
    const [contentVersion, setContentVersion] = useState(0);
    // isSyncingRef：标记当前是内部同步（如 syncEditorDynamicTokens），不应触发 contentVersion 递增
    const isSyncingRef = useRef(false);
    const isReadyRef = useRef(false);

    // Memoize extensions to prevent editor re-creation on every render
    const extensions = useMemo(() => [
        StarterKit,
        SerialToken,
        SuggestionExtension.configure({
            suggestion: getSuggestionOptions(),
        }),
    ], []);

    // Memoize editorProps
    const editorProps = useMemo(() => ({
        attributes: {
            class: "absolute inset-0 bg-transparent text-[var(--input-foreground)] caret-[var(--app-foreground)] select-text z-10 p-2 break-all whitespace-pre-wrap outline-none border-none resize-none font-medium h-fit flex-1",
            style: `font-size: ${fontSize}px; font-family: ${fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)')};`
        },
    }), [fontSize, fontFamily]);

    // TipTap Editor
    // console.log('SerialInput: Initializing editor with content:', { initialHTML, initialContent });
    const editor = useEditor({
        extensions,
        content: initialHTML || initialContent,
        editorProps,
        onCreate: ({ editor }) => {
            setIsEmpty(editor.isEmpty);
            // Mark ready after initial render cycle to skip initial update
            setTimeout(() => { isReadyRef.current = true; }, 0);
        },
        onUpdate: ({ editor, transaction }) => {
            // Sync state to parent
            // Avoid syncing if no document change (e.g. selection only or initial parse)
            // Also ensure we are "ready" to avoid initial load trigger
            const currentEmpty = editor.isEmpty;
            if (currentEmpty !== isEmpty) setIsEmpty(currentEmpty);

            if ((!transaction.docChanged && !transaction.scrolledIntoView) || !isReadyRef.current) {
                return;
            }

            // 内容变化时递增版本号，但跳过内部同步（如 auto_inc 显示刷新）引起的变化
            if (transaction.docChanged && !isSyncingRef.current) {
                setContentVersion(v => v + 1);
            }

            if (onStateChange) {
                const json = editor.getJSON();
                const tokensMap: Record<string, Token> = {};
                type TraverseNode = { type?: string; attrs?: any; content?: TraverseNode[] };
                const traverse = (node: TraverseNode) => {
                    if (node.type === 'serialToken' && node.attrs) {
                        const { id, type, config } = node.attrs as { id: string, type: any, config: any };
                        tokensMap[id] = { id, type, config };
                    }
                    if (node.content) node.content.forEach(traverse);
                };
                traverse(json);

                onStateChange({
                    content: editor.getText(),
                    html: editor.getHTML(),
                    tokens: tokensMap,
                    mode,
                    lineEnding,
                    timerInterval
                });
            }
        },
    }, [extensions, editorProps]);

    // Helper to sync state to parent
    const syncState = useCallback(() => {
        if (!editor || !onStateChange || !isReadyRef.current) return;

        const json = editor.getJSON();
        const tokensMap: Record<string, Token> = {};
        type TraverseNode = { type?: string; attrs?: any; content?: TraverseNode[] };
        const traverse = (node: TraverseNode) => {
            if (node.type === 'serialToken' && node.attrs) {
                const { id, type, config } = node.attrs as { id: string, type: any, config: any };
                tokensMap[id] = { id, type, config };
            }
            if (node.content) node.content.forEach(traverse);
        };
        traverse(json);

        onStateChange({
            content: editor.getText(),
            html: editor.getHTML(),
            tokens: tokensMap,
            mode,
            lineEnding,
            timerInterval
        });
    }, [editor, onStateChange, mode, lineEnding, timerInterval]);

    // Sync on mode, lineEnding, or timerInterval change
    useEffect(() => {
        syncState();
    }, [mode, lineEnding, timerInterval, syncState]);

    // Initial sync once ready
    useEffect(() => {
        if (editor && isReadyRef.current) {
            syncState();
        }
    }, [editor, syncState]);

    // Handle Token Clicks
    useEffect(() => {
        const handleTokenClick = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            console.log('Token Click Event Received (Parent):', detail);
            setPopover({ id: detail.id, type: detail.type, x: detail.x, y: detail.y, pos: detail.pos });
        };
        window.addEventListener(SERIAL_TOKEN_CLICK_EVENT, handleTokenClick);
        return () => window.removeEventListener(SERIAL_TOKEN_CLICK_EVENT, handleTokenClick);
    }, []);

    // 通过 registry 获取默认配置，无需在此处硬编码 Token 类型
    const insertToken = (type: string) => {
        if (!editor) return;
        const plugin = tokenRegistry.get(type);
        if (!plugin) return;
        const config = plugin.defaultConfig();
        editor.chain().focus().insertSerialToken({ type, config }).run();
    };

    const updateTokenConfig = (id: string, newConfig: Record<string, unknown>) => {
        if (!editor || !popover) return;

        // Determine the node type based on the popover's token type
        editor.chain().focus().setNodeSelection(popover.pos).updateAttributes('serialToken', { config: newConfig }).run();
    };

    const deleteToken = () => {
        if (!editor || !popover) return;
        editor.chain().focus().setNodeSelection(popover.pos).deleteSelection().run();
        setPopover(null);
    };


    // ── 发送和定时逻辑（委托给 Hook） ──
    const { extractTokens, handleSend } = useSerialInputLogic({
        editor, mode, lineEnding, isConnected, isEmpty,
        sessionId, isTimerRunning, timerInterval, contentVersion, isSyncingRef,
        onSend, onConnectRequest,
    });


    return (
        <div
            className={`${hideExtras ? '' : 'border-t border-[var(--st-widget-border)]'} bg-[var(--st-sendarea-bg)] p-2 flex flex-col gap-2 shrink-0 select-none`}
            data-component="serial-input"
        >
            {/* Mode Switcher - always visible */}
            <div className="flex items-center gap-2 h-6 overflow-x-auto scrollbar-none">
                <div className="shrink-0 flex items-center gap-[1px] bg-[var(--st-btn-secondary-bg)] border border-[var(--st-widget-border)] rounded-sm overflow-hidden p-[2px]">
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'hex' ? 'bg-[var(--st-input-btn-mode-hex-active-bg)] text-[var(--button-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] hover:bg-[var(--list-hover-background)]'}`}
                        onClick={() => setMode('hex')}
                    >
                        HEX
                    </button>
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'text' ? 'bg-[var(--st-input-btn-mode-txt-active-bg)] text-[var(--button-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] hover:bg-[var(--list-hover-background)]'}`}
                        onClick={() => setMode('text')}
                    >
                        TXT
                    </button>
                </div>
                {/* Line Ending Selector 始终显示（文本模式下） */}
                {mode === 'text' && (
                    <div className="flex items-center gap-1">
                        <div className="shrink-0 w-[1px] h-4 bg-[var(--st-widget-border)] mr-1" />
                        <CustomSelect
                            value={lineEnding}
                            onChange={(val) => setLineEnding(val)}
                            allowCustom={true}
                            dropdownWidth={110}
                            items={[
                                { value: '', label: 'None' },
                                { value: '\n', label: 'LF (\\n)' },
                                { value: '\r', label: 'CR (\\r)' },
                                { value: '\r\n', label: 'CRLF (\\r\\n)' }
                            ]}
                            className="!w-[88px] [&_button]:!h-6 [&_div.h-7]:!h-6 [&_span.text-ellipsis]:!text-[10px] [&_input]:!text-[10px]"
                        />
                    </div>
                )}

                {!hideExtras && (
                    <>
                        <div className="shrink-0 w-[1px] h-4 bg-[var(--st-widget-border)] mx-1" />

                        {/* Token 工具栏按钮 — registry 驱动，自动渲染所有已注册插件 */}
                        {tokenRegistry.getAll().filter(p => p.toolbar).map(plugin => {
                            const tb = plugin.toolbar!;
                            return (
                                <Tooltip key={plugin.type} content={t(tb.tooltip) || tb.tooltip} position="bottom" wrapperClassName="flex">
                                    <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--st-input-btn-text)] rounded-sm transition-colors whitespace-nowrap"
                                        onClick={() => insertToken(plugin.type)}>
                                        {tb.icon.kind === 'lucide' ? (
                                            <tb.icon.component size={14} className={tb.icon.colorClass} />
                                        ) : (
                                            <div className={`flex items-center justify-center w-[14px] h-[14px] border ${tb.icon.borderColorClass} ${tb.icon.textColorClass} text-[9px] font-mono rounded-[2px] leading-none`}>{tb.icon.letter}</div>
                                        )}
                                        <span>{tb.shortLabel}</span>
                                    </button>
                                </Tooltip>
                            );
                        })}
                        <div className="shrink-0 w-[1px] h-4 bg-[var(--st-widget-border)] mx-1" />
                        <Tooltip content={t('serial.loadFile')} position="bottom" wrapperClassName="flex">
                            <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--st-input-btn-text)] rounded-sm transition-colors opacity-50 cursor-not-allowed whitespace-nowrap">
                                <Upload size={14} />
                                <span>File</span>
                            </button>
                        </Tooltip>
                        <div className="flex-1 shrink min-w-0" />
                        {/* Timed Send: flat toggle + input */}
                        <div className="shrink-0 w-[1px] h-4 bg-[var(--st-widget-border)]" />
                        <div className="shrink-0 flex items-center gap-1.5">
                            <Tooltip content={isTimerRunning ? t('serial.stopTimer') : (isEmpty ? t('serial.timerEmpty') : t('serial.startTimer'))} position="bottom" wrapperClassName="flex">
                                <button
                                    className={`flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-sm transition-colors cursor-pointer whitespace-nowrap ${isTimerRunning
                                        ? 'bg-[var(--st-input-btn-timer-active-bg)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)]'
                                        : ((!isTimerRunning && isEmpty) ? 'bg-[var(--st-btn-secondary-bg)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed' : 'bg-[var(--button-secondary-background)] text-[var(--button-foreground)] hover:bg-[var(--button-secondary-hover-background)]')
                                        }`}
                                    onClick={() => {
                                        if (!isTimerRunning && isEmpty) {
                                            showToast(t('toast.sendEmpty'), 'warning');
                                            return;
                                        }
                                        setIsTimerRunning(!isTimerRunning);
                                    }}
                                >
                                    <Timer size={14} />
                                    <span>{isTimerRunning ? 'Stop' : 'Timed'}</span>
                                </button>
                            </Tooltip>
                            <input
                                type="text"
                                className="w-12 h-[22px] bg-[var(--input-background)] border border-[var(--st-input-border)] text-[var(--st-input-text)] text-[11px] px-1 rounded-sm focus:border-[var(--st-input-focus-border)] outline-none text-center font-mono"
                                value={timerIntervalInput}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setTimerIntervalInput(val);
                                    if (/^\d+$/.test(val)) {
                                        const num = parseInt(val, 10);
                                        if (num > 0) setTimerInterval(Math.max(10, num));
                                    }
                                }}
                                onBlur={() => {
                                    if (timerIntervalInput === '' || !/^\d+$/.test(timerIntervalInput) || parseInt(timerIntervalInput, 10) <= 0) {
                                        setTimerIntervalInput(timerInterval.toString());
                                    }
                                }}
                                placeholder="1000"
                            />
                            <span className="text-[11px] text-[var(--st-input-timer-unit-text)]">ms</span>
                        </div>
                    </>
                )}
            </div>

            {/* Input Area */}
            <div className="flex gap-2 min-h-[80px]">

                <div
                    className="flex-1 bg-[var(--st-input-bg,var(--input-background))] border border-[var(--st-input-border)] rounded-sm focus-within:border-[var(--st-input-focus-border)] cursor-text flex flex-col bg-cover bg-center"
                    onClick={() => editor?.commands.focus()}
                    style={{ backgroundImage: 'var(--st-input-bg-img)' }}
                >
                    <EditorContent editor={editor} className="flex-1 outline-none" />
                </div>

                {!hideExtras && (
                    <Tooltip content={isConnected ? (isEmpty ? t('toast.sendEmpty') : t('serial.send')) : t('serial.connect')} position="left" wrapperClassName="flex items-stretch">
                        <button
                            className={`w-16 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${isConnected
                                ? (isEmpty ? 'bg-[var(--st-btn-secondary-bg)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed' : 'bg-[var(--st-input-btn-send-bg)] hover:bg-[var(--button-hover-background)] text-[var(--button-foreground)]')
                                : 'bg-[var(--st-btn-secondary-bg)] hover:bg-[var(--list-hover-background)] text-[var(--st-input-btn-text)] cursor-pointer border border-[var(--st-widget-border)] hover:border-[var(--st-input-focus-border)]'}`}
                            onClick={() => handleSend()}
                        >
                            {isConnected ? <Send size={16} /> : <div className="relative"><Send size={16} className="opacity-50" /><div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[var(--accent-color)] rounded-full border border-[var(--st-btn-secondary-bg)]"></div></div>}
                            <span className="text-[10px]">{isConnected ? t('serial.send') : t('serial.connect')}</span>
                        </button>
                    </Tooltip>
                )}
            </div>

            {/* Popover */}
            {popover && editor && (() => {
                let tokenData: Token | null = null;
                const node = editor.state.doc.nodeAt(popover.pos);
                console.log('Popover Lookup:', { pos: popover.pos, nodeType: node?.type.name, nodeId: node?.attrs.id, targetId: popover.id });

                if (node && (node.type.name === 'serialToken' || node.type.name === 'hexToken') && node.attrs.id === popover.id) {
                    tokenData = { id: popover.id, type: node.attrs.type, config: node.attrs.config };
                } else {
                    editor.state.doc.descendants((n) => {
                        if ((n.type.name === 'serialToken' || n.type.name === 'hexToken') && n.attrs.id === popover.id) {
                            tokenData = { id: popover.id, type: n.attrs.type, config: n.attrs.config };
                            return false;
                        }
                    });
                }

                if (!tokenData) return null;

                return (
                    <TokenConfigPopover
                        token={tokenData}
                        onUpdate={(id, cfg) => updateTokenConfig(id, cfg)}
                        onDelete={deleteToken}
                        onClose={() => setPopover(null)}
                        position={{ x: popover.x, y: popover.y }}
                    />
                );
            })()}
        </div>
    );
};
