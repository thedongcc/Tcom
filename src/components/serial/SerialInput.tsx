import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Send, Plus, Upload, Timer, Flag } from 'lucide-react';
import { Token, CRCConfig, FlagConfig } from '../../types/token';
import { TokenConfigPopover } from './TokenConfigPopover';
import { MessagePipeline } from '../../services/MessagePipeline';

// TipTap Imports
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SerialToken, SERIAL_TOKEN_CLICK_EVENT } from './SerialTokenExtension';
import { SuggestionExtension, getSuggestionOptions } from './SuggestionExtension';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';
import { CustomSelect } from '../common/CustomSelect';

interface SerialInputProps {
    onSend: (data: string | Uint8Array, mode: 'text' | 'hex') => void;
    initialContent?: string;
    initialHTML?: string;
    initialTokens?: Record<string, Token>;
    initialMode?: 'text' | 'hex';
    initialLineEnding?: string;
    isConnected?: boolean;
    fontSize?: number;
    fontFamily?: string;
    onConnectRequest?: () => void;
    onStateChange?: (state: { content: string, html: string, tokens: Record<string, Token>, mode: 'text' | 'hex', lineEnding: string }) => void;
    /** Hide toolbar, timer, and send button (e.g. for Command Editor) */
    hideExtras?: boolean;
}

