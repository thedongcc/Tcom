import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 放大镜常量：SCALE=10 → 每个逻辑像素占 10×10 canvas 像素；200×200 canvas 以 200px CSS 精确 1:1 渲染
const SIZE = 20, SCALE = 10, OUT = SIZE * SCALE;

function drawMagnifier(canvas: HTMLCanvasElement, b64: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── DPR 自适应：canvas 物理分辨率 = OUT × dpr，1px lineWidth = 1 物理像素 ──
    const dpr = window.devicePixelRatio || 1;
    const phyScale = SCALE * dpr;      // 物理像素 / 逻辑像素（DPR=1.5 → phyScale=15）
    const phyOut   = SIZE  * phyScale; // canvas 物理总宽高（DPR=1.5 → 300）
    canvas.width  = phyOut;
    canvas.height = phyOut;

    const binary = atob(b64);
    const rgb = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) rgb[i] = binary.charCodeAt(i);

    // ── 像素格绘制（物理坐标）──
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, phyOut, phyOut);
    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const idx = (row * SIZE + col) * 3;
            ctx.fillStyle = `rgb(${rgb[idx]},${rgb[idx + 1]},${rgb[idx + 2]})`;
            ctx.fillRect(col * phyScale, row * phyScale, phyScale, phyScale);
        }
    }

    // ── 选取框 + 短臂准星（物理像素坐标）──
    // 选中像素 (SIZE/2, SIZE/2) = (10, 10)，左上角在物理 (10*phyScale, 10*phyScale)
    const ppx = (SIZE / 2) * phyScale; // 物理 150（DPR=1.5）
    const ppy = (SIZE / 2) * phyScale;
    const pMid = ppx + phyScale / 2;   // 物理 157.5 → crisp 0.5-offset
    const pArm = phyScale * 1.5;       // 臂长（物理像素）

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1; // 1 物理像素

    // 框：完全在选中像素内部，四条边均在逻辑像素边界内
    ctx.strokeRect(ppx + 0.5, ppy + 0.5, phyScale - 1, phyScale - 1);

    // 短臂（以像素中心 pMid 为轴）
    ctx.beginPath(); ctx.moveTo(pMid, ppy - 1);          ctx.lineTo(pMid, ppy - pArm);          ctx.stroke(); // 上
    ctx.beginPath(); ctx.moveTo(pMid, ppy + phyScale + 1); ctx.lineTo(pMid, ppy + phyScale + pArm); ctx.stroke(); // 下
    ctx.beginPath(); ctx.moveTo(ppx - 1,           pMid); ctx.lineTo(ppx - pArm,           pMid); ctx.stroke(); // 左
    ctx.beginPath(); ctx.moveTo(ppx + phyScale + 1, pMid); ctx.lineTo(ppx + phyScale + pArm, pMid); ctx.stroke(); // 右

    ctx.restore();
}

export const EyedropperViewer: React.FC<{
    onConfirm: (color: string) => void;
    onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState('#000000');
    // ref 避免闭包陷阱 — 所有事件回调统一读 ref，effect 只注册一次
    const colorRef     = useRef(color);
    const confirmRef   = useRef(onConfirm);
    const cancelRef    = useRef(onCancel);
    colorRef.current   = color;
    confirmRef.current = onConfirm;
    cancelRef.current  = onCancel;

    useEffect(() => {
        const unsubs: Array<() => void> = [];

        listen<string>('eyedropper:pixels', (e) => {
            if (canvasRef.current) drawMagnifier(canvasRef.current, e.payload);
        }).then(fn => unsubs.push(fn));

        listen<string>('eyedropper:color', (e) => {
            setColor(e.payload);
        }).then(fn => unsubs.push(fn));

        // 键盘：Enter 确认 / Esc 取消 / 方向键移动光标
        // stopPropagation 防止 ColorPickerApp 的 bubble 阶段 onKey 同时处理这些按键
        const onKey = async (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                cancelRef.current();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault(); // 阻止默认「点击 focused 按钮」行为，防止吸管按钮被重新激活
                e.stopPropagation();
                console.log('[EVw] Enter pressed, colorRef=', colorRef.current, ' confirmRef=', confirmRef.current);
                confirmRef.current(colorRef.current);
                console.log('[EVw] confirmRef.current() called');
                return;
            }
            const dirs: Record<string, [number, number]> = {
                ArrowUp: [0, -1], ArrowDown: [0, 1],
                ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            };
            const d = dirs[e.key];
            if (d) { e.preventDefault(); invoke('cursor_move', { dx: d[0], dy: d[1] }).catch(() => {}); }
        };
        window.addEventListener('keydown', onKey, true);
        unsubs.push(() => window.removeEventListener('keydown', onKey, true));

        return () => unsubs.forEach(u => u());
    }, []); // 只注册一次，回调通过 ref 保持最新

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px 12px',
            gap: 8,
            justifyContent: 'center',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.35)',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    fontFamily: 'system-ui, sans-serif',
                }}>取色器</span>
                <button
                    onClick={onCancel}
                    style={{
                        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 5, color: 'rgba(239,68,68,0.8)',
                        width: 20, height: 20, fontSize: 10, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.3)';
                        (e.currentTarget as HTMLElement).style.color = '#ef4444';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)';
                        (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.8)';
                    }}
                >✕</button>
            </div>

            {/* 放大镜 Canvas — 全宽圆角矩形 */}
            <canvas
                ref={canvasRef} width={200} height={200}
                onClick={() => onConfirm(color)}
                style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    imageRendering: 'pixelated',
                    background: '#1a1a20',
                    cursor: 'crosshair',
                    display: 'block',
                }}
            />

            {/* 色值显示条 */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 7, padding: '6px 10px',
            }}>
                <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: color,
                    border: '1px solid rgba(255,255,255,0.15)',
                    flexShrink: 0,
                }} />
                <span style={{
                    fontSize: 12, color: 'rgba(255,255,255,0.75)',
                    fontFamily: '"IBM Plex Mono", monospace',
                    letterSpacing: '0.06em', flex: 1,
                }}>{color.toUpperCase()}</span>
                <span style={{
                    fontSize: 9, color: 'rgba(255,255,255,0.25)',
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: '0.05em',
                }}>Enter 确认</span>
            </div>
        </div>
    );
};
