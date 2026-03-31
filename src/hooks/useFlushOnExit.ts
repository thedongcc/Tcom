/**
 * useFlushOnExit.ts
 * 退出 Flush 注册中心 — 解决防抖写盘在窗口关闭时可能丢失最后一次修改的问题。
 *
 * 原理：
 * 1. 各 Context/Hook 通过 registerFlush 注册自己的 "立即保存" 回调
 * 2. 监听 Tauri 窗口的 close-requested 事件
 * 3. 关闭前先执行所有 flush → 等待全部完成 → 再允许窗口销毁
 *
 * 使用方式：
 * - 在 FullApp 中调用 useFlushOnExit() 初始化
 * - 各 Context 中调用 flushRegistry.register(() => myFlush())
 * - 组件卸载时调用 flushRegistry.unregister(fn)
 */

import { getCurrentWindow } from '@tauri-apps/api/window';

type FlushFn = () => Promise<void> | void;

/** 全局 Flush 注册表 */
class FlushRegistry {
    private callbacks = new Set<FlushFn>();

    /** 注册一个 flush 回调 */
    register(fn: FlushFn): void {
        this.callbacks.add(fn);
    }

    /** 注销 flush 回调 */
    unregister(fn: FlushFn): void {
        this.callbacks.delete(fn);
    }

    /** 执行所有 flush 回调（并发执行，等待全部完成） */
    async flushAll(): Promise<void> {
        const promises = Array.from(this.callbacks).map(fn => {
            try {
                const result = fn();
                return result instanceof Promise ? result : Promise.resolve();
            } catch (e) {
                console.error('[FlushRegistry] flush 回调执行失败:', e);
                return Promise.resolve();
            }
        });
        await Promise.allSettled(promises);
    }
}

/** 全局单例 */
export const flushRegistry = new FlushRegistry();

/**
 * 在 FullApp 中调用一次——监听 Tauri 窗口关闭事件，
 * 关闭前强制执行所有注册的 flush 回调。
 * 设 2 秒超时保护：防止某个写盘操作死锁导致窗口永远关不掉。
 */
export function initFlushOnExit(): void {
    const FLUSH_TIMEOUT_MS = 2000;

    const win = getCurrentWindow();

    win.onCloseRequested(async (event) => {
            // 阻止默认关闭行为
            event.preventDefault();

// log('[FlushOnExit] 窗口关闭请求，执行 flush（超时 2s）...');

            // 使用 Promise.race 竞速：flushAll vs 超时
            const timeout = new Promise<void>(resolve => {
                setTimeout(() => {
                    console.warn('[FlushOnExit] flush 超时（2s），强制销毁窗口');
                    resolve();
                }, FLUSH_TIMEOUT_MS);
            });

            await Promise.race([
                flushRegistry.flushAll(),
                timeout,
            ]);

// log('[FlushOnExit] flush 完成/超时，销毁窗口');

            // 销毁窗口
        await win.destroy();
    });
}
