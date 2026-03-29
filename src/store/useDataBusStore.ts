import { create } from 'zustand';

/** 物理量值字典：key=字段名，value=物理量（已含 multiplier 换算） */
export type PhysicalValues = Record<string, number>;

export interface SessionDataBus {
    latestValues: PhysicalValues;
}

/** 
 * 全局定长波形环形队列，为避免 React 频繁渲染引发 GC 卡顿，脱离在 Zustand 之外维护。
 * 格式： sessionId -> fieldName -> { t: number[], v: number[] }
 */
export const dataBusHistory: Record<string, Record<string, { t: number[]; v: number[] }>> = {};

interface DataBusState {
    /** 每个 Session 的专属数据空间 */
    sessionsData: Record<string, SessionDataBus>;
    
    /** 将 Rust 批量推送的数组定向覆盖到特定 Session，并静默填入二级 dataBusHistory */
    ingestBatch: (sessionId: string, batch: Array<Record<string, number>>) => void;
    
    /** 反向交互：覆盖某 Session 变量池的数据，未来接入 Rust 逆向组包发出 Hex */
    publishValue: (sessionId: string, key: string, value: number) => void;
    
    /** 清空某个特定的 Session 数据（连接断开时调用） */
    resetSession: (sessionId: string) => void;

    /** 重置所有数据（兜底清理） */
    resetAll: () => void;
}

export const useDataBusStore = create<DataBusState>()((set) => ({
    sessionsData: {},

    ingestBatch: (sessionId, batch) => {
        if (batch.length === 0) return;
        
        // 取得当前时间戳用于 X 轴，同批次内微调错开避免垂直连线
        const now = Date.now() / 1000; 

        set((state) => {
            const currentSession = state.sessionsData[sessionId] || { latestValues: {} };
            let mergedValues = { ...currentSession.latestValues };

            if (!dataBusHistory[sessionId]) {
                dataBusHistory[sessionId] = {};
            }
            
            for (let i = 0; i < batch.length; i++) {
                const frame = batch[i];
                mergedValues = { ...mergedValues, ...frame };
                
                // 填入二级 dataBusHistory
                for (const key in frame) {
                    if (!dataBusHistory[sessionId][key]) {
                        dataBusHistory[sessionId][key] = { t: [], v: [] };
                    }
                    const timeOffset = now - ((batch.length - i - 1) * 0.001);
                    dataBusHistory[sessionId][key].t.push(timeOffset);
                    dataBusHistory[sessionId][key].v.push(frame[key]);
                    
                    // 维持 2000 个点，避免无限溢出
                    if (dataBusHistory[sessionId][key].t.length > 2000) {
                        dataBusHistory[sessionId][key].t.shift();
                        dataBusHistory[sessionId][key].v.shift();
                    }
                }
            }

            return {
                sessionsData: {
                    ...state.sessionsData,
                    [sessionId]: { latestValues: mergedValues }
                }
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
        for (const sessionId in dataBusHistory) delete dataBusHistory[sessionId];
        set({ sessionsData: {} });
    },

    publishValue: (sessionId, key, value) => {
        // 先更新前端显示
        set((state) => {
            const currentSession = state.sessionsData[sessionId] || { latestValues: {} };
            return {
                sessionsData: {
                    ...state.sessionsData,
                    [sessionId]: {
                        latestValues: { ...currentSession.latestValues, [key]: value }
                    }
                }
            };
        });
        
        // 记录到该 session 的波形中
        const now = Date.now() / 1000;
        if (!dataBusHistory[sessionId]) dataBusHistory[sessionId] = {};
        if (!dataBusHistory[sessionId][key]) dataBusHistory[sessionId][key] = { t: [], v: [] };
        
        dataBusHistory[sessionId][key].t.push(now);
        dataBusHistory[sessionId][key].v.push(value);
        if (dataBusHistory[sessionId][key].t.length > 2000) {
            dataBusHistory[sessionId][key].t.shift();
            dataBusHistory[sessionId][key].v.shift();
        }

        // TODO: invoke('pack_and_send_variable', { sessionId, key, value })
    }
}));
