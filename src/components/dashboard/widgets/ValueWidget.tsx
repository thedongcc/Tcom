/**
 * ValueWidget.tsx
 * 原子化数值卡片 — 精准订阅单一物理量，实现零额外重渲染。
 *
 * 渲染隔离核心设计：
 * 本组件只订阅 `latestValues[bindKey]`，当其他字段（如 temp）更新时，
 * 此组件（如 pitch Widget）完全不会触发 re-render。
 */
import React from 'react';
import { useDataBusStore } from '../../../store/useDataBusStore';

/** 字段图标映射（可按需扩展） */
const ICON_MAP: Record<string, string> = {
    pitch:   '📐',
    roll:    '🔄',
    yaw:     '🧭',
    temp:    '🌡️',
    pwm:     '⚡',
    voltage: '🔋',
    speed:   '💨',
    rpm:     '🔁',
};

/** 字段单位映射 */
const UNIT_MAP: Record<string, string> = {
    pitch: '°',
    roll:  '°',
    yaw:   '°',
    temp:  '℃',
    pwm:   'μs',
    rpm:   'rpm',
    voltage: 'V',
    speed:   'm/s',
};

interface ValueWidgetProps {
    bindKey: string;
    sessionId: string;
}

export const ValueWidget: React.FC<ValueWidgetProps> = ({ bindKey, sessionId }) => {
    // 从所有 scheme 合并取值（Dashboard 视图不区分方案，取第一个有值的）
    const value = useDataBusStore((s) => {
        const sv = s.sessionsData[sessionId]?.schemeValues;
        if (!sv) return null;
        for (const scheme of Object.values(sv)) {
            if (bindKey in scheme) return scheme[bindKey];
        }
        return null;
    });

    const icon = ICON_MAP[bindKey] ?? '📊';
    const unit = UNIT_MAP[bindKey] ?? '';
    const isConnected = value !== null;
    const displayValue = isConnected ? parseFloat(value!.toFixed(3)).toString() : '—';

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            opacity: isConnected ? 1 : 0.5,
            transition: 'opacity 0.2s ease',
        }}>
            {/* ── 顶部拖拽把手（.drag-handle 是 react-grid-layout 的拖拽锚点） */}
            <div
                className="drag-handle"
                style={{
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 12px',
                    background: 'rgba(255,255,255,0.04)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'grab',
                    userSelect: 'none',
                    flexShrink: 0,
                }}
            >
                {/* 活动状态指示灯 */}
                <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isConnected ? '#22c55e' : '#374151',
                    boxShadow: isConnected ? '0 0 6px #22c55e88' : 'none',
                    flexShrink: 0,
                }} />

                {/* 图标 */}
                <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>

                {/* 变量名 */}
                <span style={{
                    flex: 1,
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.5)',
                    fontFamily: '"IBM Plex Mono", monospace',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {bindKey}
                </span>

                {/* 拖拽提示图标 */}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
                    <rect x="2" y="2" width="4" height="4" rx="1" fill="currentColor"/>
                    <rect x="10" y="2" width="4" height="4" rx="1" fill="currentColor"/>
                    <rect x="2" y="10" width="4" height="4" rx="1" fill="currentColor"/>
                    <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor"/>
                </svg>
            </div>

            {/* ── 数值显示区（不可拖拽，保留给未来图表/滑块使用）*/}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 12px',
                gap: 4,
            }}>
                {/* 主数值 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 4,
                }}>
                    <span style={{
                        fontSize: 'clamp(24px, 3.5vw, 36px)',
                        fontWeight: 700,
                        color: isConnected ? '#a5f3fc' : 'rgba(255,255,255,0.15)',
                        fontFamily: '"IBM Plex Mono", monospace',
                        letterSpacing: '-0.02em',
                        textShadow: isConnected ? '0 0 20px rgba(165,243,252,0.35)' : 'none',
                        lineHeight: 1,
                        transition: 'color 0.3s ease, text-shadow 0.3s ease',
                    }}>
                        {displayValue}
                    </span>
                    {unit && isConnected && (
                        <span style={{
                            fontSize: 12,
                            color: 'rgba(165,243,252,0.45)',
                            fontFamily: 'system-ui, sans-serif',
                            fontWeight: 400,
                        }}>
                            {unit}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
