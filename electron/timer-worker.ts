/* eslint-disable */
/**
 * timer-worker.ts
 * 高精度定时发送 Worker 独立入口。
 * 由 TimedSendManager 通过 new Worker('./timer-worker.js') 加载。
 *
 * 精度方案：
 *   粗粒度等待 → Atomics.wait()    ：OS 级阻塞，0% CPU
 *   最后 5ms   → performance.now() ：Worker 自旋，精度 ~0.1ms
 *   漂移补偿   → 绝对时间轴         ：nextFireTime += interval
 *
 * workerData 参数：
 *   mode: 'static' | 'dynamic'
 *   intervalMs: number
 *   controlBuf: SharedArrayBuffer
 *   data?: number[]
 *   frames?: number[][]
 *   timestampSlots?: TimestampSlot[]
 */

// 声明为 ESM 模块以避免全局变量冲突
export {};

import { workerData, parentPort } from 'worker_threads';
import { performance as perf } from 'perf_hooks';

interface WorkerData {
    mode: 'static' | 'dynamic';
    intervalMs: number;
    controlBuf: SharedArrayBuffer;
    frames?: number[][];
    timestampSlots?: Array<{
        byteOffset: number;
        byteSize: number;
        byteOrder: string;
        format: string;
    }>;
}

const data = workerData as WorkerData;
const LEAD_MS = 5;
const control = new Int32Array(data.controlBuf);

/** 精确等待到目标时间点，返回 false 表示收到停止信号 */
function preciseWaitUntil(targetTime: number): boolean {
    const remaining = targetTime - perf.now();
    if (remaining > LEAD_MS) {
        // 粗粒度阻塞等待（OS 级，0% CPU）
        const coarse = Math.floor(remaining - LEAD_MS);
        if (Atomics.wait(control, 0, 0, coarse) !== 'timed-out') return false;
    }
    // 最后 5ms 自旋精确对齐
    while (perf.now() < targetTime) {
        if (Atomics.load(control, 0) !== 0) return false;
    }
    return true;
}

if (data.mode === 'static') {
    // ── 静态模式：固定帧不断循环发送 ──
    let nextFireTime = perf.now() + data.intervalMs;

    while (true) {
        if (!preciseWaitUntil(nextFireTime)) break;
        nextFireTime += data.intervalMs;
        parentPort!.postMessage(null);
    }
} else {
    // ── 动态模式：预计算帧 + 时间戳实时填充，循环发送 ──
    const frames: Buffer[] = (data.frames ?? []).map((f: number[]) => Buffer.from(f));
    const timestampSlots = data.timestampSlots ?? [];
    let frameIndex = 0;
    let nextFireTime = perf.now() + data.intervalMs;

    /** 将时间戳填充到帧 Buffer 的指定槽位 */
    function fillTimestamp(buf: Buffer): void {
        for (const slot of timestampSlots) {
            const ts: bigint = slot.format === 'milliseconds'
                ? BigInt(Date.now())
                : BigInt(Math.floor(Date.now() / 1000));
            if (slot.byteOrder === 'big') {
                for (let i = slot.byteSize - 1; i >= 0; i--) {
                    buf[slot.byteOffset + (slot.byteSize - 1 - i)] = Number((ts >> BigInt(i * 8)) & BigInt(0xFF));
                }
            } else {
                for (let i = 0; i < slot.byteSize; i++) {
                    buf[slot.byteOffset + i] = Number((ts >> BigInt(i * 8)) & BigInt(0xFF));
                }
            }
        }
    }

    while (true) {
        if (!preciseWaitUntil(nextFireTime)) break;
        nextFireTime += data.intervalMs;

        // 模运算循环使用帧，永不耗尽
        const idx = frameIndex % frames.length;
        const buf = Buffer.from(frames[idx]);
        fillTimestamp(buf);
        parentPort!.postMessage({ type: 'send', data: buf, index: frameIndex });
        frameIndex++;
    }
}
