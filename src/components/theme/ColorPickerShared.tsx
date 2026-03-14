/**
 * ColorPickerShared.tsx
 * 共享颜色选择器组件 — 从 ElementInspector 提取，供 ThemeColorEditor 等复用
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { RgbaColorPicker } from 'react-colorful';
import { Pipette } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';

// GlobalWindow definition merged into vite-env.d.ts

// ── 工具函数 ───────────────────────────────────────────────

export function rgbToHex(color: string): string {
    if (!color) return '#000000';
    if (color.startsWith('#')) return color;
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!match) return color;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] ? parseFloat(match[4]) : 1;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    let hex = '#' + toHex(r) + toHex(g) + toHex(b);
    if (a < 1) hex += Math.round(a * 255).toString(16).padStart(2, '0');
    return hex;
}

export function parseRGBA(color: string): { r: number; g: number; b: number; a: number } {
    const def = { r: 0, g: 0, b: 0, a: 1 };
    if (!color) return def;
    if (color.startsWith('#')) {
        let hex = color.substring(1);
        if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
        if (hex.length === 4) hex = hex.split('').map(s => s + s).join('');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        let a = 1;
        if (hex.length === 8) a = Math.round((parseInt(hex.substring(6, 8), 16) / 255) * 100) / 100;
        return { r, g, b, a };
    }
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] ? parseFloat(match[4]) : 1,
        };
    }
    return def;
}

// ── ChannelInput ────────────────────────────────────────────

export const ChannelInput: React.FC<{ label: string; value: number; max: number; onChange: (v: number) => void }> = ({
    label, value, max, onChange,
}) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--st-dialog-muted-text)', textAlign: 'center' }}>{label}</span>
        <input
            type="number"
            value={value}
            min={0}
            max={max}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="bg-[var(--input-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] focus:border-[var(--focus-border-color)] w-full py-[3px] text-center rounded-sm text-[11px] outline-none transition-colors"
        />
    </div>
);

// ── ColorPickerContent（弹出层）────────────────────────────

export const ColorPickerContent: React.FC<{
    value: string;
    triggerRef: React.RefObject<HTMLDivElement>;
    onChange: (val: string) => void;
    onClose: () => void;
}> = ({ value, triggerRef, onChange, onClose }) => {
    const { t } = useI18n();
    const selfRef = useRef<HTMLDivElement>(null);
    const rgba = parseRGBA(value);
    const hex = rgbToHex(value);
    const [localHex, setLocalHex] = useState(hex.startsWith('#') ? hex.substring(1).toUpperCase() : hex.toUpperCase());
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [isPicking, setIsPicking] = useState(false);

    // 计算弹出位置
    useEffect(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const pickerWidth = 260;
            const pickerHeight = 380;
            let left = rect.right - pickerWidth;
            let top = rect.top - pickerHeight - 8;
            if (top < 8) top = rect.bottom + 8;
            if (left < 8) left = 8;
            if (left + pickerWidth > window.innerWidth - 8) left = window.innerWidth - pickerWidth - 8;
            setCoords({ top: top + window.scrollY, left: left + window.scrollX });
        }
    }, [triggerRef]);

    useEffect(() => {
        const h = rgbToHex(value);
        setLocalHex(h.startsWith('#') ? h.substring(1).toUpperCase() : h.toUpperCase());
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (isPicking) return;
            const target = e.target as Node;
            if (
                selfRef.current && !selfRef.current.contains(target) &&
                triggerRef.current && !triggerRef.current.contains(target)
            ) {
                // 如果点击的是 portal 外的内容（且不是触发器本身），则关闭
                onClose();
            }
        };
        // 延迟注册以避免触发瞬间的点击事件冲突
        const timer = setTimeout(() => {
            window.addEventListener('mousedown', handleClickOutside, true);
        }, 10);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, [onClose, isPicking]); // triggerRef 是稳定的，无需作为依赖项引起重连

    const handleEyedropper = async () => {
        setIsPicking(true);
        if (window.eyedropperAPI) {
            const stopWatch = window.eyedropperAPI.onColor((hex) => onChange(hex));
            const stopPick = window.eyedropperAPI.onPicked((hex) => { onChange(hex); cleanup(); });
            const stopCancel = window.eyedropperAPI.onCanceled(() => cleanup());
            await window.eyedropperAPI.watchStart();
            const cleanup = () => { stopWatch(); stopPick(); stopCancel(); window.eyedropperAPI!.watchStop(); setIsPicking(false); };
            return;
        }
        alert('环境不支持高级吸管取色，请手动输入颜色值。');
        setIsPicking(false);
    };

    const updateRGBA = (next: { r: number; g: number; b: number; a?: number }) => {
        onChange(`rgba(${next.r || 0}, ${next.g || 0}, ${next.b || 0}, ${next.a ?? 1})`);
    };
    const updateChannel = (channel: keyof typeof rgba, val: number) => {
        const next = { ...rgba, [channel]: val || 0 };
        onChange(`rgba(${next.r || 0}, ${next.g || 0}, ${next.b || 0}, ${next.a ?? 1})`);
    };

    return (
        <motion.div
            ref={selfRef}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.13 }}
            className="color-picker-popover"
            style={{
                position: 'fixed',
                left: coords.left,
                top: coords.top,
                width: 248,
                backgroundColor: 'var(--theme-editor-bg)',
                border: '1px solid var(--theme-editor-border)',
                borderRadius: 8,
                zIndex: 2147483647,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
        >
            {/* 色相/饱和度选择区 */}
            <div className="inspector-colorful-wrap">
                <RgbaColorPicker color={rgba} onChange={updateRGBA} />
            </div>

            {/* 底部控件区 */}
            <div style={{ padding: '10px 10px 12px' }}>
                {/* 第一行: 吸管 | 颜色预览 | Hex 输入 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                    <Tooltip content={t('themeEditor.screenPicker')} position="bottom" offset={4}>
                        <button
                            onClick={handleEyedropper}
                            style={{
                                width: 32, height: 32, flexShrink: 0,
                                background: isPicking ? 'var(--theme-editor-inspect-bg)' : 'var(--theme-editor-btn-bg)',
                                border: `1px solid ${isPicking ? 'var(--theme-editor-inspect-border)' : 'var(--theme-editor-input-border)'}`,
                                borderRadius: 6, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s',
                            }}
                        >
                            <Pipette size={14} color={isPicking ? 'var(--theme-editor-inspect-text)' : 'var(--app-foreground)'} />
                        </button>
                    </Tooltip>

                    {/* 当前色预览 */}
                    <div style={{
                        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                        border: '1px solid var(--theme-editor-input-border)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                        backgroundImage: 'conic-gradient(var(--theme-editor-btn-hover) 25%, transparent 25% 50%, var(--theme-editor-btn-hover) 50% 75%, transparent 75%)',
                        backgroundSize: '8px 8px', position: 'relative', overflow: 'hidden',
                    }}>
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: value }} />
                    </div>

                    {/* Hex 输入 */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--app-foreground)', opacity: 0.5, flexShrink: 0, fontFamily: 'monospace' }}>#</span>
                        <input
                            value={localHex}
                            onChange={e => {
                                const val = e.target.value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase().slice(0, 8);
                                setLocalHex(val);
                                if ([3, 4, 6, 8].includes(val.length)) onChange('#' + val);
                            }}
                            onBlur={() => {
                                const h = rgbToHex(value);
                                setLocalHex(h.startsWith('#') ? h.substring(1).toUpperCase() : h.toUpperCase());
                            }}
                            style={{
                                flex: 1, minWidth: 0, boxSizing: 'border-box', height: 26,
                                background: 'var(--theme-editor-input-bg)', color: 'var(--app-foreground)',
                                border: '1px solid var(--theme-editor-input-border)', borderRadius: 4,
                                padding: '0 6px', fontSize: 12, outline: 'none', fontFamily: 'monospace',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                        />
                    </div>
                </div>

                {/* 第二行: R G B A% */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
                    <ChannelInput label="R" value={rgba.r} max={255} onChange={v => updateChannel('r', v)} />
                    <ChannelInput label="G" value={rgba.g} max={255} onChange={v => updateChannel('g', v)} />
                    <ChannelInput label="B" value={rgba.b} max={255} onChange={v => updateChannel('b', v)} />
                    <ChannelInput label="A%" value={Math.round(rgba.a * 100)} max={100} onChange={v => updateChannel('a', v / 100)} />
                </div>
            </div>
        </motion.div>
    );
};

// ── ColorPickerTrigger（触发器色块）─────────────────────────

export const ColorPickerTrigger: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);

    return (
        <div style={{ position: 'relative' }}>
            <Tooltip content={value} position="top" offset={4}>
                <div
                    ref={triggerRef}
                    onClick={() => setIsOpen(!isOpen)}
                    style={{
                        width: 28,
                        height: 20,
                        borderRadius: 4,
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        padding: 2,
                        background: 'rgba(0,0,0,0.2)',
                        flexShrink: 0,
                    }}
                >
                    {/* 透明格纹 + 颜色层 */}
                    <div style={{
                        width: '100%', height: '100%', borderRadius: 2,
                        backgroundImage: 'conic-gradient(#333 0.25turn, #444 0.25turn 0.5turn, #333 0.5turn 0.75turn, #444 0.75turn)',
                        backgroundSize: '4px 4px',
                    }}>
                        <div style={{ width: '100%', height: '100%', backgroundColor: value }} />
                    </div>
                </div>
            </Tooltip>

            {typeof document !== 'undefined' && isOpen && createPortal(
                <ColorPickerContent
                    value={value}
                    triggerRef={triggerRef}
                    onChange={onChange}
                    onClose={() => setIsOpen(false)}
                />,
                document.body
            )}
        </div>
    );
};
