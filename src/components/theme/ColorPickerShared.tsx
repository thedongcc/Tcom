/**
 * ColorPickerShared.tsx
 * 共享颜色选择器组件 — 从 ElementInspector 提取，供 ThemeColorEditor 等复用
 */


import React, { useState, useEffect, useRef } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import { Pipette } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';
import { EyedropperViewer } from './EyedropperViewer';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

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
    triggerRef?: React.RefObject<HTMLDivElement>;
    onChange: (val: string) => void;
    onClose: () => void;
    isStandalone?: boolean;
}> = ({ value, triggerRef, onChange, onClose, isStandalone }) => {
    const { t } = useI18n();
    const selfRef = useRef<HTMLDivElement>(null);
    const outerRef = useRef<HTMLDivElement>(null); // 外层容器，包含 EyedropperViewer，用于测量窗口高度
    const rgba = parseRGBA(value);
    const hex = rgbToHex(value);
    const [localHex, setLocalHex] = useState(hex.startsWith('#') ? hex.substring(1).toUpperCase() : hex.toUpperCase());
    const [coords, setCoords] = useState<{ left: number; top?: number; bottom?: number }>({ top: 0, left: 0 });
    const [isPicking, setIsPicking] = useState(false);

    // 计算弹出位置（fixed 布局，不加 scrollY）
    useEffect(() => {
        if (triggerRef && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // 上下结构宽度固定，不需要 isPicking 动态横向拉宽
            const pickerWidth = 260;
            const ESTIMATED_HEIGHT = 500; // 预估最大高度（含底部取色器）
            let left = rect.left;
            let top: number | undefined = rect.bottom + 8;
            let bottom: number | undefined = undefined;
            // 下方空间不足则翻转到上方，锚定 bottom 让浏览器自适应高度
            if (top + ESTIMATED_HEIGHT > window.innerHeight - 8) {
                top = undefined;
                bottom = window.innerHeight - rect.top + 8;
            }
            if (left < 8) left = 8;
            if (left + pickerWidth > window.innerWidth - 8) left = window.innerWidth - pickerWidth - 8;
            setCoords({ top, bottom, left });
        } else if (isStandalone) {
            setCoords({ left: 0, top: 0 });
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
                (!triggerRef || (triggerRef.current && !triggerRef.current.contains(target)))
            ) {
                // 如果点击的是 portal 外的内容（且不是触发器本身），则关闭
                onClose();
            }
        };
        // 延迟注册以避免触发瞬间的点击事件冲突
        const timer = setTimeout(() => {
            // 如果是独立窗口模式，失焦是在 Rust 层面通过 blur 处理的，不需要注册 DOM click Outside
            if (!isStandalone) window.addEventListener('mousedown', handleClickOutside, true);
        }, 10);
        return () => {
            clearTimeout(timer);
            if (!isStandalone) window.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, [onClose, isPicking, isStandalone]); // triggerRef 是稳定的，无需作为依赖项引起重连

    // 独立窗口模式下：isPicking 切换后横向扩展窗口宽度以容纳右侧 EyedropperViewer
    useEffect(() => {
        if (!isStandalone) return;
        const PICKER_W = 248; // 回退至经典 248 宽度
        const VIEWER_W = 220; // 右侧面版宽
        const w = isPicking ? PICKER_W + VIEWER_W : PICKER_W;
        getCurrentWindow().setSize(new LogicalSize(w, 284)).catch(() => {});
    }, [isPicking, isStandalone]);

    const handleEyedropper = async () => {
        setIsPicking(!isPicking);
        if (!isPicking) {
            try {
                await invoke('eyedropper_mini_open');
            } catch (err) {
                console.error('[EyeDropper] mini open failed:', err);
                setIsPicking(false);
            }
        } else {
            invoke('eyedropper_mini_close').catch(() => {});
        }
    };

    const updateRGBA = (next: { r: number; g: number; b: number; a?: number }) => {
        onChange(`rgba(${next.r || 0}, ${next.g || 0}, ${next.b || 0}, ${next.a ?? 1})`);
    };
    const updateChannel = (channel: keyof typeof rgba, val: number) => {
        const next = { ...rgba, [channel]: val || 0 };
        onChange(`rgba(${next.r || 0}, ${next.g || 0}, ${next.b || 0}, ${next.a ?? 1})`);
    };

    return (
        <div ref={outerRef} style={{
            ...(isStandalone ? {
                width: 'fit-content',
                height: '100%',
                display: 'flex', flexDirection: 'row',
                backgroundColor: '#16161a',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
                overflow: 'hidden',
            } : {
                position: 'fixed',
                left: coords.left,
                ...(coords.top !== undefined ? { top: coords.top } : {}),
                ...(coords.bottom !== undefined ? { bottom: coords.bottom } : {}),
                display: 'flex', flexDirection: 'column',
                zIndex: 2147483647,
                backgroundColor: '#16161a',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)',
                width: 248,
            }),
            ...(isStandalone ? {} : { backdropFilter: 'blur(20px)' }),
        }}>
            <div ref={selfRef} style={{ width: isStandalone ? 248 : '100%', flexShrink: 0, backgroundColor: '#16161a' }}>

                {/* ── 色相/饱和度选择区 ── */}
                <div className="inspector-colorful-wrap" style={{ borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
                    <RgbaColorPicker color={rgba} onChange={updateRGBA} />
                </div>

                {/* ── 工具栏：吸管 + 色块预览 + Hex ── */}
                <div style={{ padding: '10px 14px 0', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>

                        {/* 吸管按钮 */}
                        <Tooltip content={t('themeEditor.screenPicker')} position="bottom" offset={6}>
                            <button
                                onClick={handleEyedropper}
                                style={{
                                    width: 30, height: 30, flexShrink: 0,
                                    background: isPicking
                                        ? 'rgba(99,102,241,0.2)'
                                        : 'rgba(255,255,255,0.06)',
                                    border: `1px solid ${isPicking
                                        ? 'rgba(99,102,241,0.6)'
                                        : 'rgba(255,255,255,0.1)'}`,
                                    borderRadius: 7, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.18s ease',
                                    color: isPicking ? '#818cf8' : 'rgba(255,255,255,0.55)',
                                }}
                                onMouseEnter={e => {
                                    if (!isPicking) {
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
                                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isPicking) {
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                                    }
                                }}
                            >
                                <Pipette size={13} />
                            </button>
                        </Tooltip>

                        {/* 颜色预览块 */}
                        <div style={{
                            width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundImage: 'repeating-conic-gradient(#2a2a30 0% 25%, #1c1c22 0% 50%)',
                            backgroundSize: '8px 8px',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: value, borderRadius: 6 }} />
                        </div>

                        {/* Hex 输入 */}
                        <div style={{
                            flex: 1, minWidth: 100, display: 'flex', alignItems: 'center',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 7, height: 30,
                            paddingLeft: 8, paddingRight: 8, gap: 4,
                            transition: 'border-color 0.15s',
                        }}
                            onFocus={() => {}}
                        >
                            <span style={{
                                fontSize: 11, color: 'rgba(255,255,255,0.3)',
                                flexShrink: 0, fontFamily: '"IBM Plex Mono", monospace',
                                lineHeight: 1,
                            }}>#</span>
                            <input
                                value={localHex}
                                onChange={e => {
                                    const val = e.target.value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase().slice(0, 8);
                                    setLocalHex(val);
                                    if ([3, 4, 6, 8].includes(val.length)) onChange('#' + val);
                                }}
                                onBlur={e => {
                                    const h = rgbToHex(value);
                                    setLocalHex(h.startsWith('#') ? h.substring(1).toUpperCase() : h.toUpperCase());
                                    (e.currentTarget.parentElement as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                                }}
                                onFocus={e => {
                                    (e.currentTarget.parentElement as HTMLElement).style.borderColor = 'rgba(99,102,241,0.6)';
                                }}
                                style={{
                                    flex: 1, minWidth: 0, background: 'transparent',
                                    color: 'rgba(255,255,255,0.85)',
                                    border: 'none', outline: 'none',
                                    fontSize: 12, fontFamily: '"IBM Plex Mono", monospace',
                                    letterSpacing: '0.04em',
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── RGBA 通道输入 ── */}
                <div style={{ padding: '8px 14px 14px', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, width: '100%' }}>
                        {([
                            { label: 'R', val: rgba.r, max: 255, key: 'r' as const },
                            { label: 'G', val: rgba.g, max: 255, key: 'g' as const },
                            { label: 'B', val: rgba.b, max: 255, key: 'b' as const },
                            { label: 'A%', val: Math.round(rgba.a * 100), max: 100, key: 'a' as const },
                        ]).map(({ label, val, max, key }) => (
                            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                                <input
                                    type="number"
                                    value={val}
                                    min={0}
                                    max={max}
                                    onChange={e => {
                                        const num = parseFloat(e.target.value) || 0;
                                        updateChannel(key, key === 'a' ? num / 100 : num);
                                    }}
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        height: 28, textAlign: 'center',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: 'rgba(255,255,255,0.8)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 6, outline: 'none',
                                        fontSize: 11,
                                        fontFamily: '"IBM Plex Mono", monospace',
                                        transition: 'border-color 0.15s',
                                        MozAppearance: 'textfield' as never,
                                    }}
                                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                                <span style={{
                                    fontSize: 9.5, color: 'rgba(255,255,255,0.28)',
                                    letterSpacing: '0.08em', textTransform: 'uppercase',
                                    fontFamily: 'system-ui, sans-serif',
                                }}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── 吸管取色视图（右侧面板） ── */}
            {isPicking && (
                <div style={{
                    borderLeft: '1px solid rgba(255,255,255,0.07)',
                    background: '#16161a',
                    width: 220,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <EyedropperViewer
                        onConfirm={c => {
                            onChange(c);
                            invoke('eyedropper_mini_close').catch(() => {});
                            setIsPicking(false);
                        }}
                        onCancel={() => {
                            setIsPicking(false);
                            invoke('eyedropper_mini_close').catch(() => {});
                        }}
                    />
                </div>
            )}
        </div>
    );
};

// ── ColorPickerTrigger（触发器色块）─────────────────────────

export const ColorPickerTrigger: React.FC<{ value: string; onChange: (val: string) => void; shape?: 'rect' | 'circle'; size?: number }> = ({ value, onChange, shape = 'rect', size }) => {
    const triggerRef = useRef<HTMLDivElement>(null);

    const handleClick = async () => {
        try {


            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                const win = getCurrentWebviewWindow();
                const innerPos = await win.innerPosition();
                const factor = await win.scaleFactor();

                // 屏幕边界检测：使用 availHeight 扣除任务栏
                const PICKER_W = 248;
                const PICKER_H = 284;
                const screenW = window.screen.availWidth;
                const screenH = window.screen.availHeight;

                const rawX = innerPos.x / factor + rect.left;
                const x = Math.max(0, Math.min(rawX, screenW - PICKER_W));

                const yBelow = innerPos.y / factor + rect.bottom + 8;
                const yAbove = innerPos.y / factor + rect.top - PICKER_H - 8;
                const y = (yBelow + PICKER_H > screenH) ? Math.max(0, yAbove) : yBelow;

                localStorage.setItem('color_picker_init', value);

                try {
                    await invoke('color_picker_open', { x, y });
                } catch (err) {
                    console.error('[ColorPickerTrigger] color_picker_open 失败:', err);
                }

                // 给已驻留缓冲池的 Webview 推送颜色
                emit('color_picker:init_update', value).catch(() => {});

                // 监听颜色变更和面板关闭，避免重复订阅
                const unlistenChange = await listen<string>('color_picker:change', (e) => {
                     onChange(e.payload);
                });
                const unlistenClose = await listen('color_picker:closed', () => {
                     unlistenChange();
                     unlistenClose();
                });
            }
        } catch (err) {
            console.error('[ColorPickerTrigger] 打开颜色选择器时出错:', err);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <Tooltip content={value} position="top" offset={4}>
                <div
                    ref={triggerRef}
                    onClick={handleClick}
                    style={{
                        width: size ?? (shape === 'circle' ? 24 : 28),
                        height: size ?? (shape === 'circle' ? 24 : 20),
                        borderRadius: shape === 'circle' ? '50%' : 4,
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        padding: shape === 'circle' ? 2 : 2,
                        background: 'rgba(0,0,0,0.2)',
                        flexShrink: 0,
                    }}
                >
                    {/* 透明格纹 + 颜色层 */}
                    <div style={{
                        width: '100%', height: '100%', borderRadius: shape === 'circle' ? '50%' : 2,
                        backgroundImage: 'conic-gradient(#333 0.25turn, #444 0.25turn 0.5turn, #333 0.5turn 0.75turn, #444 0.75turn)',
                        backgroundSize: '4px 4px',
                        overflow: 'hidden',
                    }}>
                        <div style={{ width: '100%', height: '100%', backgroundColor: value }} />
                    </div>
                </div>
            </Tooltip>
        </div>
    );
};
