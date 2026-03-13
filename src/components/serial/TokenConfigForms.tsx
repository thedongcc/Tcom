/**
 * TokenConfigForms.tsx
 * Token 配置弹窗中各种 Token 类型的配置表单。
 * 从 TokenConfigPopover.tsx 的 renderContent() 拆分出来。
 */
import React from 'react';
import { CRCConfig, FlagConfig, HexConfig, AutoIncConfig, RandomBytesConfig } from '../../types/token';
import { CustomSelect } from '../common/CustomSelect';

// 通用输入框样式
const inputCls = "bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] text-[var(--input-foreground)]";
const labelCls = "text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider";
const hintCls = "text-[10px] text-[var(--activitybar-inactive-foreground)] leading-snug";

// ─── Flag 配置表单 ────────────────────────────────────────────────────
export const FlagConfigForm = ({
    config, setConfig, onKeyDown,
}: {
    config: FlagConfig;
    setConfig: (c: FlagConfig) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}) => (
    <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Name (Optional)</label>
            <input
                type="text"
                className={`${inputCls} placeholder-[var(--input-placeholder-color)]`}
                value={config.name || ''}
                placeholder="e.g. Frame Header"
                onChange={e => setConfig({ ...config, name: e.target.value })}
                onKeyDown={onKeyDown}
            />
        </div>
        <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Hex Content</label>
            <textarea
                className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] p-2 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] h-24 font-mono resize-none text-[var(--input-foreground)] placeholder-[var(--input-placeholder-color)] leading-relaxed"
                value={config.hex || ''}
                placeholder="AA BB CC"
                onChange={e => setConfig({ ...config, hex: e.target.value.replace(/[^0-9A-Fa-f\s]/g, '') })}
                onKeyDown={onKeyDown}
            />
            <p className={hintCls}>Enter hex bytes separated by space</p>
        </div>
    </div>
);

// ─── Hex 配置表单 ─────────────────────────────────────────────────────
export const HexConfigForm = ({
    config, setConfig, byteWidthInput, setByteWidthInput, onKeyDown,
}: {
    config: HexConfig;
    setConfig: (c: HexConfig) => void;
    byteWidthInput: string;
    setByteWidthInput: (v: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}) => (
    <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Byte Width</label>
            <input
                type="text"
                className={`${inputCls} w-16`}
                value={byteWidthInput}
                onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setByteWidthInput(val);
                    if (val !== '') {
                        setConfig({ ...config, byteWidth: Math.max(1, Math.min(8, parseInt(val) || 1)) });
                    }
                }}
                onBlur={() => {
                    const final = Math.max(1, Math.min(8, parseInt(byteWidthInput) || 1));
                    setByteWidthInput(final.toString());
                    setConfig({ ...config, byteWidth: final });
                }}
                onKeyDown={onKeyDown}
            />
            <p className={hintCls}>Target size in bytes (1-8)</p>
        </div>
    </div>
);

