/**
 * TokenConfigForms.tsx
 * Token 配置弹窗中各种 Token 类型的配置表单。
 * 从 TokenConfigPopover.tsx 的 renderContent() 拆分出来。
 */
import React from 'react';
import { CRCConfig, FlagConfig, HexConfig, AutoIncConfig, RandomBytesConfig } from '../../types/token';
import { CustomSelect } from '../common/CustomSelect';
import { useI18n } from '../../context/I18nContext';

// 通用输入框样式
const inputCls = "bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] text-[var(--input-foreground)]";
const labelCls = "text-[11px] font-medium text-[var(--input-placeholder-color)]";
const hintCls = "text-[10px] text-[var(--activitybar-inactive-foreground)] leading-snug";

// 通用 Hex/Dec 切换按钮
const HexDecToggle = ({ mode, onChange }: { mode: 'hex' | 'dec'; onChange: (m: 'hex' | 'dec') => void }) => (
    <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--input-border-color)' }}>
        {(['hex', 'dec'] as const).map(m => (
            <button
                key={m}
                type="button"
                className="px-1.5 py-0.5 text-[9px] font-bold uppercase transition-colors cursor-pointer"
                style={{
                    backgroundColor: mode === m ? 'var(--accent-color, #007acc)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--input-placeholder-color)',
                }}
                onClick={() => onChange(m)}
            >
                {m}
            </button>
        ))}
    </div>
);

// 带内嵌前缀的输入框（前缀不占额外宽度，flex 对齐）
const PrefixInput = ({ prefix, value, onChange, onBlur, onKeyDown, placeholder, onPrefixClick }: {
    prefix: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
    onPrefixClick?: () => void;
}) => (
    <div className="flex items-baseline bg-[var(--input-background)] border border-[var(--input-border-color)] rounded-[4px] h-7 focus-within:border-[var(--focus-border-color)]">
        <span
            className={`shrink-0 pl-2 text-[12px] font-mono text-[var(--input-placeholder-color)] select-none leading-[28px] ${onPrefixClick ? 'cursor-pointer' : ''}`}
            style={{ opacity: 0.6 }}
            onClick={onPrefixClick}
        >
            {prefix}
        </span>
        <input
            type="text"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12px] font-mono text-[var(--input-foreground)] leading-[28px] px-1"
            value={value}
            placeholder={placeholder || '00'}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
        />
    </div>
);

// ─── 占位符配置表单 ──────────────────────────────────────────────────
export const FlagConfigForm = ({
    config, setConfig, onKeyDown,
}: {
    config: FlagConfig;
    setConfig: (c: FlagConfig) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}) => {
    const { t } = useI18n();
    const [mode, setMode] = React.useState<'hex' | 'dec'>('hex');
    const decDisplay = React.useMemo(() => {
        if (!config.hex) return '';
        return config.hex.trim().split(/\s+/).filter(Boolean).map(h => parseInt(h, 16)).join(' ');
    }, [config.hex]);
    const [decInput, setDecInput] = React.useState(decDisplay);

    React.useEffect(() => { setDecInput(decDisplay); }, [decDisplay]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t('tokenConfig.nameLabel')}</label>
                <input
                    type="text"
                    className={`${inputCls} placeholder-[var(--input-placeholder-color)]`}
                    value={config.name || ''}
                    placeholder={t('tokenConfig.namePlaceholder')}
                    onChange={e => setConfig({ ...config, name: e.target.value })}
                    onKeyDown={onKeyDown}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className={labelCls}>{t('tokenConfig.content')}</label>
                    <HexDecToggle mode={mode} onChange={setMode} />
                </div>
                {mode === 'hex' ? (
                    <textarea
                        className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] p-2 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] h-24 font-mono resize-none text-[var(--input-foreground)] placeholder-[var(--input-placeholder-color)] leading-relaxed"
                        value={config.hex || ''}
                        placeholder="0xAA 0xBB 0xCC"
                        onChange={e => setConfig({ ...config, hex: e.target.value.replace(/[^0-9A-Fa-f\s]/g, '') })}
                        onKeyDown={onKeyDown}
                    />
                ) : (
                    <textarea
                        className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] p-2 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] h-24 font-mono resize-none text-[var(--input-foreground)] placeholder-[var(--input-placeholder-color)] leading-relaxed"
                        value={decInput}
                        placeholder="170 187 204"
                        onChange={e => {
                            const val = e.target.value.replace(/[^0-9\s]/g, '');
                            setDecInput(val);
                            const hex = val.trim().split(/\s+/).filter(Boolean)
                                .map(d => Math.min(255, parseInt(d) || 0).toString(16).toUpperCase().padStart(2, '0'))
                                .join(' ');
                            setConfig({ ...config, hex });
                        }}
                        onKeyDown={onKeyDown}
                    />
                )}
                <p className={hintCls}>{mode === 'hex' ? t('tokenConfig.hexHint') : t('tokenConfig.decHint')}</p>
            </div>
        </div>
    );
};

