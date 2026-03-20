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
    // 移除后检查是否有过期但尚未 closing 的 toast，触发最旧那个的关闭动画
    triggerNextClosing();
    notify();
}

/** 触发最旧的已过期且未 closing 的 toast 的关闭动画 */
function triggerNextClosing() {
    const pendingExpired = toasts.find(t => t.expired && !t.closing);
    if (pendingExpired) {
        toasts = toasts.map(t => t.id === pendingExpired.id ? { ...t, closing: true } : t);
    }
}

function markAsExpired(id: string) {
    toasts = toasts.map(t => t.id === id ? { ...t, expired: true } : t);
    // 找到最旧的已过期但未 closing 的 toast，触发其关闭动画
    triggerNextClosing();
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
