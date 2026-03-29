/**
 * useDataBusListener.ts
 * 全局数据总线事件监听 Hook — 应在根布局组件挂载，终生有效。
 *
 * 订阅 Rust 推送的 `tcom-parsed-data` IPC 事件，
 * 将批量物理量数据注入 useDataBusStore。
 */
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useDataBusStore } from '../store/useDataBusStore';

export function useDataBusListener() {
    useEffect(() => {
        let unlisten: (() => void) | null = null;
        let cancelled = false;

        console.log('[DataBus] 正在注册 tcom-parsed-data 全局事件监听器...');

        listen<{ session_id: string; batch: Array<Record<string, number>> }>('tcom-parsed-data', (e) => {
            if (cancelled) return;

            const { session_id, batch } = e.payload;
            // console.log(`[DataBus] 收到解析批次, 会话: ${session_id}, 帧数: ${batch.length}`);

            useDataBusStore.getState().ingestBatch(session_id, batch);
        }).then((fn) => {
            if (cancelled) {
                fn();
            } else {
                unlisten = fn;
                console.log('[DataBus] tcom-parsed-data 监听器已激活 ✅');
            }
        }).catch((err) => {
            console.error('[DataBus] 监听器注册失败:', err);
        });

        return () => {
            cancelled = true;
            unlisten?.();
            console.log('[DataBus] tcom-parsed-data 监听器已注销');
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
