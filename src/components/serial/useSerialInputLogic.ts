/**
 * useSerialInputLogic.ts
 * 串口输入组件的发送逻辑和定时发送管理。
 *
 * 子模块：
 * - timedSendUtils.ts — 定时发送帧预计算和 Token 状态管理
 *
 * 定时发送架构说明：
 * ┌─────────────────────────────────────────────────────────────┐
 * │  isTimerRunning = true                                      │
 * │         │                                                   │
 * │         ▼                                                   │
 * │  有无动态 Token（auto/rand/time）？                          │
 * │  ├─ NO  → timedSendStart（固定帧，Rust高精度）  ±1ms       │
 * │  └─ YES → 预计算N帧 → timedSendStartDynamic（Ring Buffer） │
 * │           Rust端：Ring Buffer + 时间戳原位填充  ±0.5ms     │
 * └─────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect } from 'react';
import React from 'react';
import { Editor } from '@tiptap/react';
import { Token } from '../../types/token';
import { MessagePipeline } from '../../services/MessagePipeline';
import { tokenRegistry } from '../../tokens';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';
import {
    prepareCachedData,
    analyzeTimestampSlots,
    createTimedStates,
    computeFrames,
} from './timedSendUtils';
import { compileSegments } from '../../utils/InputParser';

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
    /** 原生高精度定时器启动接口（固定帧）*/
    onTimedSendStart?: (sessionId: string, data: number[], intervalMs: number) => void;
    /** 动态帧定时器启动接口（Ring Buffer + 时间戳 Slot）*/
    onTimedSendStartDynamic?: (sessionId: string, frames: number[][], intervalMs: number, timestampSlots: object[]) => void;
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

/** 将 Token map 中（已被 compile 原地修改的）最新 config 写回 Tiptap 编辑器节点属性，触发视觉刷新。
 * isSyncingRef 为 true 时，Tiptap onUpdate 中会忽略此次 docChanged，不会递增 contentVersion，从而防止定时器重启。
 */
