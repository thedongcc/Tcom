import { create } from 'zustand';

/** 物理量值字典：key=字段名，value=物理量（已含 multiplier 换算） */
export type PhysicalValues = Record<string, number>;

/**
 * 按方案隔离的数据空间：
 * schemeValues[schemeId][fieldName] = 最新物理量值
 *
 * 相比原来的平铺 latestValues，这里按 scheme_id 分层，
 * 彻底解决多方案同名字段互相覆盖的问题。
 */
export interface SessionDataBus {
    /** 按 schemeId 分层的最新值 */
    schemeValues: Record<string, PhysicalValues>;
}

/**
 * 全局定长波形环形队列，脱离 Zustand 之外维护，避免高频写入引发 React 全量重渲染。
 * 格式：sessionId -> schemeId -> fieldName -> { t, v }
 */
export const dataBusHistory: Record<
    string,
    Record<string, Record<string, { t: number[]; v: number[] }>>
> = {};

/** 单条解析结果（与 Rust ParsedEntry 对应） */
export interface ParsedEntry {
    scheme_id: string;
    fields: Record<string, number>;
}

interface DataBusState {
    sessionsData: Record<string, SessionDataBus>;

    /**
     * 将 Rust 推送的 batch（含 scheme_id）注入对应 Session 的按方案分层存储。
     */
    ingestBatch: (sessionId: string, batch: ParsedEntry[]) => void;

    /** 清空某个特定的 Session 数据 */
    resetSession: (sessionId: string) => void;

    /** 重置所有数据（兜底清理） */
    resetAll: () => void;

    /** 直接发布单个值（保留旧接口兼容性，归入 '__manual__' scheme） */
    publishValue: (sessionId: string, key: string, value: number) => void;
}

export const useDataBusStore = create<DataBusState>()((set) => ({
    sessionsData: {},

    ingestBatch: (sessionId, batch) => {
        if (batch.length === 0) return;

        const now = Date.now() / 1000;

        set((state) => {
            const currentSession = state.sessionsData[sessionId] || { schemeValues: {} };
            const newSchemeValues = { ...currentSession.schemeValues };

            if (!dataBusHistory[sessionId]) {
                dataBusHistory[sessionId] = {};
            }

            for (const entry of batch) {
                const { scheme_id, fields } = entry;

                // 合并到对应方案的 values
                newSchemeValues[scheme_id] = {
                    ...(newSchemeValues[scheme_id] || {}),
                    ...fields,
                };

                // 写入历史（用于图表）
                if (!dataBusHistory[sessionId][scheme_id]) {
                    dataBusHistory[sessionId][scheme_id] = {};
                }
                for (const key in fields) {
                    if (!dataBusHistory[sessionId][scheme_id][key]) {
                        dataBusHistory[sessionId][scheme_id][key] = { t: [], v: [] };
                    }
                    dataBusHistory[sessionId][scheme_id][key].t.push(now);
                    dataBusHistory[sessionId][scheme_id][key].v.push(fields[key]);
                    // 保持最近 2000 个点
                    if (dataBusHistory[sessionId][scheme_id][key].t.length > 2000) {
                        dataBusHistory[sessionId][scheme_id][key].t.shift();
                        dataBusHistory[sessionId][scheme_id][key].v.shift();
                    }
                }
            }

            return {
                sessionsData: {
                    ...state.sessionsData,
                    [sessionId]: { schemeValues: newSchemeValues },
                },
            };
        });
    },

    resetSession: (sessionId) => {
        if (dataBusHistory[sessionId]) {
            delete dataBusHistory[sessionId];
        }
        set((state) => {
            const next = { ...state.sessionsData };
            delete next[sessionId];
            return { sessionsData: next };
        });
    },

    resetAll: () => {
        for (const sid in dataBusHistory) delete dataBusHistory[sid];
        set({ sessionsData: {} });
    },

    publishValue: (sessionId, key, value) => {
        // 归入 '__manual__' 虚拟方案，不与实际解析方案混淆
        set((state) => {
            const cur = state.sessionsData[sessionId] || { schemeValues: {} };
            return {
                sessionsData: {
                    ...state.sessionsData,
                    [sessionId]: {
                        schemeValues: {
                            ...cur.schemeValues,
                            __manual__: { ...(cur.schemeValues['__manual__'] || {}), [key]: value },
                        },
                    },
                },
            };
        });

        // 历史记录
        const now = Date.now() / 1000;
        if (!dataBusHistory[sessionId]) dataBusHistory[sessionId] = {};
        if (!dataBusHistory[sessionId]['__manual__']) dataBusHistory[sessionId]['__manual__'] = {};
        if (!dataBusHistory[sessionId]['__manual__'][key]) {
            dataBusHistory[sessionId]['__manual__'][key] = { t: [], v: [] };
        }
        dataBusHistory[sessionId]['__manual__'][key].t.push(now);
        dataBusHistory[sessionId]['__manual__'][key].v.push(value);
        if (dataBusHistory[sessionId]['__manual__'][key].t.length > 2000) {
            dataBusHistory[sessionId]['__manual__'][key].t.shift();
            dataBusHistory[sessionId]['__manual__'][key].v.shift();
        }
    },
}));
