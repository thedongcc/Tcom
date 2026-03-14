/**
 * commandPreview.ts
 * 命令预览工具 — 解析 HTML 富文本命令内容，生成包含 Token 标签的可读预览字符串。
 * 从 CommandItemComponent.tsx 中拆分出来。
 */

/**
 * 将命令的 HTML 内容解析为可读预览字符串。
 * 处理 Token 占位符（CRC、Flag、Timestamp、AutoInc 等）的可读标签生成。
 */
export function buildCommandPreview(item: { html?: string; payload?: string }): string {
    if (!item.html) return item.payload || '';
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(item.html, 'text/html');
        let result = '';

        // 递归处理 DOM 节点
        const process = (el: Element) => {
            el.childNodes.forEach((child: any) => {
                if (child.nodeType === Node.TEXT_NODE) {
                    result += child.textContent;
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const tokenType = child.getAttribute?.('data-token-type');
                    if (tokenType) {
                        result += buildTokenLabel(tokenType, child.getAttribute('data-token-config'));
                    } else {
                        process(child);
                    }
                }
            });
        };

        doc.body.childNodes.forEach((node: any) => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                process(node);
            }
        });

        return result.trim() || item.payload || '';
    } catch {
        return item.payload || '';
    }
}

/**
 * 根据 Token 类型和配置生成可读标签
 */
function buildTokenLabel(tokenType: string, configAttr: string | null): string {
    try {
        const cfg = configAttr ? JSON.parse(decodeURIComponent(configAttr)) : {};
        switch (tokenType) {
            case 'crc':
                return cfg.algorithm === 'modbus-crc16' ? '[CRC16-Modbus]'
                    : cfg.algorithm === 'ccitt-crc16' ? '[CRC16-CCITT]'
                        : `[CRC:${cfg.algorithm || ''}]`;
            case 'flag': {
                const hex = cfg.hex || '';
                return cfg.name ? `[${cfg.name}:${hex}]` : `[Custom:${hex}]`;
            }
            case 'timestamp':
                return cfg.format === 'milliseconds' ? '[Time:ms]' : '[Time:s]';
            case 'auto_inc':
                return `[Auto:${cfg.defaultValue || '00'}]`;
            default:
                return `[${tokenType}]`;
        }
    } catch {
        return `[${tokenType}]`;
    }
}