export const SerialInput = ({
    onSend,
    initialContent = '',
    initialHTML = '',
    initialTokens = {},
    initialMode = 'hex',
    initialLineEnding = '\r\n',
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
    const [timerInterval, setTimerInterval] = useState(1000);
    const [timerIntervalInput, setTimerIntervalInput] = useState('1000'); // String state for input
    const timerRef = useRef<NodeJS.Timeout | null>(null);
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
            class: "absolute inset-0 bg-transparent text-[var(--input-foreground)] caret-[var(--app-foreground)] select-none z-10 p-2 break-all whitespace-pre-wrap outline-none border-none resize-none font-medium h-fit flex-1",
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

            if (onStateChange) {
                const json = editor.getJSON();
                const tokensMap: Record<string, Token> = {};
                const traverse = (node: any) => {
                    if (node.type === 'serialToken') {
                        const { id, type, config } = node.attrs;
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
                    lineEnding
                });
            }
        },
    }, [extensions, editorProps]);

    // Helper to sync state to parent
    const syncState = useCallback(() => {
        if (!editor || !onStateChange || !isReadyRef.current) return;

        const json = editor.getJSON();
        const tokensMap: Record<string, Token> = {};
        const traverse = (node: any) => {
            if (node.type === 'serialToken') {
                const { id, type, config } = node.attrs;
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
            lineEnding
        });
    }, [editor, onStateChange, mode, lineEnding]);

    // Sync on mode or lineEnding change
    useEffect(() => {
        syncState();
    }, [mode, lineEnding, syncState]);

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

    const insertToken = (type: 'crc' | 'flag' | 'timestamp') => {
        if (!editor) return;
        let config: any = {};
        if (type === 'crc') {
            config = {
                algorithm: 'modbus-crc16',
                startIndex: 0,
                endIndex: 0
            } as CRCConfig;
        } else if (type === 'flag') {
            config = { hex: 'AA', name: '' } as FlagConfig;
        } else if (type === 'timestamp') {
            // 时间戳 Token
            config = { format: 'seconds', byteOrder: 'big' };
        } else if (type === 'auto_inc') {
            // 自变化 Token
            config = { bytes: 1, defaultValue: '00', currentValue: '00', step: 1 };
        }
        editor.chain().focus().insertSerialToken({ type, config }).run();
    };

    const updateTokenConfig = (id: string, newConfig: any) => {
        if (!editor || !popover) return;

        // Determine the node type based on the popover's token type
        editor.chain().focus().setNodeSelection(popover.pos).updateAttributes('serialToken', { config: newConfig }).run();
    };

    const deleteToken = (id: string) => {
        if (!editor || !popover) return;
        editor.chain().focus().setNodeSelection(popover.pos).deleteSelection().run();
        setPopover(null);
    };

    const extractTokens = useCallback((): Record<string, Token> => {
        if (!editor) return {};
        const json = editor.getJSON();
        const tokensMap: Record<string, Token> = {};
        const traverse = (node: any) => {
            if (node.type === 'serialToken') {
                const { id, type, config } = node.attrs;
                // Deep clone the config here to ensure external modifications don't leak back 
                // into the editor's state without a proper transaction
                tokensMap[id] = { id, type, config: JSON.parse(JSON.stringify(config)) };
            }
            if (node.content) node.content.forEach(traverse);
        };
        traverse(json);
        return tokensMap;
    }, [editor]);

    const handleSend = useCallback(() => {
        if (!isConnected) {
            onConnectRequest?.();
            return;
        }
        if (!editor || editor.isEmpty) {
            showToast(t('toast.sendEmpty'), 'warning');
            return;
        }

        const html = editor.getHTML();
        const text = editor.getText();
        const json = editor.getJSON();
        const tokensMap = extractTokens();
        console.log('SerialInput handleSend:', { html, text, json: JSON.stringify(json, null, 2), tokensMap });
        const { data } = MessagePipeline.process(text, html, mode, tokensMap, lineEnding);

        // After sending, some tokens (like auto_inc) might have updated their currentValue.
        // We need to sync these updates back to the editor in ONE transition.
        editor.chain().command(({ tr }) => {
            let changed = false;
            tr.doc.descendants((node, pos) => {
                if (node.type.name === 'serialToken' && node.attrs.type === 'auto_inc') {
                    const updatedToken = tokensMap[node.attrs.id];
                    if (updatedToken) {
                        // We must send a NEW object reference to ProseMirror/TipTap 
                        // to trigger the update and re-render of the NodeView.
                        const nextConfig = JSON.parse(JSON.stringify(updatedToken.config));

                        // Compare content to avoid infinite loops or unnecessary updates
                        if (JSON.stringify(node.attrs.config) !== JSON.stringify(nextConfig)) {
                            tr.setNodeAttribute(pos, 'config', nextConfig);
                            changed = true;
                        }
                    }
                }
            });
            return changed;
        }).run();

        onSend(data, mode);
    }, [isConnected, editor, onConnectRequest, onSend, mode, lineEnding, extractTokens]);

    // Use a ref to store the latest handleSend callback
    const handleSendRef = useRef(handleSend);
    useEffect(() => {
        handleSendRef.current = handleSend;
    }, [handleSend]);

    // Timer Effect
    useEffect(() => {
        if (isTimerRunning && timerInterval > 0) {
            timerRef.current = setInterval(() => {
                if (handleSendRef.current) {
                    handleSendRef.current();
                }
            }, timerInterval);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isTimerRunning, timerInterval]);

    return (
        <div className={`${hideExtras ? '' : 'border-t border-[var(--border-color)]'} bg-[var(--sidebar-background)] p-2 flex flex-col gap-2 shrink-0 select-none`}>
            {/* Mode Switcher - always visible */}
            <div className="flex items-center gap-2 h-6 overflow-x-auto scrollbar-none">
                <div className="shrink-0 flex items-center gap-[1px] bg-[var(--input-background)] border border-[var(--border-color)] rounded-sm overflow-hidden p-[2px]">
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'text' ? 'bg-[var(--button-background)] text-[var(--button-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] hover:bg-[var(--list-hover-background)]'}`}
                        onClick={() => setMode('text')}
                    >
                        TXT
                    </button>
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'hex' ? 'bg-[var(--button-background)] text-[var(--button-foreground)]' : 'text-[var(--activitybar-inactive-foreground)] hover:bg-[var(--list-hover-background)]'}`}
                        onClick={() => setMode('hex')}
                    >
                        HEX
                    </button>
                </div>
                {!hideExtras && (
                    <>
                        <div className="shrink-0 w-[1px] h-4 bg-[var(--border-color)] mx-1" />

                        {/* Line Ending Selector (Only for Text Mode) */}
                        {mode === 'text' && (
                            <div className="flex items-center gap-1">
                                <CustomSelect
                                    value={lineEnding}
                                    onChange={(val) => setLineEnding(val)}
                                    allowCustom={true}
                                    dropdownWidth={110}
                                    items={[
                                        { value: '', label: 'None' },
                                        { value: '\\n', label: 'LF (\\n)' },
                                        { value: '\\r', label: 'CR (\\r)' },
                                        { value: '\\r\\n', label: 'CRLF (\\r\\n)' }
                                    ]}
                                    className="!w-[88px] [&_button]:!h-6 [&_div.h-7]:!h-6 [&_span.truncate]:!text-[10px] [&_input]:!text-[10px]"
                                />
                                <div className="shrink-0 w-[1px] h-4 bg-[var(--border-color)] ml-1" />
                            </div>
                        )}

                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--app-foreground)] rounded-sm transition-colors whitespace-nowrap" title="CRC"
                            onClick={() => insertToken('crc')}>
                            <Plus size={14} className="text-emerald-500" />
                            <span>CRC</span>
                        </button>
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--app-foreground)] rounded-sm transition-colors whitespace-nowrap" title="Flag"
                            onClick={() => insertToken('flag')}>
                            <Flag size={14} className="text-blue-400" />
                            <span>Flag</span>
                        </button>
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--app-foreground)] rounded-sm transition-colors whitespace-nowrap" title="Time"
                            onClick={() => insertToken('timestamp')}>
                            <div className="flex items-center justify-center w-[14px] h-[14px] border border-blue-400 text-blue-400 text-[9px] font-mono rounded-[2px] leading-none">T</div>
                            <span>Time</span>
                        </button>
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--app-foreground)] rounded-sm transition-colors whitespace-nowrap" title="Auto"
                            onClick={() => insertToken('auto_inc' as any)}>
                            <div className="flex items-center justify-center w-[14px] h-[14px] border border-purple-400 text-purple-400 text-[9px] font-mono rounded-[2px] leading-none">A</div>
                            <span>Auto</span>
                        </button>
                        <div className="shrink-0 w-[1px] h-4 bg-[var(--border-color)] mx-1" />
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--list-hover-background)] text-[12px] text-[var(--app-foreground)] rounded-sm transition-colors opacity-50 cursor-not-allowed whitespace-nowrap" title="Load File">
                            <Upload size={14} />
                            <span>File</span>
                        </button>
                        <div className="flex-1 shrink min-w-0" />
                        {/* Timed Send: flat toggle + input */}
                        <div className="shrink-0 w-[1px] h-4 bg-[var(--border-color)]" />
                        <div className="shrink-0 flex items-center gap-1.5">
                            <button
                                className={`flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-sm transition-colors cursor-pointer whitespace-nowrap ${isTimerRunning
                                    ? 'bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover-background)]'
                                    : ((!isTimerRunning && isEmpty) ? 'bg-[var(--input-background)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed' : 'bg-[var(--button-secondary-background)] text-[var(--button-foreground)] hover:bg-[var(--button-secondary-hover-background)]')
                                    }`}
                                onClick={() => {
                                    if (!isTimerRunning && isEmpty) {
                                        showToast(t('toast.sendEmpty'), 'warning');
                                        return;
                                    }
                                    setIsTimerRunning(!isTimerRunning);
                                }}
                                title={isTimerRunning ? 'Stop Timed Send' : (isEmpty ? 'Type message to start timer' : 'Start Timed Send')}
                            >
                                <Timer size={14} />
                                <span>{isTimerRunning ? 'Stop' : 'Timed'}</span>
                            </button>
                            <input
                                type="text"
                                className="w-12 h-[22px] bg-[var(--input-background)] border border-[var(--border-color)] text-[var(--app-foreground)] text-[11px] px-1 rounded-sm focus:border-[var(--focus-border-color)] outline-none text-center font-mono"
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
                            <span className="text-[11px] text-[#666]">ms</span>
                        </div>
                    </>
                )}
            </div>

            {/* Input Area */}
            <div className="flex gap-2 min-h-[42px]">

                <div
                    className="flex-1 bg-[var(--st-input-bg,var(--input-background))] border border-[var(--border-color)] rounded-sm focus-within:border-[var(--focus-border-color)] cursor-text flex flex-col bg-cover bg-center"
                    onClick={() => editor?.commands.focus()}
                    style={{ backgroundImage: 'var(--st-input-bg-img)' }}
                >
                    <EditorContent editor={editor} className="flex-1 outline-none" />
                </div>

                {!hideExtras && (
                    <button
                        className={`w-16 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${isConnected
                            ? (isEmpty ? 'bg-[var(--input-background)] text-[var(--activitybar-inactive-foreground)] cursor-not-allowed' : 'bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] text-[var(--button-foreground)]')
                            : 'bg-[var(--widget-background)] hover:bg-[var(--list-hover-background)] text-[var(--app-foreground)] cursor-pointer border border-[var(--border-color)] hover:border-[var(--focus-border-color)]'}`}
                        onClick={() => handleSend()}
                        title={isConnected ? (isEmpty ? 'Type message to send' : 'Send Data') : 'Connect and Send'}
                    >
                        {isConnected ? <Send size={16} /> : <div className="relative"><Send size={16} className="opacity-50" /><div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[var(--accent-color)] rounded-full border border-[var(--sidebar-background)]"></div></div>}
                        <span className="text-[10px]">{isConnected ? 'Send' : 'Connect'}</span>
                    </button>
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
