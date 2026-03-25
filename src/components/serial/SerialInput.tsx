/**
 * SerialInput.tsx
 * 串口输入组件 — TipTap 编辑器 + Token 管理 + 发送按钮。
 *
 * 子模块：
 * - SerialInputToolbar.tsx   — 工具栏 UI（模式切换、行尾符、Token 按钮、定时发送）
 * - useSerialInputLogic.ts   — 发送和定时逻辑
 * - tokenTraversal.ts        — Token 遍历提取工具
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Send } from 'lucide-react';
import { Token } from '../../types/token';
import { extractTokensFromJSON } from '../../utils/tokenTraversal';
import { tokenRegistry } from '../../tokens';
import { TokenConfigPopover } from './TokenConfigPopover';

// TipTap Imports
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SerialToken, SERIAL_TOKEN_CLICK_EVENT } from './SerialTokenExtension';
import { SuggestionExtension, getSuggestionOptions } from './SuggestionExtension';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { useSerialInputLogic } from './useSerialInputLogic';
import { SerialInputToolbar } from './SerialInputToolbar';

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
    /** Hide top border (e.g. when nested inside Monitor with target selector) */
    hideBorderTop?: boolean;
    /** 原生高精度定时器启动接口（固定帧）*/
    onTimedSendStart?: (sessionId: string, data: number[], intervalMs: number) => void;
    /** 动态帧定时器启动接口（Ring Buffer + 时间戳 Slot 原位填充）*/
    onTimedSendStartDynamic?: (sessionId: string, frames: number[][], intervalMs: number, timestampSlots: Array<{ byteOffset: number; byteSize: number; byteOrder: string; format: string }>) => void;
    /** 原生高精度定时器停止接口 */
    onTimedSendStop?: (sessionId: string) => void;
}

