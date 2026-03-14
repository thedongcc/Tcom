/**
 * useSerialInputLogic.ts
 * 串口输入组件的发送逻辑和定时发送管理。
 *
 * 子模块：
 * - timedSendUtils.ts — 定时发送帧预计算和 Token 状态管理
 */
import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { Editor } from '@tiptap/react';
import { Token } from '../../types/token';
import { MessagePipeline } from '../../services/MessagePipeline';
import { compileSegments } from '../../utils/InputParser';
import { tokenRegistry } from '../../tokens';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';
import {
    prepareCachedData,
    analyzeTimestampSlots,
    createTimedStates,
    computeFrames,
} from './timedSendUtils';

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
    sessionId, isTimerRunning, timerInterval, contentVersion, isSyncingRef,
    onSend, onConnectRequest,
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

    const handleSendRef = useRef(handleSend);
    useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

    const onSendRef = useRef(onSend);
    useEffect(() => { onSendRef.current = onSend; }, [onSend]);

    const hasDynamicTokens = useCallback(() => {
        const tokens = extractTokens();
        const dynamicTypes = new Set(tokenRegistry.getDynamicTypes());
        return Object.values(tokens).some(t => dynamicTypes.has(t.type));
    }, [extractTokens]);

    // 同步编辑器中有状态动态 Token 的显示值
    const syncEditorDynamicTokens = useCallback((states: Record<string, any>) => {
        if (!editor) return;
        isSyncingRef.current = true;
        try {
            editor.chain().command(({ tr }) => {
                let changed = false;
                tr.doc.descendants((node, pos) => {
                    if (node.type.name === 'serialToken') {
                        const state = states[node.attrs.id];
                        if (state) {
                            const currentVal = state.getCurrentValue();
                            const newConfig = { ...node.attrs.config, currentValue: currentVal };
                            if (JSON.stringify(node.attrs.config) !== JSON.stringify(newConfig)) {
                                tr.setNodeAttribute(pos, 'config', newConfig);
                                changed = true;
                            }
                        }
                    }
                });
                return changed;
            }).run();
        } finally {
            isSyncingRef.current = false;
        }
    }, [editor, isSyncingRef]);

    // ── 定时发送：静态数据（主进程高精度定时器） ──
    const startStaticTimedSend = useCallback(() => {
        if (!editor || editor.isEmpty || !sessionId || !window.serialAPI?.timedSendStart) return;
        const html = editor.getHTML();
        const text = editor.getText();
        const tokens = extractTokens();
        const { data } = MessagePipeline.process(text, html, mode, tokens, lineEnding);
        const dataArray = data instanceof Uint8Array
            ? Array.from(data)
            : Array.from(new TextEncoder().encode(data as string));
        window.serialAPI.timedSendStart(sessionId, dataArray, timerInterval);
        return () => { window.serialAPI?.timedSendStop?.(sessionId); };
    }, [editor, sessionId, extractTokens, mode, lineEnding, timerInterval]);

    // ── 定时发送：动态数据（预计算帧 + Worker Thread） ──
    const startDynamicTimedSend = useCallback(() => {
        if (!editor || editor.isEmpty || !sessionId || !window.serialAPI?.timedSendStartDynamic) return;
        const cachedHtml = editor.getHTML();
        const cachedTokens = extractTokens();
        const BATCH_SIZE = 200;
        const { segments, lineEndingBytes } = prepareCachedData(cachedHtml, mode, lineEnding);
        const timestampSlots = analyzeTimestampSlots(segments, cachedTokens);
        const timedStates = createTimedStates(cachedTokens);
        const initialFrames = computeFrames(BATCH_SIZE, segments, mode, cachedTokens, timedStates, lineEndingBytes);

        window.serialAPI.timedSendStartDynamic(sessionId, initialFrames, timerInterval, timestampSlots);

        const unsubTick = window.serialAPI.onTimedSendTick?.(sessionId, () => {
            for (const state of Object.values(timedStates)) state.onFrameSent();
        });
        const displayIntervalId = setInterval(() => syncEditorDynamicTokens(timedStates), 200);

        return () => {
            window.serialAPI?.timedSendStop?.(sessionId);
            unsubTick?.();
            clearInterval(displayIntervalId);
            syncEditorDynamicTokens(timedStates);
        };
    }, [editor, sessionId, extractTokens, mode, lineEnding, timerInterval, syncEditorDynamicTokens]);

    // ── 定时发送：渲染进程兜底 ──
    const startFallbackTimedSend = useCallback(() => {
        if (!editor || editor.isEmpty) return;
        const cachedHtml = editor.getHTML();
        const cachedTokens = extractTokens();
        const { segments, lineEndingBytes } = prepareCachedData(cachedHtml, mode, lineEnding);

        let nextFireTime = performance.now() + timerInterval;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        const schedule = () => {
            if (cancelled) return;
            const delay = Math.max(0, nextFireTime - performance.now());
            timeoutId = setTimeout(() => {
                if (cancelled) return;
                nextFireTime += timerInterval;
                let data: Uint8Array | string = compileSegments(segments, mode, cachedTokens);
                if (lineEndingBytes && data instanceof Uint8Array) {
                    const merged = new Uint8Array(data.length + lineEndingBytes.length);
                    merged.set(data);
                    merged.set(lineEndingBytes, data.length);
                    data = merged;
                }
                onSendRef.current(data, mode);
                schedule();
            }, delay);
        };
        schedule();

        return () => { cancelled = true; if (timeoutId !== null) clearTimeout(timeoutId); };
    }, [editor, extractTokens, mode, lineEnding, timerInterval]);

    // 定时发送逻辑
    useEffect(() => {
        if (!isTimerRunning || timerInterval <= 0) {
            if (sessionId && window.serialAPI?.timedSendStop) window.serialAPI.timedSendStop(sessionId);
            return;
        }
        if (!isConnected) return;

        const isDynamic = hasDynamicTokens();
        if (!isDynamic && sessionId && window.serialAPI?.timedSendStart) return startStaticTimedSend();
        if (sessionId && window.serialAPI?.timedSendStartDynamic) return startDynamicTimedSend();
        return startFallbackTimedSend();
    }, [isTimerRunning, timerInterval, isConnected, sessionId, mode, lineEnding, editor, hasDynamicTokens, extractTokens, contentVersion, syncEditorDynamicTokens, startStaticTimedSend, startDynamicTimedSend, startFallbackTimedSend]);

    return { extractTokens, handleSend };
};
