/**
 * useDataBusStore.ts
 * 前端数据总线 — 接收 Rust 协议解析引擎推送的批量物理量数据。
 *
 * 设计原则：
 * - 轻量 Zustand Store，只维护最新快照（UI 只关心"现在是多少"）。
 * - ingestBatch 以覆盖方式合并批量数据，保证高频写入时内存稳定。
 * - 组件通过 selector 按需订阅，避免无关字段触发重渲染。
 */
import { create } from 'zustand';

/** 物理量值字典：key=字段名，value=物理量（已含 multiplier 换算） */
export type PhysicalValues = Record<string, number>;

/** 
 * 由于高频波形图不能依赖 React State (会导致灾难性 GC 和卡顿) 
 * 此全局变量以极其轻量的方式存储用于波形图绘制的定长环形队列 
 * (uPlot 在 requestAnimationFrame 中直接拉取，绕开 UI 渲染树)
 */
export const dataBusHistory: Record<string, { t: number[]; v: number[] }> = {};

interface DataBusState {
    /** 最新一帧（快照）的全部物理量 */
    latestValues: PhysicalValues;
    /** 将 Rust 批量推送的数组逐帧覆盖合并到 latestValues，同时静默填入 dataBusHistory */
    ingestBatch: (batch: Array<Record<string, number>>) => void;
    /** 反向交互：覆盖变量池中的数据，未来接入 Rust 逆向组包发出 Hex */
    publishValue: (key: string, value: number) => void;
    /** 清空所有数据（连接断开时调用） */
    reset: () => void;
}

export const useDataBusStore = create<DataBusState>()((set) => ({
    latestValues: {},

    ingestBatch: (batch) => {
        if (batch.length === 0) return;
        
        // 取得当前时间戳用于 X 轴，并在同一批次内微调错开避免挤压重叠
        // 注意：uPlot 默认要求 X 轴按升序排列
        const now = Date.now() / 1000; 

        set((state) => {
            let merged = { ...state.latestValues };
            
            for (let i = 0; i < batch.length; i++) {
                const frame = batch[i];
                merged = { ...merged, ...frame };
                
                // 将序列数据静默写入 dataBusHistory
                for (const key in frame) {
                    if (!dataBusHistory[key]) {
                        dataBusHistory[key] = { t: [], v: [] };
                    }
                    
                    // 为了让同一批次的线条有些微的时间差，而不是垂直的线
                    const timeOffset = now - ((batch.length - i - 1) * 0.001);
                    dataBusHistory[key].t.push(timeOffset);
                    dataBusHistory[key].v.push(frame[key]);
                    
                    // 维持 1000 个点，多余的剔除
                    if (dataBusHistory[key].t.length > 1000) {
                        dataBusHistory[key].t.shift();
                        dataBusHistory[key].v.shift();
                    }
                }
            }
            return { latestValues: merged };
        });
    },

    reset: () => {
        for (const key in dataBusHistory) delete dataBusHistory[key];
        set({ latestValues: {} });
    },

    publishValue: (key, value) => {
        // 先在前端更新显示
        set((state) => ({
            latestValues: { ...state.latestValues, [key]: value }
        }));
        
        // 同样记录到波形缓冲中，让图表能看到我们下发的突变
        const now = Date.now() / 1000;
        if (!dataBusHistory[key]) dataBusHistory[key] = { t: [], v: [] };
        dataBusHistory[key].t.push(now);
        dataBusHistory[key].v.push(value);
        if (dataBusHistory[key].t.length > 1000) {
            dataBusHistory[key].t.shift();
            dataBusHistory[key].v.shift();
        }

        // TODO: 在这里调用 Tauri IPC invoke / emit
        // e.g. invoke('pack_and_send_variable', { key, value })
        // 这将唤醒 Rust 的打包引擎向串口下发协议字节
    }
}));
