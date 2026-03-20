/**
 * useAutoReply.ts
 * 自动回复核心引擎 Hook。
 * 监听指定会话的日志变化，当新数据匹配预设规则时自动发送回复。
 * 规则存储在 localStorage 中（全局，不与单个 session 绑定）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AutoReplyRule, createDefaultRule } from '../types/autoReply';
import { LogEntry } from '../types/session';

const STORAGE_KEY = 'tcom:autoReply';

// ── 持久化工具 ──

interface AutoReplyStore {
    enabled: boolean;
    rules: AutoReplyRule[];
    /** 生效的会话 ID 列表，空数组 = 全部会话 */
    targetSessionIds: string[];
}

function loadStore(): AutoReplyStore {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* 忽略 */ }
    return { enabled: false, rules: [], targetSessionIds: [] };
}

function saveStore(store: AutoReplyStore): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

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
            return rule.matchDataMode === 'hex'
                ? dataStr.includes(pattern)
                : dataStr.includes(pattern);
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

// ── Hook ──

interface UseAutoReplyParams {
    /** 所有会话的日志（按 sessionId 索引） */
    sessionsData: Array<{ id: string; logs: LogEntry[]; isConnected: boolean }>;
    /** 发送回调（支持 commandName 标识） */
    writeToSession: (sessionId: string, data: string | Uint8Array, options?: { commandName?: string }) => void;
}

export function useAutoReply({ sessionsData, writeToSession }: UseAutoReplyParams) {
    // 从 localStorage 加载初始状态
    const [store, setStore] = useState<AutoReplyStore>(loadStore);
    // 每个 session 处理过的日志数量
    const processedCountRef = useRef<Map<string, number>>(new Map());
    // 延迟定时器
    const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    const { enabled, rules, targetSessionIds } = store;

    // 持久化到 localStorage
    useEffect(() => {
        saveStore(store);
    }, [store]);

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
    };
}
