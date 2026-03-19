/**
 * confirmManager.ts
 * 命令式 Confirm API — 脱离 React Context 树，基于 Promise + 发布-订阅。
 *
 * 用法：import { confirm } from '@/services/confirmManager';
 *       const ok = await confirm({ title: '确认', message: '确定删除?' });
 */
import type { ConfirmType } from '../components/common/ConfirmDialog';

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: ConfirmType;
}

export interface ConfirmState {
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
}

type ConfirmListener = (state: ConfirmState | null) => void;

// ── 内部状态 ──
let currentState: ConfirmState | null = null;
const listeners = new Set<ConfirmListener>();

function notify() {
    listeners.forEach(fn => fn(currentState));
}

/** 命令式 Confirm 调用 — 返回 Promise<boolean> */
export function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        currentState = {
            options,
            resolve: (value: boolean) => {
                resolve(value);
                currentState = null;
                notify();
            },
        };
        notify();
    });
}

/** UI 渲染容器订阅接口 */
export const confirmStore = {
    subscribe: (listener: ConfirmListener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    getSnapshot: () => currentState,
};
