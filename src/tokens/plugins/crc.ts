/**
 * tokens/plugins/crc.ts
 * CRC Token 插件：对前方字节执行 CRC 计算。
 */
import React from 'react';
import { TokenPlugin, CompileContext, ConfigFormProps } from '../core/types';
import { CRCConfig } from '../../types/token';
import { CRCConfigForm } from '../../components/serial/TokenConfigForms';
import { calculateCRC, sliceData } from '../../utils/crc';
import { Hash, Plus } from 'lucide-react';

export const crcPlugin: TokenPlugin = {
    type: 'crc',
    label: 'CRC Config',
    colorVar: '--st-token-crc',
    fallbackColor: '#4ec9b0',

    defaultConfig: (): CRCConfig => ({
        algorithm: 'modbus-crc16',
        startIndex: 0,
        endIndex: 0,
    }),

    getLabel(config: CRCConfig): string {
        if (config.algorithm === 'modbus-crc16') return 'CRC16-Modbus';
        if (config.algorithm === 'ccitt-crc16') return 'CRC16-CCITT';
        return `CRC:${config.algorithm}`;
    },

    compile(config: CRCConfig, ctx: CompileContext): void {
        const currentBuf = new Uint8Array(ctx.currentTotalLength);
        let offset = 0;
        for (const p of ctx.parts) { currentBuf.set(p, offset); offset += p.length; }

        const offsetParam = config.endIndex || 0;
        let splitIdx = currentBuf.length;
        if (offsetParam < 0) splitIdx = Math.max(0, currentBuf.length + offsetParam);

        const head = currentBuf.slice(0, splitIdx);
        const tail = currentBuf.slice(splitIdx);

        const dataToCheck = sliceData(head, config.startIndex || 0, 0);
        const rawCrc = calculateCRC(dataToCheck, config.algorithm);

        ctx.parts.length = 0;
        if (head.length > 0) ctx.parts.push(head);
        ctx.parts.push(rawCrc);
        if (tail.length > 0) ctx.parts.push(tail);
        ctx.currentTotalLength = head.length + rawCrc.length + tail.length;
    },

    isDynamic: false,
    isBold: true,

    ConfigForm: CRCConfigForm as React.FC<ConfigFormProps>,

    toolbar: {
        shortLabel: 'CRC',
        tooltip: 'serial.insertCRC',
        icon: { kind: 'lucide', component: Plus, colorClass: 'text-emerald-500' },
    },

    suggestions() {
        return [
            { title: 'CRC16-Modbus', config: { algorithm: 'modbus-crc16' }, icon: Hash },
            { title: 'CRC16-CCITT', config: { algorithm: 'ccitt-crc16' }, icon: Hash },
            { title: 'CRC32', config: { algorithm: 'crc32' }, icon: Hash },
        ];
    },
};
