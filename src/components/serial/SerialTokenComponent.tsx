import React from 'react';
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { GripVertical } from 'lucide-react';

// Define event for interaction
export const SERIAL_TOKEN_CLICK_EVENT = 'serial-token-click';

export const SerialTokenComponent: React.FC<NodeViewProps> = ({ node, getPos, selected }) => {
    const { id, type, config } = node.attrs;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement; // Use currentTarget to ensure we get the label/box, not inner content
        const rect = target.getBoundingClientRect();

        console.log('SerialToken Clicked (Component):', { id, type, config });

        // Dispatch custom event that SerialInput listens to
        // If it's Hex, we want to click the label.
        const event = new CustomEvent(SERIAL_TOKEN_CLICK_EVENT, {
            detail: { id, type, config, x: rect.left, y: rect.bottom, pos: getPos() }
        });
        window.dispatchEvent(event);
    };

    let label = 'Unknown';
    if (type === 'crc') {
        label = 'CRC';
        switch (config.algorithm) {
            case 'modbus-crc16': label = 'CRC: Modbus'; break;
            case 'ccitt-crc16': label = 'CRC: CCITT'; break;
            case 'crc32': label = 'CRC: 32'; break;
        }
    } else if (type === 'flag') {
        const hex = config.hex || '';
        const display = hex.length > 20 ? hex.substring(0, 20) + '...' : hex;
        // 使用英文冒号
        label = config.name ? `${config.name}: ${display}` : (hex ? `Flag:${display}` : 'Flag');
    } else if (type === 'timestamp') {
        // 显示时间戳 Token
        const byteOrder = config.byteOrder || 'big';
        const format = config.format || 'seconds'; // seconds or milliseconds
        label = format === 'milliseconds' ? `TS: ms (${byteOrder === 'big' ? 'BE' : 'LE'})` : `TS: s (${byteOrder === 'big' ? 'BE' : 'LE'})`;
    }

    return (
        <NodeViewWrapper as="span" className="inline select-none mx-[1px] align-baseline">
            <span
                onClick={handleClick}
                className={`
                    inline-block
                    rounded-[2px] text-[13px] font-[family-name:var(--font-mono)] font-normal leading-none
                    cursor-pointer transition-colors
                    ${selected ? 'ring-1 ring-[var(--vscode-focusBorder)]' : ''}
                    ${type === 'crc'
                        ? 'text-[#4ec9b0]'
                        : type === 'timestamp'
                            ? 'text-[#4fc1ff]'
                            : 'text-[#f48771]'
                    }
                `}
                title="Click to configure"
            >
                <span className="opacity-50 mr-[1px]">/</span>
                <span className={type === 'crc' ? 'font-medium' : ''}>
                    {type === 'crc' ? (config.algorithm === 'modbus-crc16' ? 'CRC16-Modbus' : config.algorithm === 'ccitt-crc16' ? 'CRC16-CCITT' : `CRC:${config.algorithm}`) :
                        type === 'timestamp' ? (config.format === 'milliseconds' ? 'Time:Unix_ms' : 'Time:Unix_s') :
                            label}
                </span>
            </span>
        </NodeViewWrapper>
    );
};
