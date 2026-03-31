/**
 * useAutoReply.ts
 * 自动回复核心引擎 Hook。
 * 监听指定会话的日志变化，当新数据匹配预设规则时自动发送回复。
 * 规则存储在 Profile 文件中（通过 profileAPI 读写）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AutoReplyRule, createDefaultRule } from '../types/autoReply';
import { LogEntry } from '../types/session';

// ── 匹配工具函数 ──

/** 将 HEX 字符串转为 Uint8Array */
function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/\s+/g, '');
    if (clean.length % 2 !== 0) return new Uint8Array(0);
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
}

/** 将数据转为 HEX 字符串（大写，无空格） */
function dataToHex(data: string | Uint8Array): string {
    if (data instanceof Uint8Array) {
        return Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    }
    return Array.from(new TextEncoder().encode(data)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** 将数据转为文本 */
function dataToText(data: string | Uint8Array): string {
    if (typeof data === 'string') return data;
    return new TextDecoder('utf-8', { fatal: false }).decode(data);
}

/** 检测日志数据是否匹配规则 */
function matchRule(rule: AutoReplyRule, data: string | Uint8Array): boolean {
    const dataStr = rule.matchDataMode === 'hex'
        ? dataToHex(data)
        : dataToText(data);

    const pattern = rule.matchDataMode === 'hex'
        ? rule.matchPattern.replace(/\s+/g, '').toUpperCase()
        : rule.matchPattern;

    if (!pattern) return false;

    switch (rule.matchMode) {
        case 'exact':
            return dataStr === pattern;
        case 'contains':
            return dataStr.includes(pattern);
        case 'regex': {
            try {
                return new RegExp(pattern).test(dataStr);
            } catch {
                return false;
            }
        }
        default:
            return false;
    }
}

/** 将回复内容转为可发送的数据 */
function prepareReplyData(rule: AutoReplyRule): string | Uint8Array {
    if (rule.replyDataMode === 'hex') {
        return hexToBytes(rule.replyData);
    }
    return rule.replyData;
}

// ── 持久化 Store 类型 ──

interface AutoReplyStore {
    enabled: boolean;
    rules: AutoReplyRule[];
    /** 生效的会话 ID 列表，空数组 = 全部会话 */
    targetSessionIds: string[];
}

const DEFAULT_STORE: AutoReplyStore = { enabled: false, rules: [], targetSessionIds: [] };

// ── Hook ──

interface UseAutoReplyParams {
    /** 当前活跃 Profile 名称 */
    activeProfile: string;
    /** Profile 是否已加载就绪 */
    profileLoaded: boolean;
    /** 所有会话的日志（按 sessionId 索引） */
    sessionsData: Array<{ id: string; logs: LogEntry[]; isConnected: boolean }>;
    /** 发送回调 */
    writeToSession: (sessionId: string, data: string | Uint8Array, options?: { commandName?: string }) => void;
}

export function useAutoReply({ activeProfile, profileLoaded, sessionsData, writeToSession }: UseAutoReplyParams) {
    const [store, setStore] = useState<AutoReplyStore>(DEFAULT_STORE);
    const [isLoaded, setIsLoaded] = useState(false);
    // 每个 session 处理过的日志数量
    const processedCountRef = useRef<Map<string, number>>(new Map());
    // 延迟定时器
    const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    // 防抖保存定时器
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const { enabled, rules, targetSessionIds } = store;

    // 从 Profile 文件加载自动回复数据
    useEffect(() => {
        if (!profileLoaded) return;
        let cancelled = false;

        const load = async () => {
            try {
                const res = await window.profileAPI?.getAutoReply(activeProfile);
                if (cancelled) return;
                if (res?.success && res.data) {
                    setStore(res.data as unknown as AutoReplyStore);
                } else {
                    setStore(DEFAULT_STORE);
                }
            } catch (e) {
                console.error('加载自动回复规则失败:', e);
                if (!cancelled) setStore(DEFAULT_STORE);
            }
            if (!cancelled) setIsLoaded(true);
        };
        setIsLoaded(false);
        load();
        return () => { cancelled = true; };
    }, [activeProfile, profileLoaded]);

    // 防抖保存到 Profile 文件
    useEffect(() => {
        if (!isLoaded) return;

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
            window.profileAPI?.saveAutoReply(activeProfile, store).catch(e => {
                console.error('保存自动回复规则失败:', e);
            });
        }, 500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [store, isLoaded, activeProfile]);

    // 清理定时器
    useEffect(() => {
        return () => {
            timersRef.current.forEach(clearTimeout);
            timersRef.current.clear();
        };
    }, []);

    // 监听日志变化并执行匹配
    useEffect(() => {
        if (!enabled || rules.length === 0) return;

        const enabledRules = rules.filter(r => r.enabled && r.matchPattern && r.replyData);
        if (enabledRules.length === 0) return;

        for (const session of sessionsData) {
            // 检查该会话是否在目标列表中
            if (targetSessionIds.length > 0 && !targetSessionIds.includes(session.id)) continue;
            if (!session.isConnected) continue;

            const prevCount = processedCountRef.current.get(session.id) || 0;
            const newCount = session.logs.length;

            if (newCount <= prevCount) {
                // 日志被清空的情况
                if (newCount < prevCount) {
                    processedCountRef.current.set(session.id, newCount);
                }
                continue;
            }

            // 仅处理新增的日志条目
            const newLogs = session.logs.slice(prevCount);
            processedCountRef.current.set(session.id, newCount);

            for (const log of newLogs) {
                for (const rule of enabledRules) {
                    // 仅匹配 RX 类型的日志
                    if (log.type !== 'RX') continue;
                    if (!matchRule(rule, log.data)) continue;

                    // 命中规则，准备回复
                    const replyData = prepareReplyData(rule);
                    const sid = session.id;
                    const replyLabel = rule.name || '⚡Auto Reply';
                    if (rule.replyDelay > 0) {
                        const timer = setTimeout(() => {
                            timersRef.current.delete(timer);
                            writeToSession(sid, replyData, { commandName: replyLabel });
                        }, rule.replyDelay);
                        timersRef.current.add(timer);
                    } else {
                        writeToSession(sid, replyData, { commandName: replyLabel });
                    }
                    break; // 匹配第一条命中的规则后停止
                }
            }
        }
    }, [sessionsData, enabled, rules, targetSessionIds, writeToSession]);

    // ── CRUD 操作 ──

    const setEnabled = useCallback((val: boolean) => {
        setStore(prev => ({ ...prev, enabled: val }));
    }, []);

    const setTargetSessionIds = useCallback((ids: string[]) => {
        setStore(prev => ({ ...prev, targetSessionIds: ids }));
    }, []);

    const addRule = useCallback(() => {
        const newRule = createDefaultRule();
        setStore(prev => ({ ...prev, rules: [...prev.rules, newRule] }));
        return newRule;
    }, []);

    const updateRule = useCallback((id: string, updates: Partial<AutoReplyRule>) => {
        setStore(prev => ({
            ...prev,
            rules: prev.rules.map(r => r.id === id ? { ...r, ...updates } : r),
        }));
    }, []);

    const deleteRule = useCallback((id: string) => {
        setStore(prev => ({
            ...prev,
            rules: prev.rules.filter(r => r.id !== id),
        }));
    }, []);

    const toggleRuleEnabled = useCallback((id: string) => {
        setStore(prev => ({
            ...prev,
            rules: prev.rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r),
        }));
    }, []);

    const reorderRules = useCallback((fromIndex: number, toIndex: number) => {
        setStore(prev => {
            const rules = [...prev.rules];
            const [moved] = rules.splice(fromIndex, 1);
            rules.splice(toIndex, 0, moved);
            return { ...prev, rules };
        });
    }, []);

    const duplicateRule = useCallback((id: string) => {
        setStore(prev => {
            const idx = prev.rules.findIndex(r => r.id === id);
            if (idx === -1) return prev;
            const original = prev.rules[idx];
            const copy: AutoReplyRule = {
                ...original,
                id: Date.now().toString(36) + Math.random().toString(36).slice(2),
                name: original.name + ' (副本)',
                enabled: false,
            };
            const rules = [...prev.rules];
            rules.splice(idx + 1, 0, copy);
            return { ...prev, rules };
        });
    }, []);

    return {
        enabled,
        rules,
        targetSessionIds,
        setEnabled,
        setTargetSessionIds,
        addRule,
        updateRule,
        deleteRule,
        toggleRuleEnabled,
        reorderRules,
        duplicateRule,
    };
}
