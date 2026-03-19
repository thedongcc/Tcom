/**
 * toastManager.ts
 * 命令式 Toast API — 脱离 React Context 树，基于原生发布-订阅模式。
 * 任何地方（React 组件、普通 TS 函数、IPC 拦截器）都可直接调用。
 *
 * 用法：import { toast } from '@/services/toastManager';
 *       toast.success('操作成功');
 *       toast.error('出错了', 3000);
 */
import type { ToastType } from '../components/common/Toast';

export interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
    closing?: boolean;
    expired?: boolean;
}

type ToastListener = (toasts: ToastItem[]) => void;

// ── 内部状态 ──
let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
    const snapshot = [...toasts];
    listeners.forEach(fn => fn(snapshot));
}

function removeToast(id: string) {
    toasts = toasts.filter(t => t.id !== id);
    notify();
}

function markAsExpired(id: string) {
    toasts = toasts.map(t => t.id === id ? { ...t, expired: true } : t);
    // 触发最旧过期 toast 的 closing 动画
    if (toasts.length > 0 && toasts[0].expired && !toasts[0].closing) {
        toasts = toasts.map((t, i) => i === 0 ? { ...t, closing: true } : t);
    }
    notify();
}

function showToast(message: string, type: ToastType = 'success', duration: number = 1000) {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: ToastItem = { id, message, type, duration, closing: false, expired: false };

    // 限制最多 3 个活跃 toast
    const activeToasts = toasts.filter(t => !t.closing && !t.expired);
    if (activeToasts.length >= 3) {
        const oldest = activeToasts[0];
        if (oldest) {
            toasts = toasts.map(t => t.id === oldest.id ? { ...t, expired: true } : t);
        }
    }

    toasts = [...toasts, newToast];

    // 硬上限：只保留最近 3 个
    if (toasts.length > 3) {
        toasts = toasts.slice(-3);
    }

    notify();
}

// ── 公共 API ──

/** 命令式 Toast 接口 */
export const toast = {
    success: (message: string, duration?: number) => showToast(message, 'success', duration),
    error: (message: string, duration?: number) => showToast(message, 'error', duration ?? 3000),
    info: (message: string, duration?: number) => showToast(message, 'info', duration),
    warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
    /** 兼容旧 API 的通用调用 */
    show: showToast,
};

/** UI 渲染容器订阅接口 */
export const toastStore = {
    subscribe: (listener: ToastListener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    getSnapshot: () => toasts,
    remove: removeToast,
    markAsExpired,
};
