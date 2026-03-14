/**
 * timedSendUtils.ts
 * 定时发送帧预计算和 Token 状态管理工具函数。
 * 从 useSerialInputLogic.ts 中拆分出来。
 */
import { Token, Segment } from '../../types/token';
import { tokenRegistry, TokenTimedState, WorkerSlot } from '../../tokens';
import { parseDOM, compileSegments } from '../../utils/InputParser';

/**
 * 从 HTML 内容解析 DOM segments 并预编码行尾符。
 */
export function prepareCachedData(
    html: string,
    mode: 'text' | 'hex',
    lineEnding: string,
): { segments: Segment[]; lineEndingBytes: Uint8Array | null } {
    const div = document.createElement('div');
    div.innerHTML = html;
    const segments = parseDOM(div);

    let lineEndingBytes: Uint8Array | null = null;
    if (mode === 'text' && lineEnding) {
        const realLE = lineEnding.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        lineEndingBytes = new TextEncoder().encode(realLE);
    }

    return { segments, lineEndingBytes };
}

/**
 * 分析 timestamp 插件的 Worker 实时填充槽位。
 */
export function analyzeTimestampSlots(
    segments: Segment[],
    tokens: Record<string, Token>,
): WorkerSlot[] {
    const slots: WorkerSlot[] = [];
    let byteOffset = 0;

    for (const segment of segments) {
        if (segment.type === 'text') {
            const clean = (segment.content as string).replace(/[^0-9A-Fa-f]/g, '');
            byteOffset += Math.floor(clean.length / 2);
        } else if (segment.type === 'token') {
            const token = tokens[segment.id];
            if (!token) continue;
            const plugin = tokenRegistry.get(token.type);
            if (!plugin) continue;

            if (plugin.getWorkerSlot) {
                const slot = plugin.getWorkerSlot(token.config, byteOffset);
                if (slot) slots.push(slot);
                byteOffset += slot?.byteSize ?? 0;
            } else {
                // 估算 Token 字节占用
                const tmpCtx = { parts: [] as Uint8Array[], currentTotalLength: 0 };
                const configCopy = JSON.parse(JSON.stringify(token.config));
                plugin.compile(configCopy, tmpCtx);
                byteOffset += tmpCtx.parts.reduce((s, p) => s + p.length, 0);
            }
        }
    }

    return slots;
}

/**
 * 创建有状态动态 Token 的追踪对象。
 */
export function createTimedStates(tokens: Record<string, Token>): Record<string, TokenTimedState> {
    const states: Record<string, TokenTimedState> = {};
    for (const id of Object.keys(tokens)) {
        const token = tokens[id];
        const plugin = tokenRegistry.get(token.type);
        if (plugin?.createTimedState) {
            states[id] = plugin.createTimedState(token.config);
        }
    }
    return states;
}

/**
 * 预计算 N 帧数据。
 */
export function computeFrames(
    count: number,
    segments: Segment[],
    mode: 'text' | 'hex',
    tokens: Record<string, Token>,
    timedStates: Record<string, TokenTimedState>,
    lineEndingBytes: Uint8Array | null,
): number[][] {
    // 重置状态 Token 到快照起点
    for (const [id, state] of Object.entries(timedStates)) {
        state.applyToConfig(tokens[id].config);
    }

    const frames: number[][] = [];
    for (let i = 0; i < count; i++) {
        let data = compileSegments(segments, mode, tokens);
        if (lineEndingBytes && data instanceof Uint8Array) {
            const merged = new Uint8Array(data.length + lineEndingBytes.length);
            merged.set(data);
            merged.set(lineEndingBytes, data.length);
            data = merged;
        }
        frames.push(Array.from(data instanceof Uint8Array ? data : new TextEncoder().encode(data)));
    }

    // 还原状态
    for (const [id, state] of Object.entries(timedStates)) {
        state.applyToConfig(tokens[id].config);
    }

    return frames;
}
