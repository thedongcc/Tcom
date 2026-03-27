/**
 * DataDashboard.tsx
 * 协议解析引擎数据看板 MVP — 实时展示 Rust 解析出的物理量。
 *
 * 数据流：Rust Rx线程 → tcom-parsed-data IPC事件 → Zustand总线 → 此组件
 * 渲染策略：Zustand selector 精确订阅，避免全局重渲染。
 */
import React, { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useDataBusStore } from '../../store/useDataBusStore';

/** 每个物理量字段对应的图标映射（可扩展） */
const FIELD_ICONS: Record<string, string> = {
    pitch:   '📐',
    roll:    '🔄',
    yaw:     '🧭',
    temp:    '🌡️',
    pwm:     '⚡',
    voltage: '🔋',
    current: '⚡',
    speed:   '💨',
    rpm:     '🔁',
};

/** 格式化数值：保留最多 3 位小数，去掉无意义末尾零 */
function formatValue(v: number): string {
    return parseFloat(v.toFixed(3)).toString();
}

export const DataDashboard: React.FC = () => {
    const values = useDataBusStore((s) => s.latestValues);
    const ingestBatch = useDataBusStore.getState().ingestBatch;

    // 监听 Rust 推送的批量解析数据
    const unlistenRef = useRef<(() => void) | null>(null);
    useEffect(() => {
        let cancelled = false;

        listen<Array<Record<string, number>>>('tcom-parsed-data', (e) => {
            if (!cancelled) ingestBatch(e.payload);
        }).then((unlisten) => {
            if (cancelled) {
                unlisten();
            } else {
                unlistenRef.current = unlisten;
            }
        });

        return () => {
            cancelled = true;
            unlistenRef.current?.();
            unlistenRef.current = null;
        };
    }, [ingestBatch]);

    const entries = Object.entries(values);

    return (
        <div style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9000,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
        }}>
            {/* 标题栏 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 2,
            }}>
                <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: entries.length > 0 ? '#22c55e' : '#6b7280',
                    boxShadow: entries.length > 0 ? '0 0 6px #22c55e' : 'none',
                    transition: 'all 0.3s ease',
                }} />
                <span style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.35)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontFamily: 'system-ui, sans-serif',
                }}>
                    {entries.length > 0 ? 'LIVE DATA' : 'WAITING...'}
                </span>
            </div>

            {/* 数值卡片列表 */}
            {entries.length === 0 ? (
                <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: '10px 16px',
                    color: 'rgba(255,255,255,0.25)',
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    pointerEvents: 'none',
                }}>
                    等待串口数据…
                </div>
            ) : (
                entries.map(([key, val]) => {
                    const icon = FIELD_ICONS[key] ?? '📊';
                    return (
                        <div
                            key={key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: 'rgba(15,15,20,0.82)',
                                backdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255,255,255,0.09)',
                                borderRadius: 10,
                                padding: '8px 14px',
                                minWidth: 160,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                                pointerEvents: 'none',
                            }}
                        >
                            {/* 图标 */}
                            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                                {icon}
                            </span>

                            {/* 字段名 */}
                            <span style={{
                                flex: 1,
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.45)',
                                fontFamily: '"IBM Plex Mono", monospace',
                                letterSpacing: '0.04em',
                            }}>
                                {key}
                            </span>

                            {/* 数值（高亮色） */}
                            <span style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: '#a5f3fc',
                                fontFamily: '"IBM Plex Mono", monospace',
                                letterSpacing: '0.02em',
                                textShadow: '0 0 12px rgba(165,243,252,0.4)',
                            }}>
                                {formatValue(val)}
                            </span>
                        </div>
                    );
                })
            )}
        </div>
    );
};
