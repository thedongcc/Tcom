/**
 * tokens/plugins/flag.ts
 * Flag Token 插件：固定 Hex 字节标志。
 */
import React from 'react';
import { TokenPlugin, CompileContext, ConfigFormProps } from '../core/types';
import { FlagConfig } from '../../types/token';
import { FlagConfigForm } from '../../components/serial/TokenConfigForms';
import { Flag } from 'lucide-react';

export const flagPlugin: TokenPlugin = {
    type: 'flag',
    label: '占位符',
    colorVar: '--st-token-flag',
    fallbackColor: '#c586c0',

    defaultConfig: (): FlagConfig => ({ hex: 'AA', name: '' }),

    getLabel(config: FlagConfig): string {
        const hex = config.hex || '';
        const display = hex.length > 20 ? hex.substring(0, 20) + '...' : hex;
        return config.name
            ? `${config.name}: ${display}`
            : (hex ? `Custom:${display}` : 'Custom');
    },

    compile(config: FlagConfig, ctx: CompileContext): void {
        const clean = (config.hex || '').replace(/[^0-9A-Fa-f]/g, '');
        const rawBytes = new Uint8Array(Math.floor(clean.length / 2));
        for (let i = 0; i < rawBytes.length; i++) {
            rawBytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
        }
        ctx.parts.push(rawBytes);
        ctx.currentTotalLength += rawBytes.length;
    },

    isDynamic: false,

    ConfigForm: FlagConfigForm as React.FC<ConfigFormProps>,

    toolbar: {
        shortLabel: 'Custom',
        tooltip: 'serial.insertFlag',
        icon: { kind: 'lucide', component: Flag, colorClass: 'text-blue-400' },
    },

    suggestions() {
        return [
            { title: 'Custom', config: { hex: 'AA55' }, icon: Flag },
        ];
    },
};