export const SerialInput = ({
    onSend, sessionId,
    initialContent = '', initialHTML = '',
    initialMode = 'hex', initialLineEnding = '', initialTimerInterval = 1000,
    isConnected = false, fontSize = 15, fontFamily = 'AppCoreFont',
    onConnectRequest, onStateChange, hideExtras = false, hideBorderTop = false,
    onTimedSendStart, onTimedSendStartDynamic, onTimedSendStop
}: SerialInputProps) => {
    const { t } = useI18n();
    const [mode, setMode] = useState<'text' | 'hex'>(initialMode);
    const [lineEnding, setLineEnding] = useState<string>(initialLineEnding);
    const [isEmpty, setIsEmpty] = useState(true);
    const [popover, setPopover] = useState<{ id: string; type: string; x: number; y: number; pos: number } | null>(null);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [timerInterval, setTimerInterval] = useState(initialTimerInterval);
    const [timerIntervalInput, setTimerIntervalInput] = useState(initialTimerInterval.toString());
    // 编辑器内容版本号
    const [contentVersion, setContentVersion] = useState(0);
    const isSyncingRef = useRef(false);
    const isReadyRef = useRef(false);

    // ── TipTap 编辑器配置 ──
    const extensions = useMemo(() => [
        StarterKit,
        SerialToken,
        SuggestionExtension.configure({
            suggestion: getSuggestionOptions(),
        }),
    ], []);

    const editorProps = useMemo(() => ({
        attributes: {
            class: "absolute inset-0 bg-transparent text-[var(--input-foreground)] caret-[var(--app-foreground)] select-text z-10 p-2 break-all whitespace-pre-wrap outline-none border-none resize-none font-medium h-fit flex-1",
            style: `font-size: ${fontSize}px; font-family: ${fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily === 'AppCoreFont' ? 'AppCoreFont' : (fontFamily || 'var(--st-font-family)')};`
        },
        // 键盘输入过滤
        handleTextInput(_view: unknown, _from: number, _to: number, text: string): boolean {
            if (mode === 'hex') {
                // hex 模式：只允许 0-9 A-F a-f、空格/Tab，以及 Token 触发符 /
                return !/^[0-9A-Fa-f\s\/]*$/.test(text);
            } else {
                // text 模式：只允许可打印 ASCII（U+0020~U+007E），过滤汉字等
                return !/^[\x20-\x7E]*$/.test(text);
            }
        },
        // 粘贴过滤：保留合法字符后重新插入
        handlePaste(view: import('@tiptap/pm/view').EditorView, event: ClipboardEvent): boolean {
            const raw = event.clipboardData?.getData('text') ?? '';
            let filtered: string;
            if (mode === 'hex') {
                filtered = raw.replace(/[^0-9A-Fa-f\s]/g, '');
            } else {
                // eslint-disable-next-line no-control-regex
                filtered = raw.replace(/[^\x20-\x7E]/g, '');
            }
            if (filtered === raw) return false; // 无需过滤，走默认逻辑
            // 有非法字符：插入过滤后的内容
            if (filtered) {
                const { tr } = view.state;
                view.dispatch(tr.insertText(filtered));
            }
            return true; // 阻止默认 paste
        },
    }), [fontSize, fontFamily, mode]);

    const editor = useEditor({
        extensions,
        content: initialHTML || initialContent,
        editorProps,
        onCreate: ({ editor }) => {
            // 延迟到下一帧执行，避免 React 在组件挂载前触发 state 更新
            setTimeout(() => {
                setIsEmpty(editor.isEmpty);
                isReadyRef.current = true;
            }, 0);
        },
        onUpdate: ({ editor, transaction }) => {
            const currentEmpty = editor.isEmpty;
            if (currentEmpty !== isEmpty) setIsEmpty(currentEmpty);

            if ((!transaction.docChanged && !transaction.scrolledIntoView) || !isReadyRef.current) {
                return;
            }

            // 内容变化时递增版本号，跳过内部同步
            if (transaction.docChanged && !isSyncingRef.current) {
                setContentVersion(v => v + 1);
            }

            if (onStateChange) {
                const json = editor.getJSON();
                const tokensMap = extractTokensFromJSON(json);

                onStateChange({
                    content: editor.getText(),
                    html: editor.getHTML(),
                    tokens: tokensMap,
                    mode, lineEnding, timerInterval
                });
            }
        },
    }, [extensions, editorProps]);

    // ── 状态同步 ──
    const syncState = useCallback(() => {
        if (!editor || !onStateChange || !isReadyRef.current) return;

        const json = editor.getJSON();
        const tokensMap = extractTokensFromJSON(json);

        onStateChange({
            content: editor.getText(),
            html: editor.getHTML(),
            tokens: tokensMap,
            mode, lineEnding, timerInterval
        });
    }, [editor, onStateChange, mode, lineEnding, timerInterval]);

    useEffect(() => { syncState(); }, [mode, lineEnding, timerInterval, syncState]);
    useEffect(() => { if (editor && isReadyRef.current) syncState(); }, [editor, syncState]);

    // ── Token 管理 ──
    useEffect(() => {
        const handleTokenClick = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setPopover({ id: detail.id, type: detail.type, x: detail.x, y: detail.y, pos: detail.pos });
        };
        window.addEventListener(SERIAL_TOKEN_CLICK_EVENT, handleTokenClick);
        return () => window.removeEventListener(SERIAL_TOKEN_CLICK_EVENT, handleTokenClick);
    }, []);

    const insertToken = useCallback((type: string) => {
        if (!editor) return;
        const plugin = tokenRegistry.get(type);
        if (!plugin) return;
        const config = plugin.defaultConfig();
        editor.chain().focus().insertSerialToken({ type, config }).run();
    }, [editor]);

    const updateTokenConfig = (_id: string, newConfig: Record<string, unknown>) => {
        if (!editor || !popover) return;
        editor.chain().focus().setNodeSelection(popover.pos).updateAttributes('serialToken', { config: newConfig }).run();
    };

    const deleteToken = () => {
        if (!editor || !popover) return;
        editor.chain().focus().setNodeSelection(popover.pos).deleteSelection().run();
        setPopover(null);
    };

    // ── 发送和定时逻辑（委托给 Hook） ──
    const { handleSend } = useSerialInputLogic({
        editor, mode, lineEnding, isConnected, isEmpty,
        sessionId, isTimerRunning, timerInterval, contentVersion, isSyncingRef,
        onSend, onConnectRequest, onTimedSendStart, onTimedSendStartDynamic, onTimedSendStop
    });

    return (
        <div
            className={`${hideExtras || hideBorderTop ? '' : 'border-t border-[var(--st-widget-border)]'} bg-[var(--st-sendarea-bg)] p-2 flex flex-col gap-2 shrink-0 select-none`}
            data-component="serial-input"
        >
            {/* 工具栏 */}
            <SerialInputToolbar
                mode={mode} setMode={setMode}
                lineEnding={lineEnding} setLineEnding={setLineEnding}
                isTimerRunning={isTimerRunning} setIsTimerRunning={setIsTimerRunning}
                timerIntervalInput={timerIntervalInput} setTimerIntervalInput={setTimerIntervalInput}
                timerInterval={timerInterval} setTimerInterval={setTimerInterval}
                isEmpty={isEmpty} hideExtras={hideExtras}
                insertToken={insertToken}
            />

            {/* 输入区域 */}
            <div className="flex gap-2 h-[96px]">
                <div
                    className="flex-1 bg-[var(--st-input-bg,var(--input-background))] border border-[var(--st-input-border)] rounded-sm focus-within:border-[var(--st-input-focus-border)] cursor-text flex flex-col overflow-y-auto bg-cover bg-center"
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

            {/* Token 配置弹窗 */}
            {popover && editor && (() => {
                let tokenData: Token | null = null;
                const node = editor.state.doc.nodeAt(popover.pos);

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
