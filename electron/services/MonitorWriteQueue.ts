/**
 * MonitorWriteQueue.ts
 * 监控服务的写入队列管理 — 确保同一端口的写入请求串行化，避免竞争条件。
 * 从 MonitorService.ts 中拆分出来。
 */

/** 写入队列管理器 */
export class MonitorWriteQueue {
    private queues: Map<string, Map<'virtual' | 'physical', Promise<void>>> = new Map();

    /**
     * 将写入操作排入指定会话和目标端口的队列
     * @param sessionId 会话 ID
     * @param target 目标端口（virtual 或 physical）
     * @param writeFn 实际写入函数
     * @param isValid 验证会话是否仍然有效的回调
     */
    async enqueue(
        sessionId: string,
        target: 'virtual' | 'physical',
        writeFn: () => Promise<void>,
        isValid: () => boolean,
    ): Promise<void> {
        if (!isValid()) return;

        if (!this.queues.has(sessionId)) {
            this.queues.set(sessionId, new Map());
        }
        const sessionQueues = this.queues.get(sessionId)!;
        const existing = sessionQueues.get(target) || Promise.resolve();

        const next = existing
            .then(async () => {
                if (!isValid()) return;

                let isDone = false;
                await Promise.race([
                    writeFn().finally(() => { isDone = true; }),
                    new Promise(resolve => setTimeout(() => {
                        if (!isDone) console.warn(`[Monitor] Write task for ${target} timed out in queue, forcing release.`);
                        resolve(true);
                    }, 1500))
                ]);
            })
            .catch(err => {
                console.error(`[Monitor] Queue write error for ${target}:`, (err as Error).message);
            });

        sessionQueues.set(target, next);
        return next;
    }

    /** 清理指定会话的所有队列 */
    deleteSession(sessionId: string): void {
        this.queues.delete(sessionId);
    }
}
