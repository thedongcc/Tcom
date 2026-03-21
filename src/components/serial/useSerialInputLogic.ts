/**
 * useSerialInputLogic.ts
 * 串口输入组件的发送逻辑和定时发送管理。
 *
 * 子模块：
 * - timedSendUtils.ts — 定时发送帧预计算和 Token 状态管理
 */
import { useCallback, useEffect } from 'react';
import React from 'react';
import { Editor } from '@tiptap/react';
import { Token } from '../../types/token';
import { MessagePipeline } from '../../services/MessagePipeline';
import { tokenRegistry } from '../../tokens';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

interface UseSerialInputLogicParams {
    editor: Editor | null;
    mode: 'text' | 'hex';
    lineEnding: string;
    isConnected: boolean;
    isEmpty: boolean;
    sessionId?: string;
    isTimerRunning: boolean;
    timerInterval: number;
    /** 编辑器内容版本号，每次 docChanged 时 +1 */
    contentVersion: number;
    /** 标记当前是内部同步更新 */
    isSyncingRef: React.MutableRefObject<boolean>;
    onSend: (data: string | Uint8Array, mode: 'text' | 'hex') => void;
    onConnectRequest?: () => Promise<void> | void;
    /** 原生高精度定时器启动接口 */
    onTimedSendStart?: (sessionId: string, data: number[], intervalMs: number) => void;
    /** 原生高精度定时器停止接口 */
    onTimedSendStop?: (sessionId: string) => void;
}

// 从编辑器 JSON 中提取 Token 映射
const extractTokensFromEditor = (editor: Editor): Record<string, Token> => {
    const json = editor.getJSON();
    const tokensMap: Record<string, Token> = {};
    type TraverseNode = { type?: string; attrs?: Record<string, unknown>; content?: TraverseNode[] };
    const traverse = (node: TraverseNode) => {
        if (node.type === 'serialToken' && node.attrs) {
            const { id, type, config } = node.attrs as unknown as Token;
            tokensMap[id] = { id, type, config: JSON.parse(JSON.stringify(config)) } as Token;
        }
        if (node.content) node.content.forEach(traverse);
    };
    traverse(json);
    return tokensMap;
};

export const useSerialInputLogic = ({
    editor, mode, lineEnding, isConnected,
    sessionId, isTimerRunning, timerInterval, contentVersion: _contentVersion, isSyncingRef: _isSyncingRef,
    onSend, onConnectRequest, onTimedSendStart, onTimedSendStop
}: UseSerialInputLogicParams) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    const extractTokens = useCallback((): Record<string, Token> => {
        if (!editor) return {};
        return extractTokensFromEditor(editor);
    }, [editor]);

    // 发送消息
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
        const tokensMap = extractTokens();

        const { data } = MessagePipeline.process(text, html, mode, tokensMap, lineEnding);

        onSend(data, mode);

        // 发送后更新有状态的动态 Token
        editor.chain().command(({ tr }) => {
            let changed = false;
            tr.doc.descendants((node, pos) => {
                if (node.type.name === 'serialToken') {
                    const updatedToken = tokensMap[node.attrs.id];
                    const plugin = tokenRegistry.get(node.attrs.type);
                    if (updatedToken && plugin?.createTimedState) {
                        const nextConfig = JSON.parse(JSON.stringify(updatedToken.config));
                        if (JSON.stringify(node.attrs.config) !== JSON.stringify(nextConfig)) {
                            tr.setNodeAttribute(pos, 'config', nextConfig);
                            changed = true;
                        }
                    }
                }
            });
            return changed;
        }).run();

    }, [isConnected, editor, onConnectRequest, onSend, mode, lineEnding, extractTokens, showToast, t]);




    // ── 定时发送（Rust 端高精度定时器） ──
    // 用 ref 缓存编辑器参数和发送回调，避免 effect 依赖频繁变化导致定时器不断重启
    const editorRef = React.useRef({ editor, mode, lineEnding, extractTokens, onSend });
    useEffect(() => {
        editorRef.current = { editor, mode, lineEnding, extractTokens, onSend };
    }, [editor, mode, lineEnding, extractTokens, onSend]);

    useEffect(() => {
        if (!isTimerRunning || timerInterval <= 0 || !isConnected || !sessionId) {
            if (sessionId && window.serialAPI?.timedSendStop) window.serialAPI.timedSendStop(sessionId);
            return;
        }

        const { editor: ed, mode: m, lineEnding: le, extractTokens: et, onSend: sendFn } = editorRef.current;
        if (!ed || ed.isEmpty) return;

        // 编译发送数据（仅在启动定时器时编译一次）
        const html = ed.getHTML();
        const tokens = et();
        const { data } = MessagePipeline.process(ed.getText(), html, m, tokens, le);
        const dataArray = data instanceof Uint8Array
            ? Array.from(data)
            : Array.from(new TextEncoder().encode(data as string));

        // 分流：优先调用传递进来的高精度发送接口（如 Physical Serial）
        if (onTimedSendStart && onTimedSendStop) {
            onTimedSendStart(sessionId, dataArray, timerInterval);
            return () => {
                onTimedSendStop(sessionId);
            };
        } else {
            // 容错降级：依靠闭包的纯 JS 定时轮询，绕开依赖的反复触惹
            const timerId = setInterval(() => {
                sendFn(data, m);
            }, timerInterval);
            return () => clearInterval(timerId);
        }
    }, [isTimerRunning, timerInterval, isConnected, sessionId, onTimedSendStart, onTimedSendStop]);

    return { extractTokens, handleSend };
};
