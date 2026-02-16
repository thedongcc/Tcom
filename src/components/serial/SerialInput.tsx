import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Send, Plus, Upload, Timer, Flag } from 'lucide-react';
import { Token, CRCConfig, FlagConfig } from '../../types/token';
import { TokenConfigPopover } from './TokenConfigPopover';
import { MessagePipeline } from '../../services/MessagePipeline';

// TipTap Imports
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SerialToken } from './SerialTokenExtension';
import { SuggestionExtension, getSuggestionOptions } from './SuggestionExtension';
import { SERIAL_TOKEN_CLICK_EVENT } from './SerialTokenComponent';
import { useToast } from '../../context/ToastContext';

interface SerialInputProps {
    onSend: (data: string | Uint8Array, mode: 'text' | 'hex') => void;
    initialContent?: string;
    initialHTML?: string;
    initialTokens?: Record<string, Token>;
    initialMode?: 'text' | 'hex';
    initialLineEnding?: '' | '\n' | '\r' | '\r\n';
    isConnected?: boolean;
    fontSize?: number;
    fontFamily?: string;
    onConnectRequest?: () => void;
    onStateChange?: (state: { content: string, html: string, tokens: Record<string, Token>, mode: 'text' | 'hex', lineEnding: '' | '\n' | '\r' | '\r\n' }) => void;
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
    fontSize = 13,
    fontFamily = 'var(--font-mono)',
    onConnectRequest,
    onStateChange,
    hideExtras = false
}: SerialInputProps) => {
    const { showToast } = useToast();
    const [mode, setMode] = useState<'text' | 'hex'>(initialMode);
    const [lineEnding, setLineEnding] = useState<'' | '\n' | '\r' | '\r\n'>(initialLineEnding);
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
            class: 'outline-none text-[var(--st-input-text)] whitespace-pre-wrap break-all flex-1 min-h-[40px] overflow-y-auto custom-scrollbar p-2 leading-relaxed [&_p]:m-0 tracking-[0px]',
            spellcheck: 'false',
            style: `font-size: ${fontSize}px; font-family: ${fontFamily === 'mono' ? 'var(--font-mono)' : fontFamily}; font-variant-ligatures: none;`
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
                tokensMap[id] = { id, type, config };
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
            showToast('发送内容不能为空', 'warning');
            return;
        }

        const html = editor.getHTML();
        const text = editor.getText();
        const json = editor.getJSON();
        const tokensMap = extractTokens();
        console.log('SerialInput handleSend:', { html, text, json: JSON.stringify(json, null, 2), tokensMap });
        const { data } = MessagePipeline.process(text, html, mode, tokensMap, lineEnding);

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
        <div className={`${hideExtras ? '' : 'border-t border-[var(--vscode-border)]'} bg-[#252526] p-2 flex flex-col gap-2 shrink-0 select-none`}>
            {/* Mode Switcher - always visible */}
            <div className="flex items-center gap-2 h-6 overflow-x-auto scrollbar-none">
                <div className="shrink-0 flex items-center gap-[1px] bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm overflow-hidden p-[2px]">
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'text' ? 'bg-[#007acc] text-white' : 'text-[#666] hover:bg-[#2d2d2d]'}`}
                        onClick={() => setMode('text')}
                    >
                        TXT
                    </button>
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'hex' ? 'bg-[#007acc] text-white' : 'text-[#666] hover:bg-[#2d2d2d]'}`}
                        onClick={() => setMode('hex')}
                    >
                        HEX
                    </button>
                </div>
                {!hideExtras && (
                    <>
                        <div className="shrink-0 w-[1px] h-4 bg-[#3c3c3c] mx-1" />
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-[#3c3c3c] hover:bg-[#4c4c4c] text-[12px] text-[#cccccc] rounded-sm transition-colors whitespace-nowrap"
                            onClick={() => insertToken('crc')}>
                            <Plus size={14} className="text-[#4ec9b0]" />
                            <span>Insert CRC</span>
                        </button>
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-[#3c3c3c] hover:bg-[#4c4c4c] text-[12px] text-[#cccccc] rounded-sm transition-colors whitespace-nowrap"
                            onClick={() => insertToken('flag')}>
                            <Flag size={14} className="text-[#4ec9b0]" />
                            <span>Add Flag</span>
                        </button>
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[#3c3c3c] text-[12px] text-[#cccccc] rounded-sm transition-colors whitespace-nowrap" title="Insert Unix Timestamp"
                            onClick={() => insertToken('timestamp')}>
                            <div className="flex items-center justify-center w-[14px] h-[14px] border border-[#4fc1ff] text-[#4fc1ff] text-[9px] font-mono rounded-[2px] leading-none">T</div>
                            <span>Time</span>
                        </button>
                        <div className="shrink-0 w-[1px] h-4 bg-[#3c3c3c] mx-1" />
                        <button className="shrink-0 flex items-center gap-1 px-2 py-0.5 hover:bg-[#3c3c3c] text-[12px] text-[#cccccc] rounded-sm transition-colors opacity-50 cursor-not-allowed whitespace-nowrap" title="Load File">
                            <Upload size={14} />
                            <span>File</span>
                        </button>
                        <div className="flex-1 shrink min-w-0" />
                        {/* Timed Send: flat toggle + input */}
                        <div className="shrink-0 w-[1px] h-4 bg-[#3c3c3c]" />
                        <div className="shrink-0 flex items-center gap-1.5">
                            <button
                                className={`flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-sm transition-colors cursor-pointer whitespace-nowrap ${isTimerRunning
                                    ? 'bg-[#007acc] text-white hover:bg-[#0062a3]'
                                    : ((!isTimerRunning && isEmpty) ? 'bg-[#3c3c3c] text-[#666] cursor-not-allowed' : 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#4c4c4c]')
                                    }`}
                                onClick={() => {
                                    if (!isTimerRunning && isEmpty) {
                                        showToast('发送内容不能为空', 'warning');
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
                                className="w-12 h-[22px] bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc] text-[11px] px-1 rounded-sm focus:border-[var(--vscode-focusBorder)] outline-none text-center font-mono"
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
                    className="flex-1 bg-[var(--st-input-bg)] border border-[#3c3c3c] rounded-sm focus-within:border-[var(--vscode-focusBorder)] cursor-text flex flex-col bg-cover bg-center"
                    onClick={() => editor?.commands.focus()}
                    style={{ backgroundImage: 'var(--st-input-bg-img)' }}
                >
                    <EditorContent editor={editor} className="flex-1 outline-none" />
                </div>

                {!hideExtras && (
                    <button
                        className={`nav-item px-3 flex flex-row items-center justify-center gap-2 rounded-sm transition-colors ${isConnected
                            ? (isEmpty ? 'bg-[#3c3c3c] text-[#666] cursor-not-allowed' : 'bg-[#007acc] hover:bg-[#0062a3] text-white')
                            : 'bg-[#3c3c3c] bg-opacity-50 text-[#666] hover:bg-[#4c4c4c] cursor-pointer'}`}
                        onClick={() => handleSend()}
                        title={isConnected ? (isEmpty ? 'Type message to send' : 'Send Data') : 'Open Serial Connection'}
                    >
                        <Send size={16} />
                        <span className="text-[13px] font-medium">Send</span>
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
