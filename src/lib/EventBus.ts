/**
 * EventBus.ts
 * 全局事件总线，支持发布-订阅模式。
 * 从 FeatureContext.tsx 中拆分出来，可被多个模块复用。
 */
import { Disposable } from '../types/module';

export class EventBus {
    private listeners = new Map<string, Set<(...args: any[]) => void>>();

    on(event: string, cb: (...args: any[]) => void): Disposable {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(cb);
        return {
            dispose: () => {
                this.listeners.get(event)?.delete(cb);
            }
        };
    }

    emit(event: string, ...args: any[]): void {
        this.listeners.get(event)?.forEach(cb => {
            try { cb(...args); } catch (e) {
                console.error(`[EventBus] Error in listener for "${event}":`, e);
            }
        });
    }
}

// 全局单例
export const globalEventBus = new EventBus();
