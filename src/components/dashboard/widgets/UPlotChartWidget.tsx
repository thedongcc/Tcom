/**
 * UPlotChartWidget.tsx
 * 实时波形图 — 滑动时间窗口方案
 *
 * 同时满足：
 *  - 实时刷新：X 轴始终显示最近 windowSize 秒的数据，随时间右滑
 *  - 滚轮缩放：调整时间窗口大小（缩短/延长历史可见范围）
 *  - 拖拽：上下平移 Y 轴视野
 *  - Y 轴：始终自动跟随当前窗口内数据范围（可被拖拽暂时偏移）
 */
import React, { useCallback, useRef, useEffect } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { dataBusHistory } from '../../../store/useDataBusStore';

interface Props { bindKey: string; }

const DEFAULT_WINDOW_SEC = 30; // 默认显示最近 30 秒
const MIN_WINDOW_SEC     = 2;
const MAX_WINDOW_SEC     = 300;

export const UPlotChartWidget: React.FC<Props> = ({ bindKey }) => {
    const uplotRef     = useRef<uPlot | null>(null);
    const roRef        = useRef<ResizeObserver | null>(null);
    const rafRef       = useRef<number | undefined>(undefined);
    const bindRef      = useRef(bindKey);
    const windowSecRef = useRef(DEFAULT_WINDOW_SEC); // 当前时间窗口大小（秒）

    useEffect(() => { bindRef.current = bindKey; }, [bindKey]);

    // ── RAF 高频轮询：滑动窗口实时刷新 ────────────────────────────────────
    useEffect(() => {
        const loop = () => {
            const plot    = uplotRef.current;
            const history = dataBusHistory[bindRef.current];
            if (plot && history && history.t.length > 0) {
                const t    = history.t;
                const now  = t[t.length - 1];          // 最新时间戳
                const win  = windowSecRef.current;
                const xMin = now - win;
                const xMax = now;

                // setData(data, false) — 不 reset scales，由我们手动控制 X 轴
                plot.setData([t.slice(), history.v.slice()], false);

                // 手动推进 X 轴（时间窗口右滑）
                plot.setScale('x', { min: xMin, max: xMax });
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => {
            if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // ── 初始化 uPlot ──────────────────────────────────────────────────────
    const initPlot = useCallback((node: HTMLDivElement) => {
        if (uplotRef.current) { uplotRef.current.destroy(); uplotRef.current = null; }
        if (roRef.current)    { roRef.current.disconnect();  roRef.current    = null; }

        // 交互插件：滚轮 → 调整时间窗口；左键拖拽 → 平移 Y 轴
        const interactionPlugin = (): uPlot.Plugin => ({
            hooks: {
                ready: (u) => {
                    const over = u.over;

                    // ── 滚轮：调整时间窗口大小 ──
                    over.addEventListener('wheel', (e) => {
                        e.preventDefault();
                        const factor = e.deltaY < 0 ? 0.8 : 1.25; // 缩小/放大时间窗口
                        windowSecRef.current = Math.max(
                            MIN_WINDOW_SEC,
                            Math.min(MAX_WINDOW_SEC, windowSecRef.current * factor),
                        );
                    });

                    // ── 左键拖拽：平移 Y 轴 ──
                    let dragging = false, lastY = 0;
                    over.addEventListener('mousedown', (e) => {
                        if (e.button !== 0) return;
                        dragging = true; lastY = e.clientY;
                    });
                    const stopDrag = () => { dragging = false; };
                    over.addEventListener('mouseup',    stopDrag);
                    over.addEventListener('mouseleave', stopDrag);

                    over.addEventListener('mousemove', (e) => {
                        if (!dragging) return;
                        const rect  = over.getBoundingClientRect();
                        const dy    = e.clientY - lastY;
                        lastY = e.clientY;
                        const yR    = (u.scales.y.max ?? 1) - (u.scales.y.min ?? 0);
                        const delta = (dy / rect.height) * yR;
                        u.setScale('y', {
                            min: (u.scales.y.min ?? 0) + delta,
                            max: (u.scales.y.max ?? 1) + delta,
                        });
                    });
                },
            },
        });

        const r = node.getBoundingClientRect();
        const opts: uPlot.Options = {
            width:  r.width  || node.offsetWidth  || 300,
            height: r.height || node.offsetHeight || 200,
            plugins: [interactionPlugin()],
            cursor:  { show: true, drag: { setScale: false } },
            legend:  { show: false },
            padding: [8, 8, 0, 0],
            axes: [
                {
                    stroke: 'rgba(255,255,255,0.35)',
                    grid:   { stroke: 'rgba(255,255,255,0.06)', width: 1 },
                    ticks:  { show: false },
                },
                {
                    stroke: 'rgba(255,255,255,0.35)',
                    grid:   { stroke: 'rgba(255,255,255,0.06)', width: 1 },
                    ticks:  { show: false },
                    size:   44,
                },
            ],
            scales: {
                x: { time: true },
                y: {
                    auto: true,
                    range: (_u, min, max) => {
                        if (min === max) return [min - 1, max + 1];
                        const p = (max - min) * 0.12;
                        return [min - p, max + p];
                    },
                },
            },
            series: [
                {},
                { stroke: '#38bdf8', width: 2, points: { show: false } },
            ],
        };

        uplotRef.current = new uPlot(opts, [[], []], node);

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0 && uplotRef.current) {
                    uplotRef.current.setSize({ width, height });
                }
            }
        });
        ro.observe(node);
        roRef.current = ro;
    }, []);

    // ── Callback Ref：DOM 替换时自动重建 ──────────────────────────────────
    const containerCallback = useCallback((node: HTMLDivElement | null) => {
        if (!node) {
            if (uplotRef.current) { uplotRef.current.destroy(); uplotRef.current = null; }
            if (roRef.current)    { roRef.current.disconnect();  roRef.current    = null; }
            return;
        }
        initPlot(node);
    }, [initPlot]);

    return (
        <div
            ref={containerCallback}
            className="w-full h-full"
            style={{ position: 'relative' }}
        />
    );
};