// ─── CRC 配置表单 ─────────────────────────────────────────────────────
export const CRCConfigForm = ({
    config, setConfig, startIndexInput, setStartIndexInput, endIndexInput, setEndIndexInput, onKeyDown,
}: {
    config: CRCConfig;
    setConfig: (c: CRCConfig) => void;
    startIndexInput: string;
    setStartIndexInput: (v: string) => void;
    endIndexInput: string;
    setEndIndexInput: (v: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}) => {
    const algoItems = [
        { label: 'Modbus CRC16 (LE)', value: 'modbus-crc16' },
        { label: 'CCITT CRC116 (BE)', value: 'ccitt-crc16' },
        { label: 'CRC32', value: 'crc32' },
    ];
    const endItems = [
        { label: '末尾 (End)', value: '0' },
        { label: '-1 (Last)', value: '-1' },
        { label: '-2', value: '-2' },
        { label: '-3', value: '-3' },
    ];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Algorithm</label>
                <CustomSelect
                    items={algoItems}
                    value={config.algorithm}
                    onChange={(val) => setConfig({ ...config, algorithm: val as any })}
                />
            </div>

            <div className="flex items-center gap-2 my-1">
                <span className="text-[10px] font-bold text-[var(--input-placeholder-color)] uppercase tracking-[0.1em] whitespace-nowrap">Range Settings</span>
                <div className="h-[1px] bg-[var(--border-color)] flex-1 mt-0.5" />
            </div>

            <div className="flex gap-4">
                <div className="flex flex-col gap-1.5 flex-none w-20">
                    <label className={labelCls}>Start</label>
                    <input
                        type="text"
                        className={inputCls}
                        value={startIndexInput}
                        onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setStartIndexInput(val);
                            if (val !== '') {
                                setConfig({ ...config, startIndex: parseInt(val) || 0 });
                            }
                        }}
                        onBlur={() => {
                            const final = parseInt(startIndexInput) || 0;
                            setStartIndexInput(final.toString());
                            setConfig({ ...config, startIndex: final });
                        }}
                        onKeyDown={onKeyDown}
                    />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                    <label className={labelCls}>End</label>
                    <CustomSelect
                        items={endItems}
                        value={(config.endIndex ?? 0).toString()}
                        onChange={(val) => {
                            setEndIndexInput(val);
                            setConfig({ ...config, endIndex: parseInt(val) });
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

// ─── Timestamp 配置表单 ───────────────────────────────────────────────
export const TimestampConfigForm = ({
    config, setConfig,
}: {
    config: any;
    setConfig: (c: any) => void;
}) => {
    const formatItems = [
        { label: 'Seconds (4-byte)', value: 'seconds' },
        { label: 'Milliseconds (8-byte)', value: 'milliseconds' },
    ];
    const orderItems = [
        { label: 'Big Endian (BE)', value: 'big' },
        { label: 'Little Endian (LE)', value: 'little' },
    ];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Format</label>
                <CustomSelect
                    items={formatItems}
                    value={config.format || 'seconds'}
                    onChange={(val) => setConfig({ ...config, format: val })}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Byte Order</label>
                <CustomSelect
                    items={orderItems}
                    value={config.byteOrder || 'big'}
                    onChange={(val) => setConfig({ ...config, byteOrder: val })}
                />
            </div>
        </div>
    );
};

// ─── AutoInc 配置表单 ─────────────────────────────────────────────────
export const AutoIncConfigForm = ({
    config, setConfig, bytesInput, setBytesInput, stepInput, setStepInput, onKeyDown,
}: {
    config: AutoIncConfig;
    setConfig: (c: AutoIncConfig) => void;
    bytesInput: string;
    setBytesInput: (v: string) => void;
    stepInput: string;
    setStepInput: (v: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}) => (
    <div className="flex flex-col gap-4">
        <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-none w-16">
                <label className={labelCls}>Bytes</label>
                <input
                    type="text"
                    className={inputCls}
                    value={bytesInput}
                    onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        setBytesInput(val);
                        if (val !== '') {
                            const bytes = Math.max(1, Math.min(8, parseInt(val) || 1));
                            setConfig({ ...config, bytes });
                        }
                    }}
                    onBlur={() => {
                        const bytes = Math.max(1, Math.min(8, parseInt(bytesInput) || 1));
                        setBytesInput(bytes.toString());
                        setConfig({ ...config, bytes });
                    }}
                    onKeyDown={onKeyDown}
                />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
                <label className={labelCls}>Initial Val (Hex)</label>
                <input
                    type="text"
                    className={`${inputCls} font-mono placeholder-[var(--input-placeholder-color)]`}
                    value={config.defaultValue || ''}
                    placeholder="00 00 05"
                    onChange={e => {
                        const val = e.target.value.replace(/[^0-9A-Fa-f\s]/g, '');
                        setConfig({ ...config, defaultValue: val });
                    }}
                    onKeyDown={onKeyDown}
                />
            </div>
        </div>
        <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Step (Offset)</label>
            <input
                type="text"
                className={inputCls}
                value={stepInput}
                onChange={e => {
                    const val = e.target.value;
                    if (val === '' || val === '-' || !isNaN(Number(val))) {
                        setStepInput(val);
                        const parsed = parseInt(val);
                        if (!isNaN(parsed)) {
                            setConfig({ ...config, step: parsed });
                        }
                    }
                }}
                onBlur={() => {
                    const parsed = parseInt(stepInput);
                    const finalStep = isNaN(parsed) ? 0 : parsed;
                    setStepInput(finalStep.toString());
                    setConfig({ ...config, step: finalStep });
                }}
                onKeyDown={onKeyDown}
            />
            <p className={hintCls}>Added after each send (can be negative)</p>
        </div>
    </div>
);

// ─── RandomBytes 配置表单 ──────────────────────────────────────────────
export const RandomBytesConfigForm = ({
    config, setConfig, onKeyDown,
}: {
    config: RandomBytesConfig;
    setConfig: (c: RandomBytesConfig) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}) => {
    const bytesItems = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ label: `${n} Byte${n > 1 ? 's' : ''}`, value: n.toString() }));

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Byte Count</label>
                <CustomSelect
                    items={bytesItems}
                    value={(config.bytes || 1).toString()}
                    onChange={(val) => setConfig({ ...config, bytes: parseInt(val) || 1 })}
                />
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col gap-1.5 flex-1">
                    <label className={labelCls}>Min (0-255)</label>
                    <input
                        type="text"
                        className={inputCls}
                        value={config.min ?? 0}
                        onChange={e => {
                            const v = Math.max(0, Math.min(255, parseInt(e.target.value.replace(/\D/g, '') || '0')));
                            setConfig({ ...config, min: v });
                        }}
                        onKeyDown={onKeyDown}
                    />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                    <label className={labelCls}>Max (0-255)</label>
                    <input
                        type="text"
                        className={inputCls}
                        value={config.max ?? 255}
                        onChange={e => {
                            const v = Math.max(0, Math.min(255, parseInt(e.target.value.replace(/\D/g, '') || '255')));
                            setConfig({ ...config, max: v });
                        }}
                        onKeyDown={onKeyDown}
                    />
                </div>
            </div>
            <p className={hintCls}>Each byte is independently randomized within [Min, Max] per send</p>
        </div>
    );
};
