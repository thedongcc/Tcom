/**
 * InputParser.ts
 * 解析编辑器 DOM 为 Segment 列表，并将 Segment 列表编译为字节数组。
 * compileSegments 通过 tokenRegistry 驱动，无需在此处添加任何 if-else Token 类型分支。
 */
import { Segment, Token } from '../types/token';
import { CompileContext } from '../tokens/core/types';
import { tokenRegistry } from '../tokens';

// 确保所有插件已注册（通过 import tokens/index.ts 的副作用触发注册）

export const parseDOM = (root: HTMLElement): Segment[] => {
    const segments: Segment[] = [];

    const traverse = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (text) {
                if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
                    segments[segments.length - 1].content += text;
                } else {
                    segments.push({ id: `text-${Date.now()}-${Math.random()}`, type: 'text', content: text });
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.hasAttribute('data-token-id')) {
                const id = el.getAttribute('data-token-id')!;
                segments.push({ id, type: 'token', content: { id } as any });
            } else {
                el.childNodes.forEach(traverse);
            }
        }
    };

    root.childNodes.forEach(traverse);
    return segments;
};

export const parseHex = (text: string): Uint8Array => {
    const clean = text.replace(/[^0-9A-Fa-f]/g, '');
    const bytes = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < clean.length - 1; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
};

/**
 * TXT 模式下将二进制字节转为 ASCII hex 字符串字节
 * 例如 [0x64, 0xCC] → "64 CC" → [0x36, 0x34, 0x20, 0x43, 0x43]
 */
const bytesToAsciiHex = (bytes: Uint8Array): Uint8Array => {
    const hexStr = Array.from(bytes)
        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
    return new TextEncoder().encode(hexStr);
};

export const compileSegments = (
    segments: Segment[],
    mode: 'text' | 'hex',
    tokens: Record<string, Token>
): Uint8Array => {
    // 无论是 text 还是 hex 模式，首先都把内容当做真实的 Hex payload 来收集原始字节。
    // 如果最终模式是 'text'，在拼装完之后再整体转成纯文本的 ASCII Hex 字符串。

    // 使用共享的可变 context 对象，保证 CRC 等插件对 parts 的重建操作有效
    const ctx: CompileContext = {
        parts: [],
        currentTotalLength: 0,
    };

    for (const segment of segments) {
        if (segment.type === 'text') {
            const text = segment.content as string;
            const bytes = parseHex(text);
            if (bytes.length > 0) {
                ctx.parts.push(bytes);
                ctx.currentTotalLength += bytes.length;
            }
        } else if (segment.type === 'token') {
            const token = tokens[segment.id];
            if (!token) continue;

            const plugin = tokenRegistry.get(token.type);
            if (!plugin) continue;

            // 通过插件接口编译，plugin.compile 直接操作 ctx（引用传递）
            plugin.compile(token.config, ctx);
            // compile 后重新同步 currentTotalLength（CRC 会重建 parts）
            ctx.currentTotalLength = ctx.parts.reduce((sum, p) => sum + p.length, 0);
        }
    }

    // 合并真正的二进制结果
    const rawResult = new Uint8Array(ctx.currentTotalLength);
    let offset = 0;
    for (const p of ctx.parts) { rawResult.set(p, offset); offset += p.length; }

    // 根据发送模式决定最终返回
    if (mode === 'text') {
        return bytesToAsciiHex(rawResult);
    }

    return rawResult;
};
