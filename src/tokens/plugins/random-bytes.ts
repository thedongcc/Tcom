/**
 * tokens/plugins/random-bytes.ts
 * RandomBytes Token 插件：每次发送生成随机字节。
 */
import React from 'react';
import { TokenPlugin, CompileContext, ConfigFormProps } from '../core/types';
import { RandomBytesConfig } from '../../types/token';
import { RandomBytesConfigForm } from '../../components/serial/TokenConfigForms';
import { Shuffle } from 'lucide-react';

export const randomBytesPlugin: TokenPlugin = {
    type: 'random_bytes',
    label: '随机字节',
    colorVar: '--st-token-random',
    fallbackColor: '#ce9178',

    defaultConfig: (): RandomBytesConfig => ({
        bytes: 1,
        min: 0x00,
        max: 0xFF,
    }),

    getLabel(config: RandomBytesConfig): string {
        const bytes = config.bytes || 1;
        return `Rand:${bytes}B`;
    },

    compile(config: RandomBytesConfig, ctx: CompileContext): void {
        const bytes = config.bytes || 1;
        const maxPossible = bytes >= 7 ? Number.MAX_SAFE_INTEGER : Math.pow(256, bytes) - 1;
        const min = config.min ?? 0;
        const max = config.max ?? maxPossible;
        // 整体数值随机后拆分为大端序字节
        const value = Math.floor(Math.random() * (max - min + 1)) + min;
        const rawBytes = new Uint8Array(bytes);
        let remaining = value;
        for (let i = bytes - 1; i >= 0; i--) {
            rawBytes[i] = remaining & 0xFF;
            remaining = Math.floor(remaining / 256);
        }

        ctx.parts.push(rawBytes);
        ctx.currentTotalLength += rawBytes.length;
    },

    isDynamic: true,

    ConfigForm: RandomBytesConfigForm as React.FC<ConfigFormProps>,

    toolbar: {
        shortLabel: 'Rand',
        tooltip: 'Insert Random Bytes',
        icon: { kind: 'letter', letter: 'R', borderColorClass: 'border-orange-400', textColorClass: 'text-orange-400' },
    },

    suggestions() {
        return [
            { title: 'Random Bytes', config: { bytes: 1, min: 0, max: 255 }, icon: Shuffle },
        ];
    },
};
