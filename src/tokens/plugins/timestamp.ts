/**
 * tokens/plugins/timestamp.ts
 * Timestamp Token 插件：发送瞬间的 Unix 时间戳。
 */
import React from 'react';
import { TokenPlugin, CompileContext, ConfigFormProps, WorkerSlot } from '../core/types';
import { TimestampConfig } from '../../types/token';
import { TimestampConfigForm } from '../../components/serial/TokenConfigForms';
import { Clock } from 'lucide-react';

export const timestampPlugin: TokenPlugin = {
    type: 'timestamp',
    label: 'Time Token',
    colorVar: '--st-token-timestamp',
    fallbackColor: '#4fc1ff',

    defaultConfig: (): TimestampConfig => ({ format: 'seconds', byteOrder: 'big' }),

    getLabel(config: TimestampConfig): string {
        return config.format === 'milliseconds' ? 'Time:Unix_ms' : 'Time:Unix_s';
    },

    compile(config: TimestampConfig, ctx: CompileContext): void {
        const format = config.format || 'seconds';
        const byteOrder = config.byteOrder || 'big';

        let timestamp: bigint;
        let byteSize: number;
        if (format === 'milliseconds') {
            timestamp = BigInt(Date.now());
            byteSize = 8;
        } else {
            timestamp = BigInt(Math.floor(Date.now() / 1000));
            byteSize = 4;
        }

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

        ctx.parts.push(rawBytes);
        ctx.currentTotalLength += rawBytes.length;
    },

    isDynamic: true,

    getWorkerSlot(config: TimestampConfig, byteOffset: number): WorkerSlot {
        const format = config.format || 'seconds';
        const byteOrder = config.byteOrder || 'big';
        const byteSize = format === 'milliseconds' ? 8 : 4;
        return { byteOffset, byteSize, byteOrder, format };
    },

    ConfigForm: TimestampConfigForm as React.FC<ConfigFormProps>,

    toolbar: {
        shortLabel: 'Time',
        tooltip: 'serial.insertTime',
        icon: { kind: 'letter', letter: 'T', borderColorClass: 'border-blue-400', textColorClass: 'text-blue-400' },
    },

    suggestions() {
        return [
            { title: 'Timestamp (s)', config: { format: 'seconds' }, icon: Clock },
            { title: 'Timestamp (ms)', config: { format: 'milliseconds' }, icon: Clock },
        ];
    },
};
