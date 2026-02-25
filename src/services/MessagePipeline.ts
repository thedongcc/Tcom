import { Token } from '../types/token';
import { parseDOM, compileSegments, parseHex } from '../utils/InputParser';

export interface ProcessedMessage {
    data: string | Uint8Array;
    mode: 'text' | 'hex';
}

export const MessagePipeline = {
    /**
     * Process visual content (HTML/Text) into sendable data
     */
    process: (
        content: string, // Text content or HTML depending on parsing needs (usually DOM node is passed to parseDOM, here we might need to change approach if we want pure service)
        // Wait, parseDOM needs a Node. SerialInput passes inputRef.current. CommandList passes a created div.
        // Let's accept HTML string and create a temp div if needed, for consistency.
        html: string | null,
        mode: 'text' | 'hex',
        tokens: Record<string, Token>,
        lineEnding: string = ''
    ): ProcessedMessage => {

        let data: Uint8Array | string = content;

        if (html && tokens && Object.keys(tokens).length > 0) {
            // Rich Text Mode (CRC, Flags, Hex)
            console.log('MessagePipeline: Processing with tokens', { html, tokensCount: Object.keys(tokens).length, tokens });
            const div = document.createElement('div');
            div.innerHTML = html;
            console.log('MessagePipeline: Created div innerHTML', div.innerHTML);
            const segments = parseDOM(div);
            console.log('MessagePipeline: Parsed segments', segments);
            data = compileSegments(segments, mode, tokens);
            console.log('MessagePipeline: Compiled data', { length: data.length, data });
        } else if (mode === 'hex') {
            // Plain Hex
            data = parseHex(content);
        } else {
            // Plain Text
            data = content;
        }

        // Apply Line Ending (Only for Text mode usually, but if tokens produce binary, we might still want it if user forces it??)
        // Logic from SerialInput: "shouldAddLineEnding = mode === 'text' && lineEnding"
        // But wait, if I have CRC tokens, Mode is technically hex-ish (Uint8Array output). 
        // SerialInput logic: if compiled data is Uint8Array, we append generic bytes.

        if (mode === 'text' && lineEnding) {
            // 解析真实的转义字符 (将字符串 '\\n' 转换为真正的换行符 '\n' 以便编码为 0x0A)
            const realLineEnding = lineEnding
                .replace(/\\r/g, '\r')
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t');

            if (typeof data === 'string') {
                data += realLineEnding;
            } else if (data instanceof Uint8Array) {
                const encoder = new TextEncoder();
                const leBytes = encoder.encode(realLineEnding);
                const newData = new Uint8Array(data.length + leBytes.length);
                newData.set(data);
                newData.set(leBytes, data.length);
                data = newData;
            }
        }

        return { data, mode };
    }
};