// ─── Hex 配置表单 ─────────────────────────────────────────────────────
export const HexConfigForm = ({
    config, setConfig, onKeyDown,
}: {
    config: HexConfig;
    setConfig: (c: HexConfig) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}) => {
    const { t } = useI18n();
    const [byteWidthInput, setByteWidthInput] = React.useState((config.byteWidth ?? 1).toString());

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t('tokenConfig.byteWidth')}</label>
                <input
                    type="text"
                    className={`${inputCls} w-24`}
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
                <p className={hintCls}>{t('tokenConfig.byteWidthHint')}</p>
            </div>
        </div>
    );
};

// ─── CRC 配置表单 ─────────────────────────────────────────────────────
export const CRCConfigForm = ({
    config, setConfig, onKeyDown,
}: {
    config: CRCConfig;
    setConfig: (c: CRCConfig) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}) => {
    const { t } = useI18n();
    const [startIndexInput, setStartIndexInput] = React.useState((config.startIndex ?? 0).toString());

    const algoItems = [
        { label: t('tokenConfig.modbusCrc16'), value: 'modbus-crc16' },
        { label: t('tokenConfig.ccittCrc16'), value: 'ccitt-crc16' },
        { label: 'CRC32', value: 'crc32' },
    ];
    const endItems = [
        { label: t('tokenConfig.endTail'), value: '0' },
        { label: t('tokenConfig.endMinus1'), value: '-1' },
        { label: t('tokenConfig.endMinus2'), value: '-2' },
        { label: t('tokenConfig.endMinus3'), value: '-3' },
    ];

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t('tokenConfig.algorithm')}</label>
                <CustomSelect
                    items={algoItems}
                    value={config.algorithm}
                    onChange={(val) => setConfig({ ...config, algorithm: val as CRCConfig['algorithm'] })}
                />
            </div>

            <div className="flex items-center gap-2 my-1">
                <span className="text-[10px] font-bold text-[var(--input-placeholder-color)] tracking-[0.1em] whitespace-nowrap">{t('tokenConfig.rangeSettings')}</span>
                <div className="h-[1px] bg-[var(--border-color)] flex-1 mt-0.5" />
            </div>

            <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-none w-20">
                    <label className={labelCls}>{t('tokenConfig.start')}</label>
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
                    <label className={labelCls}>{t('tokenConfig.end')}</label>
                    <CustomSelect
                        items={endItems}
                        value={(config.endIndex ?? 0).toString()}
                        onChange={(val) => {
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
    const { t } = useI18n();
    const formatItems = [
        { label: t('tokenConfig.seconds4B'), value: 'seconds' },
        { label: t('tokenConfig.milliseconds8B'), value: 'milliseconds' },
    ];
    const orderItems = [
        { label: t('tokenConfig.bigEndian'), value: 'big' },
        { label: t('tokenConfig.littleEndian'), value: 'little' },
    ];

    // 实时时间预览
    const [now, setNow] = React.useState(Date.now());
    const [previewMode, setPreviewMode] = React.useState<'hex' | 'dec'>('dec');
    React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(timer);
    }, []);

    const isMs = config.format === 'milliseconds';
    const isBE = (config.byteOrder || 'big') === 'big';
    const tsValue = isMs ? now : Math.floor(now / 1000);
    const byteCount = isMs ? 8 : 4;

    // 生成字节数组
    const tsBytes = React.useMemo(() => {
        const bytes: number[] = [];
        let v = tsValue;
        for (let i = 0; i < byteCount; i++) {
            bytes.unshift(v & 0xFF);
            v = Math.floor(v / 256);
        }
        return isBE ? bytes : bytes.reverse();
    }, [tsValue, byteCount, isBE]);

    const previewText = previewMode === 'hex'
        ? tsBytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
        : tsBytes.map(b => b.toString()).join(' ');

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t('tokenConfig.format')}</label>
                <CustomSelect
                    items={formatItems}
                    value={config.format || 'seconds'}
                    onChange={(val) => setConfig({ ...config, format: val })}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t('tokenConfig.byteOrder')}</label>
                <CustomSelect
                    items={orderItems}
                    value={config.byteOrder || 'big'}
                    onChange={(val) => setConfig({ ...config, byteOrder: val })}
                />
            </div>
            {/* 实时预览 */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className={labelCls}>{t('tokenConfig.livePreview')}</label>
                    <HexDecToggle mode={previewMode} onChange={setPreviewMode} />
                </div>
                <div
                    className="text-[11px] font-mono px-2 py-1.5 rounded-[4px] select-all break-all leading-relaxed"
                    style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--input-border-color)', color: 'var(--input-foreground)', opacity: 0.9 }}
                >
                    {previewText}
                </div>
                <p className={hintCls}>{t('tokenConfig.valueLabel')}: {previewMode === 'hex' ? '0x' + tsValue.toString(16).toUpperCase() : tsValue.toLocaleString()}</p>
            </div>
        </div>
    );
};

