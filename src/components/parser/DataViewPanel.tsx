/**
 * DataViewPanel.tsx
 * 右侧实时数据显示面板 — 深色卡片风格
 * 颜色圆点与 ParserSidebar 字段颜色互通
 */
import React, { useRef } from 'react';
import { useDataBusStore } from '../../store/useDataBusStore';
import { useParserStore } from '../../store/useParserStore';
import { FIELD_COLORS } from '../parser/ParserSidebar';

// ─── 可点击颜色圆点（与 ParserSidebar 共用逻辑） ─
const ColorDot = ({ color, onChange }: { color: string; onChange: (c: string) => void }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <span
                className="w-2 h-2 rounded-full cursor-pointer flex-shrink-0 transition-transform hover:scale-125"
                style={{ background: color, boxShadow: `0 0 5px ${color}80` }}
                title="点击修改颜色"
                onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
            />
            <input
                ref={inputRef}
                type="color"
                value={color}
                onChange={e => onChange(e.target.value)}
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
            />
        </span>
    );
};

const IconTrash = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/>
    </svg>
);

export const DataViewPanel: React.FC = () => {
    const { latestValues, reset } = useDataBusStore();
    const { config, updateScheme } = useParserStore();

    const activeScheme = config?.schemes.find(s => s.id === config.active_id) ?? config?.schemes[0] ?? null;
    const fields = activeScheme?.fields ?? [];
    const fieldKeys = fields.map(f => f.name);
    const extraKeys = Object.keys(latestValues).filter(k => !fieldKeys.includes(k));
    const allKeys = [...fieldKeys, ...extraKeys];
    const hasData = allKeys.length > 0 && Object.keys(latestValues).length > 0;

    // 根据字段名从 parser config 获取颜色（或使用默认调色板）
    const getFieldColor = (key: string, index: number): string => {
        const fieldDef = fields.find(f => f.name === key);
        return fieldDef?.color ?? FIELD_COLORS[index % FIELD_COLORS.length];
    };

    // 通过 updateScheme 持久化颜色变更
    const setFieldColor = (key: string, color: string) => {
        if (!activeScheme) return;
        updateScheme(activeScheme.id, s => ({
            ...s,
            fields: s.fields.map(f => f.name === key ? { ...f, color } : f),
        }));
    };

    return (
        <div
            className="h-full flex flex-col bg-[var(--sidebar-background)] text-[var(--sidebar-foreground)] border-l border-[var(--border-color)] overflow-hidden flex-shrink-0"
            style={{ width: 210, minWidth: 190 }}
        >
            {/* 面板头 */}
            <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        {hasData && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" />}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${hasData ? 'bg-sky-400' : 'bg-[rgba(255,255,255,0.15)]'}`} />
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--sidebar-foreground)]">实时数据</span>
                </div>
                <button
                    className="p-1 rounded opacity-30 hover:opacity-100 hover:bg-[var(--st-status-error-bg)] hover:text-[var(--st-status-error)] transition-all flex items-center justify-center cursor-pointer"
                    title="清空显示数据"
                    onClick={() => reset()}
                >
                    <IconTrash />
                </button>
            </div>

            {/* 数据列表 */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-2.5 space-y-2.5">
                {!hasData ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 pb-8">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--sidebar-muted-foreground)] opacity-20">
                            <path d="M1 6c0 0 5.5-2 11-2s11 2 11 2"/>
                            <path d="M5 10c0 0 3.5-1.5 7-1.5s7 1.5 7 1.5"/>
                            <path d="M9 14c0 0 1.5-.5 3-.5s3 .5 3 .5"/>
                            <circle cx="12" cy="18" r="1" fill="currentColor"/>
                        </svg>
                        <p className="text-[9px] text-[var(--sidebar-muted-foreground)] opacity-40 text-center leading-relaxed">
                            等待数据…<br/>连接串口后自动显示
                        </p>
                    </div>
                ) : (
                    allKeys.map((key, index) => {
                        const value = latestValues[key];
                        const fieldDef = fields.find(f => f.name === key);
                        const hasValue = value !== undefined;
                        const color = getFieldColor(key, index);

                        return (
                            <div
                                key={key}
                                className="rounded-xl px-3 py-2.5"
                                style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                }}
                            >
                                {/* 字段名 + 颜色圆点 + LIVE 徽章 */}
                                <div className="flex items-center gap-2 justify-between mb-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <ColorDot
                                            color={color}
                                            onChange={c => setFieldColor(key, c)}
                                        />
                                        <span className="font-mono text-[12px] font-semibold truncate" style={{ color }}>
                                            {key}
                                        </span>
                                    </div>
                                    {hasValue && (
                                        <span
                                            className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
                                            style={{
                                                color: '#4ade80',
                                                border: '1px solid rgba(74,222,128,0.5)',
                                                background: 'rgba(74,222,128,0.08)',
                                                lineHeight: 1.2,
                                            }}
                                        >
                                            LIVE
                                        </span>
                                    )}
                                </div>

                                {/* 数值 */}
                                <div
                                    className="font-mono tabular-nums leading-none mb-1.5"
                                    style={{
                                        fontSize: 22,
                                        fontWeight: 700,
                                        color: hasValue ? 'var(--app-foreground)' : 'rgba(255,255,255,0.15)',
                                    }}
                                >
                                    {hasValue ? value!.toFixed(4) : '—'}
                                </div>

                                {/* 元信息 */}
                                {fieldDef && (
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                            {fieldDef.data_type}
                                        </span>
                                        <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                            byte@{fieldDef.offset}
                                        </span>
                                        {fieldDef.multiplier !== 1.0 && (
                                            <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                                ×{fieldDef.multiplier}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* 状态栏 */}
            <div className="px-3 py-1.5 border-t border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
                <span className="text-[8px] font-mono text-[var(--sidebar-muted-foreground)] opacity-40">{allKeys.length} FIELDS</span>
                <span className="text-[8px] font-mono text-[var(--sidebar-muted-foreground)] opacity-30">60Hz</span>
            </div>
        </div>
    );
};
