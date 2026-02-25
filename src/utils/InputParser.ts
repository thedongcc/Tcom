import { Segment, Token, CRCConfig, FlagConfig, AutoIncConfig } from '../types/token';
import { calculateCRC, sliceData } from './crc';

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
    // 这样，诸如 `EE 01 00 00 /crc` 才能用真实的 [0xEE, 0x01, 0x00, 0x00] 来计算 CRC (64 CC)。
    // 如果最终模式是 'text'，我们在把所有的真实字节拼装完之后，再整体转成纯文本的 ASCII Hex 字符串。

    const parts: Uint8Array[] = [];
    let currentTotalLength = 0;

    for (const segment of segments) {
        if (segment.type === 'text') {
            const text = segment.content as string;
            const bytes = parseHex(text);
            if (bytes.length > 0) {
                parts.push(bytes);
                currentTotalLength += bytes.length;
            }
        } else if (segment.type === 'token') {
            const tokenId = segment.id;
            const token = tokens[tokenId];
            if (!token) continue;

            if (token.type === 'crc') {
                const config = token.config as CRCConfig;

                // 展开当前缓冲区获取前方真实的 Payload 字节
                const currentBuf = new Uint8Array(currentTotalLength);
                let offset = 0;
                for (const p of parts) { currentBuf.set(p, offset); offset += p.length; }

                const offsetParam = config.endIndex || 0;
                let splitIdx = currentBuf.length;
                if (offsetParam < 0) splitIdx = Math.max(0, currentBuf.length + offsetParam);

                const head = currentBuf.slice(0, splitIdx);
                const tail = currentBuf.slice(splitIdx);

                // 在真实的 Bytes 上计算 CRC
                const dataToCheck = sliceData(head, config.startIndex || 0, 0);
                const rawCrc = calculateCRC(dataToCheck, config.algorithm);

                parts.length = 0;
                if (head.length > 0) parts.push(head);
                parts.push(rawCrc);
                if (tail.length > 0) parts.push(tail);
                currentTotalLength = head.length + rawCrc.length + tail.length;

            } else if (token.type === 'flag') {
                const config = token.config as FlagConfig;
                const rawBytes = parseHex(config.hex || '');
                parts.push(rawBytes);
                currentTotalLength += rawBytes.length;

            } else if (token.type === 'timestamp') {
                const tsConfig = token.config as any;
                const format = tsConfig.format || 'seconds';
                const byteOrder = tsConfig.byteOrder || 'big';

                let timestamp: bigint;
                let byteSize: number;
                if (format === 'milliseconds') { timestamp = BigInt(Date.now()); byteSize = 8; }
                else { timestamp = BigInt(Math.floor(Date.now() / 1000)); byteSize = 4; }

                const rawBytes = new Uint8Array(byteSize);
                if (byteOrder === 'big') {
                    for (let i = byteSize - 1; i >= 0; i--) {
                        rawBytes[byteSize - 1 - i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xFF));
                    }
                } else {
                    for (let i = 0; i < byteSize; i++) {
                        rawBytes[i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xFF));
                    }
                }

                parts.push(rawBytes);
                currentTotalLength += rawBytes.length;

            } else if (token.type === 'auto_inc') {
                const autoConfig = token.config as AutoIncConfig;
                const byteSize = autoConfig.bytes || 1;
                const currentValueHex = autoConfig.currentValue || autoConfig.defaultValue || '00';

                const rawBytes = new Uint8Array(byteSize);
                const cleanHex = currentValueHex.padStart(byteSize * 2, '0');
                for (let i = 0; i < byteSize; i++) {
                    rawBytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
                }

                parts.push(rawBytes);
                currentTotalLength += rawBytes.length;

                let val = BigInt(0);
                for (let i = 0; i < byteSize; i++) { val = (val << BigInt(8)) | BigInt(rawBytes[i]); }
                val += BigInt(autoConfig.step || 0);
                const mask = (BigInt(1) << BigInt(byteSize * 8)) - BigInt(1);
                val = val & mask;
                let nextHex = val.toString(16).toUpperCase().padStart(byteSize * 2, '0');
                autoConfig.currentValue = nextHex;
            }
        }
    }

    // 合并真正的二进制结果
    const rawResult = new Uint8Array(currentTotalLength);
    let offset = 0;
    for (const p of parts) { rawResult.set(p, offset); offset += p.length; }

    // 根据发送模式决定最终返回：如果是 HEX 模式发原字节；如果是 TEXT 模式，将所有字节转为可见的 ASCII Hex 字符串。
    if (mode === 'text') {
        return bytesToAsciiHex(rawResult);
    }

    return rawResult;
};
