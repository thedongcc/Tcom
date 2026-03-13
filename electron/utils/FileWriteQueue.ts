/**
 * FileWriteQueue
 * 解决并发保存文件时的防冲突与数据损坏问题
 */
export class FileWriteQueue {
    private static queues: Map<string, Promise<void>> = new Map();

    static async enqueue(filePath: string, writeFn: () => Promise<void>): Promise<void> {
        const existing = FileWriteQueue.queues.get(filePath) || Promise.resolve();

        const next = existing
            .then(() => {
                let isDone = false;
                return Promise.race([
                    writeFn().finally(() => { isDone = true; }),
                    new Promise<void>(resolve => setTimeout(() => {
                        if (!isDone) console.warn(`[FileQueue] Write task for ${filePath} timed out, forcing release.`);
                        resolve();
                    }, 5000))
                ]);
            })
            .catch(err => {
                console.error(`[FileQueue] Write error for ${filePath}:`, err);
            });

        FileWriteQueue.queues.set(filePath, next as Promise<void>);
        return next as Promise<void>;
    }
}