// ─── AutoInc 配置表单 ─────────────────────────────────────────────────
export const AutoIncConfigForm = ({
    config, setConfig, onKeyDown,
}: {
    config: AutoIncConfig;
    setConfig: (c: AutoIncConfig) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}) => {
    const { t } = useI18n();
    const [initMode, setInitMode] = React.useState<'hex' | 'dec'>('dec');
    const [stepMode, setStepMode] = React.useState<'hex' | 'dec'>('dec');
    const bytesItems = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ label: `${n} Byte${n > 1 ? 's' : ''}`, value: n.toString() }));

    const hexVal = (config.defaultValue || '00').replace(/\s/g, '');
    const decVal = parseInt(hexVal, 16) || 0;
    const [hexInput, setHexInput] = React.useState(hexVal.toUpperCase());
    const [decInput, setDecInput] = React.useState(decVal.toString());

    const stepVal = config.step ?? 1;
    const [stepDec, setStepDec] = React.useState(stepVal.toString());
    const [stepHex, setStepHex] = React.useState(Math.abs(stepVal).toString(16).toUpperCase());
    const [stepSign, setStepSign] = React.useState(stepVal < 0 ? '-' : '');

    const decToHex = (dec: number, bytes: number) =>
        Math.max(0, dec).toString(16).toUpperCase().padStart(bytes * 2, '0');

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t('tokenConfig.byteCount')}</label>
                <CustomSelect
                    items={bytesItems}
                    value={(config.bytes || 1).toString()}
                    onChange={(val) => setConfig({ ...config, bytes: parseInt(val) || 1 })}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className={labelCls}>{t('tokenConfig.initialValue')}</label>
                    <HexDecToggle mode={initMode} onChange={(m) => {
                        setInitMode(m);
                        const h = (config.defaultValue || '00').replace(/\s/g, '');
                        setHexInput(h.toUpperCase());
                        setDecInput((parseInt(h, 16) || 0).toString());
                    }} />
                </div>
                {initMode === 'hex' ? (
                    <PrefixInput
                        prefix="0x"
                        value={hexInput}
                        placeholder="00"
                        onChange={e => {
                            const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                            setHexInput(val);
                            if (val) {
                                const padded = val.padStart((config.bytes || 1) * 2, '0');
                                setConfig({ ...config, defaultValue: padded, currentValue: padded });
                            }
                        }}
                        onBlur={() => {
                            const padded = (hexInput || '00').padStart((config.bytes || 1) * 2, '0');
                            setHexInput(padded);
                            setConfig({ ...config, defaultValue: padded, currentValue: padded });
                        }}
                        onKeyDown={onKeyDown}
                    />
                ) : (
                    <input
                        type="text"
                        className={inputCls}
                        value={decInput}
                        placeholder="0"
                        onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setDecInput(val);
                            if (val !== '') {
                                const hex = decToHex(parseInt(val) || 0, config.bytes || 1);
                                setHexInput(hex);
                                setConfig({ ...config, defaultValue: hex, currentValue: hex });
                            }
                        }}
                        onBlur={() => {
                            const dec = parseInt(decInput) || 0;
                            setDecInput(dec.toString());
                            const hex = decToHex(dec, config.bytes || 1);
                            setHexInput(hex);
                            setConfig({ ...config, defaultValue: hex, currentValue: hex });
                        }}
                        onKeyDown={onKeyDown}
                    />
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className={labelCls}>{t('tokenConfig.stepOffset')}</label>
                    <HexDecToggle mode={stepMode} onChange={(m) => {
                        setStepMode(m);
                        const s = config.step ?? 1;
                        setStepDec(s.toString());
                        setStepSign(s < 0 ? '-' : '');
                        setStepHex(Math.abs(s).toString(16).toUpperCase());
                    }} />
                </div>
                <div className="flex items-baseline gap-1">
                    <button
                        type="button"
                        className="shrink-0 text-[16px] font-bold h-7 w-7 rounded-[4px] cursor-pointer transition-colors flex items-center justify-center"
                        style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--input-border-color)', color: 'var(--input-foreground)' }}
                        onClick={() => {
                            const newSign = stepSign === '-' ? '' : '-';
                            setStepSign(newSign);
                            const abs = stepMode === 'hex' ? (parseInt(stepHex, 16) || 0) : Math.abs(parseInt(stepDec) || 0);
                            const final = newSign === '-' ? -abs : abs;
                            setStepDec(final.toString());
                            setStepHex(abs.toString(16).toUpperCase());
                            setConfig({ ...config, step: final });
                        }}
                    >
                        {stepSign || '+'}
                    </button>
                    <div className="flex-1 min-w-0">
                        {stepMode === 'hex' ? (
                            <PrefixInput
                                prefix="0x"
                                value={stepHex}
                                placeholder="01"
                                onChange={e => {
                                    const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                                    setStepHex(val);
                                    const abs = parseInt(val, 16) || 0;
                                    const final = stepSign === '-' ? -abs : abs;
                                    setStepDec(final.toString());
                                    setConfig({ ...config, step: final });
                                }}
                                onKeyDown={onKeyDown}
                            />
                        ) : (
                            <input
                                type="text"
                                className={`${inputCls} w-full`}
                                value={Math.abs(parseInt(stepDec) || 0).toString()}
                                placeholder="1"
                                onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    const abs = parseInt(val) || 0;
                                    const final = stepSign === '-' ? -abs : abs;
                                    setStepDec(final.toString());
                                    setStepHex(abs.toString(16).toUpperCase());
                                    setConfig({ ...config, step: final });
                                }}
                                onKeyDown={onKeyDown}
                            />
                        )}
                    </div>
                </div>
                <p className={hintCls}>{t('tokenConfig.stepHint')}</p>
            </div>
            <p className={hintCls} style={{ opacity: 0.7 }}>{t('tokenConfig.resetHint')}</p>
        </div>
    );
};

