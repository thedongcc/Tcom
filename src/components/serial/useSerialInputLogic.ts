/**
 * useSerialInputLogic.ts
 * 串口输入组件的发送逻辑和定时发送管理。
 * 从 SerialInput.tsx 中拆分出来。
 */
import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { Editor } from '@tiptap/react';
import { Token } from '../../types/token';
import { MessagePipeline } from '../../services/MessagePipeline';
import { parseDOM, compileSegments } from '../../utils/InputParser';
import { tokenRegistry, TokenTimedState, WorkerSlot } from '../../tokens';
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
    /** 编辑器内容版本号，每次 docChanged 时 +1。作为定时发送 effect 的依赖项，认识内容变化 */
    contentVersion: number;
    /** 标记当前是内部同步更新，防止 syncEditorDynamicTokens 触发 contentVersion 递增 */
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
    editor, mode, lineEnding, isConnected, isEmpty,
    sessionId, isTimerRunning, timerInterval, contentVersion, isSyncingRef,
    onSend, onConnectRequest,
}: UseSerialInputLogicParams) => {
    const { showToast } = useToast();
    const { t } = useI18n();

    // 提取当前编辑器中的 Token
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
        console.log('SerialInput handleSend:', { html, text, json: JSON.stringify(editor.getJSON(), null, 2), tokensMap });
        const { data } = MessagePipeline.process(text, html, mode, tokensMap, lineEnding);

        onSend(data, mode);

        // 发送后更新所有有状态的动态 Token（通过 registry 识别，无硬编码类型判断）
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

    // 保持最新的 handleSend 引用
    const handleSendRef = useRef(handleSend);
    useEffect(() => {
        handleSendRef.current = handleSend;
    }, [handleSend]);

    // 保持 onSend 最新引用，避免加入 effect 依赖导致定时器重启
    const onSendRef = useRef(onSend);
    useEffect(() => {
        onSendRef.current = onSend;
    }, [onSend]);

    // 判断是否有动态 Token（通过 registry 查询 isDynamic 属性）
    const hasDynamicTokens = useCallback(() => {
        const tokens = extractTokens();
        const dynamicTypes = new Set(tokenRegistry.getDynamicTypes());
        return Object.values(tokens).some(t => dynamicTypes.has(t.type));
    }, [extractTokens]);

    // 定时发送逻辑
    useEffect(() => {
        if (!isTimerRunning || timerInterval <= 0) {
            if (sessionId && window.serialAPI?.timedSendStop) {
                window.serialAPI.timedSendStop(sessionId);
            }
            return;
        }

        if (!isConnected) return;

        const isDynamic = hasDynamicTokens();

        if (!isDynamic && sessionId && window.serialAPI?.timedSendStart) {
            // 静态数据：主进程高精度定时器
            if (!editor || editor.isEmpty) return;
            const html = editor.getHTML();
            const text = editor.getText();
            const tokens = extractTokens();
            const { data } = MessagePipeline.process(text, html, mode, tokens, lineEnding);

            const dataArray = data instanceof Uint8Array
                ? Array.from(data)
                : Array.from(new TextEncoder().encode(data as string));

            window.serialAPI.timedSendStart(sessionId, dataArray, timerInterval);

            return () => {
                window.serialAPI?.timedSendStop?.(sessionId);
            };
        } else if (sessionId && window.serialAPI?.timedSendStartDynamic) {
            // 动态数据：预计算帧 + 主进程 Worker Thread 高精度发送
            if (!editor || editor.isEmpty) return;
            const cachedHtml = editor.getHTML();
            const cachedTokens = extractTokens();

            // 预解析 segments（一次性 DOM 操作）
            const div = document.createElement('div');
            div.innerHTML = cachedHtml;
            const cachedSegments = parseDOM(div);

            // 预编码 lineEnding 字节
            let lineEndingBytes: Uint8Array | null = null;
            if (mode === 'text' && lineEnding) {
                const realLE = lineEnding.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
                lineEndingBytes = new TextEncoder().encode(realLE);
            }

            const BATCH_SIZE = 200; // 预计算帧数，Worker 用模运算循环使用这些帧

            // 通过 registry 检测 timestamp 插件的 Worker 实时填充槽位
            const timestampSlots: WorkerSlot[] = [];
            const analyzeTimestampSlots = () => {
                let byteOffset = 0;
                for (const segment of cachedSegments) {
                    if (segment.type === 'text') {
                        const clean = (segment.content as string).replace(/[^0-9A-Fa-f]/g, '');
                        byteOffset += Math.floor(clean.length / 2);
                    } else if (segment.type === 'token') {
                        const token = cachedTokens[segment.id];
                        if (!token) continue;
                        const plugin = tokenRegistry.get(token.type);
                        if (!plugin) continue;

                        if (plugin.getWorkerSlot) {
                            // timestamp 类型：记录槽位信息，由 Worker 实时填充
                            const slot = plugin.getWorkerSlot(token.config, byteOffset);
                            if (slot) timestampSlots.push(slot);
                            byteOffset += slot?.byteSize ?? 0;
                        } else {
                            // 其他 Token：估算字节占用（通过复用 compile 逻辑）
                            // 简化处理：用一个临时 context 来估算该 token 的字节数
                            const tmpCtx = { parts: [], currentTotalLength: 0 };
                            const configCopy = JSON.parse(JSON.stringify(token.config));
                            plugin.compile(configCopy, tmpCtx);
                            byteOffset += tmpCtx.parts.reduce((s, p) => s + p.length, 0);
                        }
                    }
                }
            };
            analyzeTimestampSlots();

            // 通过 registry 创建有状态动态 Token 的追踪对象（如 auto_inc）
            const timedStates: Record<string, TokenTimedState> = {};
            for (const id of Object.keys(cachedTokens)) {
                const token = cachedTokens[id];
                const plugin = tokenRegistry.get(token.type);
                if (plugin?.createTimedState) {
                    timedStates[id] = plugin.createTimedState(token.config);
                }
            }

            // 预计算 N 帧，计算前将各状态 Token 的 config 重置到当前快照起点
            const computeFrames = (count: number): number[][] => {
                // 将 cachedTokens 中状态 Token 的 config 重置到快照起点
                for (const [id, state] of Object.entries(timedStates)) {
                    state.applyToConfig(cachedTokens[id].config);
                }

                const frames: number[][] = [];
                for (let i = 0; i < count; i++) {
                    let data = compileSegments(cachedSegments, mode, cachedTokens);
                    if (lineEndingBytes && data instanceof Uint8Array) {
                        const merged = new Uint8Array(data.length + lineEndingBytes.length);
                        merged.set(data);
                        merged.set(lineEndingBytes, data.length);
                        data = merged;
                    }
                    frames.push(Array.from(data instanceof Uint8Array ? data : new TextEncoder().encode(data)));
                }

                // 计算完后还原（被 compileSegments 修改的部分不影响快照）
                for (const [id, state] of Object.entries(timedStates)) {
                    state.applyToConfig(cachedTokens[id].config);
                }

                return frames;
            };

            // 同步编辑器中有状态动态 Token 的显示值
            // 注意：更新前标记 isSyncingRef = true，防止 onUpdate 误判为用户编辑而触发 contentVersion 递增
            const syncEditorDynamicTokens = () => {
                if (!editor) return;
                isSyncingRef.current = true;
                try {
                    editor.chain().command(({ tr }) => {
                        let changed = false;
                        tr.doc.descendants((node, pos) => {
                            if (node.type.name === 'serialToken') {
                                const state = timedStates[node.attrs.id];
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
                    // 必须用 finally 确保即使报错也能复原标记
                    isSyncingRef.current = false;
                }
            };

            const initialFrames = computeFrames(BATCH_SIZE);

            // Worker 用模运算循环帧，直接启动（不支持热替换：Worker 事件循环被 while(true) 阻塞）
            window.serialAPI.timedSendStartDynamic(sessionId, initialFrames, timerInterval, timestampSlots);

            // 监听实际发送 tick，更新所有有状态 Token
            const unsubTick = window.serialAPI.onTimedSendTick?.(sessionId, (_data, _ts) => {
                for (const state of Object.values(timedStates)) {
                    state.onFrameSent();
                }
            });

            // 每 200ms 刷新一次有状态 Token 的显示值
            const displayIntervalId = setInterval(syncEditorDynamicTokens, 200);

            return () => {
                window.serialAPI?.timedSendStop?.(sessionId);
                unsubTick?.();
                clearInterval(displayIntervalId);
                syncEditorDynamicTokens();
            };
        } else {
            // 兜底：渲染进程 setTimeout（当 serialAPI 不可用时）
            if (!editor || editor.isEmpty) return;
            const cachedHtml = editor.getHTML();
            const cachedTokens = extractTokens();
            const div = document.createElement('div');
            div.innerHTML = cachedHtml;
            const cachedSegments = parseDOM(div);
            let lineEndingBytes: Uint8Array | null = null;
            if (mode === 'text' && lineEnding) {
                const realLE = lineEnding.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
                lineEndingBytes = new TextEncoder().encode(realLE);
            }

            let nextFireTime = performance.now() + timerInterval;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            let cancelled = false;

            const schedule = () => {
                if (cancelled) return;
                const delay = Math.max(0, nextFireTime - performance.now());
                timeoutId = setTimeout(() => {
                    if (cancelled) return;
                    nextFireTime += timerInterval;
                    let data: Uint8Array | string = compileSegments(cachedSegments, mode, cachedTokens);
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

            return () => {
                cancelled = true;
                if (timeoutId !== null) clearTimeout(timeoutId);
            };
        }
    }, [isTimerRunning, timerInterval, isConnected, sessionId, mode, lineEnding, editor, hasDynamicTokens, extractTokens, contentVersion]);

    return { extractTokens, handleSend };
};

