/**
 * tokens/plugins/auto-inc.ts
 * AutoInc Token 插件：自动递增计数器。
 * 实现 createTimedState 供 useSerialInputLogic 在定时发送时追踪状态。
 */
import React from 'react';
import { TokenPlugin, CompileContext, ConfigFormProps, TokenTimedState } from '../core/types';
import { AutoIncConfig } from '../../types/token';
import { AutoIncConfigForm } from '../../components/serial/TokenConfigForms';
import { Settings } from 'lucide-react';

/** 将 hex 字符串按大端序解析为 bigint */
function hexToBigInt(hex: string, bytes: number): bigint {
    const padded = hex.replace(/\s/g, '').padStart(bytes * 2, '0');
    return BigInt('0x' + padded);
}

/** 将 bigint 写成指定字节数的大端 hex 字符串 */
function bigIntToHex(val: bigint, bytes: number): string {
    const mask = (BigInt(1) << BigInt(bytes * 8)) - BigInt(1);
    return (val & mask).toString(16).toUpperCase().padStart(bytes * 2, '0');
}

/** 将 hex 字符串按大端序写入 Uint8Array */
function hexToBytes(hex: string, bytes: number): Uint8Array {
    const padded = hex.replace(/\s/g, '').padStart(bytes * 2, '0');
    const raw = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) {
        raw[i] = parseInt(padded.substring(i * 2, i * 2 + 2), 16);
    }
    return raw;
}

export const autoIncPlugin: TokenPlugin = {
    type: 'auto_inc',
    label: '自增计数',
    colorVar: '--st-token-auto-inc',
    fallbackColor: '#c586c0',

    defaultConfig: (): AutoIncConfig => ({
        bytes: 1,
        defaultValue: '00',
        currentValue: '00',
        step: 1,
    }),

    isDynamic: true,

    getLabel(config: AutoIncConfig): string {
        const hex = config.currentValue || config.defaultValue || '00';
        const dec = parseInt(hex.replace(/\s/g, ''), 16);
        return `Auto:${dec}`;
    },

    compile(config: AutoIncConfig, ctx: CompileContext): void {
        const bytes = config.bytes || 1;
        const currentHex = config.currentValue || config.defaultValue || '00';
        const rawBytes = hexToBytes(currentHex, bytes);

        ctx.parts.push(rawBytes);
        ctx.currentTotalLength += rawBytes.length;

        // 原地更新 currentValue（compileSegments hot-path 依赖此行为）
        const val = hexToBigInt(currentHex, bytes);
        const next = val + BigInt(config.step || 0);
        (config as any).currentValue = bigIntToHex(next, bytes);
    },

    createTimedState(config: AutoIncConfig): TokenTimedState {
        const bytes = config.bytes || 1;
        const step = BigInt(config.step || 0);

        let batchStartHex = config.currentValue || config.defaultValue || '00';

        return {
            getCurrentValue(): string {
                return batchStartHex;
            },

            onFrameSent(): void {
                const val = hexToBigInt(batchStartHex, bytes);
                batchStartHex = bigIntToHex(val + step, bytes);
            },

            getBatchStartConfig(): any {
                return { currentValue: batchStartHex };
            },

            applyToConfig(cfg: any): void {
                cfg.currentValue = batchStartHex;
            },
        };
    },

    normalizeConfig(config: AutoIncConfig): AutoIncConfig {
        const auto = { ...config };
        let hex = auto.defaultValue.replace(/\s/g, '');
        const targetNibbles = auto.bytes * 2;
        if (hex.length < targetNibbles) {
            hex = hex.padStart(targetNibbles, '0');
        } else if (hex.length > targetNibbles) {
            hex = hex.substring(hex.length - targetNibbles);
        }
        auto.defaultValue = hex;
        auto.currentValue = hex;
        return auto;
    },

    onContextMenu(config: AutoIncConfig): AutoIncConfig {
        return { ...config, currentValue: config.defaultValue };
    },

    ConfigForm: AutoIncConfigForm as React.FC<ConfigFormProps>,

    toolbar: {
        shortLabel: 'Auto',
        tooltip: 'serial.insertAuto',
        icon: { kind: 'letter', letter: 'A', borderColorClass: 'border-purple-400', textColorClass: 'text-purple-400' },
    },

    suggestions() {
        return [
            { title: 'Auto', config: { bytes: 1, defaultValue: '00', currentValue: '00', step: 1 }, icon: Settings },
        ];
    },
};