// ─── RandomBytes 配置表单 ──────────────────────────────────────────────
export const RandomBytesConfigForm = ({
    config, setConfig, onKeyDown,
}: {
    config: RandomBytesConfig;
    setConfig: (c: RandomBytesConfig) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}) => {
    const { t } = useI18n();
    const bytesItems = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ label: `${n} Byte${n > 1 ? 's' : ''}`, value: n.toString() }));
    const bytes = config.bytes || 1;
    const maxPossible = bytes >= 7 ? Number.MAX_SAFE_INTEGER : Math.pow(256, bytes) - 1;
    const [minMode, setMinMode] = React.useState<'hex' | 'dec'>('dec');
    const [maxMode, setMaxMode] = React.useState<'hex' | 'dec'>('dec');

    const minVal = config.min ?? 0;
    const maxVal = config.max ?? maxPossible;
    const [minDec, setMinDec] = React.useState(minVal.toString());
    const [maxDec, setMaxDec] = React.useState(maxVal.toString());
    const [minHex, setMinHex] = React.useState(minVal.toString(16).toUpperCase());
    const [maxHex, setMaxHex] = React.useState(maxVal.toString(16).toUpperCase());

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t('tokenConfig.byteCount')}</label>
                <CustomSelect
                    items={bytesItems}
                    value={bytes.toString()}
                    onChange={(val) => {
                        const newBytes = parseInt(val) || 1;
                        const newMax = newBytes >= 7 ? Number.MAX_SAFE_INTEGER : Math.pow(256, newBytes) - 1;
                        setConfig({ ...config, bytes: newBytes, min: 0, max: newMax });
                        setMinDec('0'); setMinHex('0');
                        setMaxDec(newMax.toString()); setMaxHex(newMax.toString(16).toUpperCase());
                    }}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className={labelCls}>{t('tokenConfig.minValue')}</label>
                    <HexDecToggle mode={minMode} onChange={(m) => {
                        setMinMode(m);
                        setMinDec(minVal.toString()); setMinHex(minVal.toString(16).toUpperCase());
                    }} />
                </div>
                {minMode === 'hex' ? (
                    <PrefixInput prefix="0x" value={minHex} placeholder="0"
                        onChange={e => {
                            const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                            setMinHex(val);
                            const v = Math.max(0, Math.min(maxPossible, parseInt(val, 16) || 0));
                            setConfig({ ...config, min: v });
                        }}
                        onKeyDown={onKeyDown}
                    />
                ) : (
                    <input type="text" className={inputCls} value={minDec} placeholder="0"
                        onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setMinDec(val);
                            const v = Math.max(0, Math.min(maxPossible, parseInt(val) || 0));
                            setConfig({ ...config, min: v });
                        }}
                        onKeyDown={onKeyDown}
                    />
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className={labelCls}>{t('tokenConfig.maxValue')}</label>
                    <HexDecToggle mode={maxMode} onChange={(m) => {
                        setMaxMode(m);
                        setMaxDec(maxVal.toString()); setMaxHex(maxVal.toString(16).toUpperCase());
                    }} />
                </div>
                {maxMode === 'hex' ? (
                    <PrefixInput prefix="0x" value={maxHex} placeholder="FF"
                        onChange={e => {
                            const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                            setMaxHex(val);
                            const v = Math.max(0, Math.min(maxPossible, parseInt(val, 16) || 0));
                            setConfig({ ...config, max: v });
                        }}
                        onKeyDown={onKeyDown}
                    />
                ) : (
                    <input type="text" className={inputCls} value={maxDec} placeholder={maxPossible.toString()}
                        onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setMaxDec(val);
                            const v = Math.max(0, Math.min(maxPossible, parseInt(val) || 0));
                            setConfig({ ...config, max: v });
                        }}
                        onKeyDown={onKeyDown}
                    />
                )}
            </div>
            <p className={hintCls}>{t('tokenConfig.randomRangeHint', { max: maxPossible.toLocaleString() })}</p>
        </div>
    );
};