function flushTokensToEditor(
    ed: Editor,
    tokens: Record<string, Token>,
    isSyncingRef?: React.MutableRefObject<boolean>
) {
    if (isSyncingRef) isSyncingRef.current = true;
    ed.chain().command(({ tr }) => {
        let changed = false;
        tr.doc.descendants((node, pos) => {
            if (node.type.name === 'serialToken') {
                const updatedToken = tokens[node.attrs.id];
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
    // 用 requestAnimationFrame 在 Tiptap 完成本次更新回调后再重置，避免过早 false
    if (isSyncingRef) requestAnimationFrame(() => { isSyncingRef.current = false; });
}

export const useSerialInputLogic = ({
    editor, mode, lineEnding, isConnected,
    sessionId, isTimerRunning, timerInterval, contentVersion: _contentVersion, isSyncingRef: _isSyncingRef,
    onSend, onConnectRequest, onTimedSendStart, onTimedSendStartDynamic, onTimedSendStop
}: UseSerialInputLogicParams) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    const extractTokens = useCallback((): Record<string, Token> => {
        if (!editor) return {};
        return extractTokensFromEditor(editor);
    }, [editor]);

    // 发送消息（手动）
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

        // compile 已原地修改 tokensMap 里的 config（如 auto-inc 的 currentValue），写回编辑器触发 UI 刷新
        // 手动发送时也要用 isSyncingRef 屏蔽，避免意外触发 contentVersion 递增
        flushTokensToEditor(editor, tokensMap, _isSyncingRef);

    }, [isConnected, editor, onConnectRequest, onSend, mode, lineEnding, extractTokens, showToast, t, _isSyncingRef]);




    // ── 定时发送（Rust 端 Ring Buffer 高精度定时器）──
    // 用 ref 缓存编辑器参数和发送回调，避免 effect 依赖频繁变化导致定时器不断重启
    const editorRef = React.useRef({ editor, mode, lineEnding, extractTokens, onSend, isSyncingRef: _isSyncingRef });
    useEffect(() => {
        editorRef.current = { editor, mode, lineEnding, extractTokens, onSend, isSyncingRef: _isSyncingRef };
    }, [editor, mode, lineEnding, extractTokens, onSend, _isSyncingRef]);

    useEffect(() => {
        if (!isTimerRunning || timerInterval <= 0 || !isConnected || !sessionId) {
            if (sessionId && window.serialAPI?.timedSendStop) window.serialAPI.timedSendStop(sessionId);
            return;
        }

        const { editor: ed, mode: m, lineEnding: le, extractTokens: et } = editorRef.current;
        if (!ed || ed.isEmpty) return;

        // ── 启动时一次性预计算所有帧 ──
        const tokens = et();
        const html = ed.getHTML();

        // 检测是否存在动态 Token（auto/rand/time 等）
        const hasDynamicTokens = Object.values(tokens).some(token => {
            const plugin = tokenRegistry.get(token.type);
            return !!plugin?.createTimedState || !!plugin?.isDynamic;
        });

        console.log('[TimedSend] hasDynamicTokens:', hasDynamicTokens,
            Object.values(tokens).map(t => `${t.type}(dynamic=${!!(tokenRegistry.get(t.type)?.isDynamic)})`));

        if (!hasDynamicTokens) {
            // ── 纯静态内容 → 固定帧高精度 Rust 定时器 ──
            if (onTimedSendStart && onTimedSendStop) {
                const { data } = MessagePipeline.process(ed.getText(), html, m, tokens, le);
                const dataArray = data instanceof Uint8Array
                    ? Array.from(data)
                    : Array.from(new TextEncoder().encode(data as string));
                console.log('[TimedSend] 🧱 Rust 固定帧路径:', dataArray);
                onTimedSendStart(sessionId, dataArray, timerInterval);
                return () => { onTimedSendStop(sessionId); };
            }
        }

        // ── 含动态 Token → 预计算 Ring Buffer → Rust 高精度动态帧路径 ──
        if ((onTimedSendStartDynamic || onTimedSendStart) && onTimedSendStop) {
            const { segments, lineEndingBytes } = prepareCachedData(html, m, le);

            // 分析 timestamp Token 的 Rust 原位填充槽
            const timestampSlots = analyzeTimestampSlots(segments, tokens);
            console.log('[TimedSend] 🕐 timestampSlots:', timestampSlots);

            // 创建有状态 Token 的状态机
            const timedStates = createTimedStates(tokens);
            console.log('[TimedSend] 🎧 timedStates keys:', Object.keys(timedStates));

            // 预计算 N 帧（1024 帧 @ 100ms = 约 102 秒才循环一次）
            const FRAME_COUNT = 1024;
            console.log(`[TimedSend] 🧮 预计算 ${FRAME_COUNT} 帧...`);
            const frames = computeFrames(FRAME_COUNT, segments, m, tokens, timedStates, lineEndingBytes);
            console.log(`[TimedSend] ✅ 预计算完成，每帧 ${frames[0]?.length ?? 0} 字节，共 ${frames.length} 帧`);

            // 订阅 Rust 批处理事件：每批次实时推进 Token 状态并写回编辑器
            // tokens 对象在闭包内被逐步 mutate，无需额外计数
            const tickCleanup = window.serialAPI?.onTimedSendTickBatch?.(sessionId, (batch) => {
                console.log('[TimedSend Tick] 收到批次，帧数:', batch.length, '当前 tokens:', JSON.parse(JSON.stringify(tokens)));
                const { editor: ed2, isSyncingRef: syncRef } = editorRef.current;
                // 按本批次帧数推进状态机（每帧一次 compileSegments 即可步进 auto-inc 等动态 Token）
                for (let i = 0; i < batch.length; i++) {
                    compileSegments(segments, m, tokens);
                }
                console.log('[TimedSend Tick] 推进后 tokens:', JSON.parse(JSON.stringify(tokens)));
                // 实时写回编辑器（用 isSyncingRef 屏蔽，防止触发 contentVersion 自增导致定时器重启）
                if (ed2) flushTokensToEditor(ed2, tokens, syncRef);
            });
            console.log('[TimedSend] tickCleanup 注册结果:', typeof tickCleanup);

            // 优先使用 dynamic API；如果没有则回退到只发第一帧（兜底）
            if (onTimedSendStartDynamic) {
                onTimedSendStartDynamic(sessionId, frames, timerInterval, timestampSlots);
            } else if (onTimedSendStart) {
                console.warn('[TimedSend] ⚠️ onTimedSendStartDynamic 不可用，回退到固定帧（第一帧）');
                onTimedSendStart(sessionId, frames[0], timerInterval);
            }

            return () => {
                onTimedSendStop(sessionId);
                tickCleanup?.();
                // tokens 已由 tick 回调实时推进至正确位置，直接 flush 最终状态到编辑器
                const { editor: ed2, isSyncingRef: syncRef } = editorRef.current;
                if (ed2) flushTokensToEditor(ed2, tokens, syncRef);
            };
        }


        // ── 最终降级：无任何 Rust API，提示用户 ──
        console.error('[TimedSend] ❌ 无可用的 Rust 定时器 API，定时发送未启动');

    }, [isTimerRunning, timerInterval, isConnected, sessionId, onTimedSendStart, onTimedSendStartDynamic, onTimedSendStop, _contentVersion, mode, lineEnding]);

    return { extractTokens, handleSend };
};
