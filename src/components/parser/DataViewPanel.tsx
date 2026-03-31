/**
 * DataViewPanel.tsx
 * 右侧实时数据显示面板 — 深色卡片风格
 * 颜色圆点与 ParserSidebar 字段颜色互通
 */
import React, { useRef, useState, useEffect } from 'react';
import { useDataBusStore } from '../../store/useDataBusStore';
import { useParserStore, type DataType, FIELD_COLORS } from '../../store/useParserStore';
import { useSession } from '../../context/SessionContext';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { ColorPickerTrigger } from '../theme/ColorPickerShared';

const IconTrash = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/>
    </svg>
);

// 根据 DataType 返回字节数和是否小端
function getTypeInfo(dataType: string): { bytes: number; littleEndian: boolean; signed: boolean } {
    const isSigned = dataType.startsWith('i');
    const isLE = dataType.endsWith('_le');
    if (dataType === 'u8' || dataType === 'i8') return { bytes: 1, littleEndian: true, signed: isSigned };
    if (dataType.includes('16')) return { bytes: 2, littleEndian: isLE, signed: isSigned };
    if (dataType.includes('32')) return { bytes: 4, littleEndian: isLE, signed: isSigned };
    return { bytes: 1, littleEndian: true, signed: false };
}

// 将整数按字节数拆成 HEX 字节数组（返回显示顺序）
function toHexBytes(rawInt: number, bytes: number, littleEndian: boolean): string[] {
    // 处理负数（有符号补码）
    const unsigned = rawInt < 0 ? rawInt + Math.pow(2, bytes * 8) : rawInt;
    const arr: string[] = [];
    for (let i = 0; i < bytes; i++) {
        arr.push(((unsigned >> (i * 8)) & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
    }
    // arr 现在是 LE 顺序（低字节在前），若 BE 则翻转
    return littleEndian ? arr : arr.reverse();
}

/** 底部原始字节公式行，格式：7E AB × 0.01 */
const RawBytesRow: React.FC<{
    dataType: string;
    multiplier: number;
    finalValue?: number;
}> = ({ dataType, multiplier, finalValue }) => {
    const { bytes, littleEndian, signed } = getTypeInfo(dataType);
    const hasValue = finalValue !== undefined;
    const showFormula = multiplier !== 1.0 && hasValue;

    // 反推原始整数
    let hexBytes: string[] = [];
    if (hasValue) {
        const rawInt = Math.round(finalValue! / multiplier);
        // 对有符号类型做范围钳制（防止浮点误差导致溢出）
        const maxVal = signed ? Math.pow(2, bytes * 8 - 1) - 1 : Math.pow(2, bytes * 8) - 1;
        const minVal = signed ? -Math.pow(2, bytes * 8 - 1) : 0;
        const clamped = Math.max(minVal, Math.min(maxVal, rawInt));
        hexBytes = toHexBytes(clamped, bytes, littleEndian);
    }

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {/* 有 multiplier：显示「HEX 字节 × 倍数」*/}
            {showFormula && (
                <>
                    <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>
                        {hexBytes.join(' ')}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        ×{multiplier}
                    </span>
                </>
            )}
            {/* multiplier=1：显示 HEX 原始字节 */}
            {!showFormula && hasValue && multiplier === 1.0 && (
                <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
                    {hexBytes.join(' ')}
                </span>
            )}
        </div>
    );
};

export const DataViewPanel: React.FC = () => {
    const { t } = useI18n();
    const { activeSessionId, sessions } = useSession();
    const activeSession = sessions.find(s => s.id === activeSessionId);
    
    // 从当前会话的配置中提取绑定的解析方案列表
    const sessionConfig = activeSession?.config as any;
    const boundSchemeIds: string[] = sessionConfig?.parserSchemeIds ?? (sessionConfig?.parserSchemeId ? [sessionConfig.parserSchemeId] : []);

    const sessionDataEntry = useDataBusStore(s => activeSessionId ? s.sessionsData[activeSessionId]?.latestValues : undefined);
    const latestValues = sessionDataEntry || {};
    const resetSession = useDataBusStore(s => s.resetSession);
    
    const { config, updateScheme, loadConfig, isLoading: parserLoading, pushToEngine } = useParserStore();

    useEffect(() => {
        if (!config && !parserLoading) {
            void loadConfig();
        }
    }, [config, parserLoading, loadConfig]);

    // 筛选出所有相关的活跃方案
    const activeSchemes = config?.schemes.filter(s => boundSchemeIds.includes(s.id)) ?? [];
    const allKnownFields = activeSchemes.flatMap(s => s.fields);
    const fieldKeys = allKnownFields.map(f => f.name);
    const extraKeys = Object.keys(latestValues).filter(k => !fieldKeys.includes(k));
    const allKeys = [...fieldKeys, ...extraKeys];
    const hasData = allKeys.length > 0 && Object.keys(latestValues).length > 0;

    // 通过 updateScheme 持久化特定方案内的颜色变更
    const setFieldColor = (schemeId: string, key: string, color: string) => {
        updateScheme(schemeId, s => ({
            ...s,
            fields: s.fields.map(f => f.name === key ? { ...f, color } : f),
        }));
        void pushToEngine();
    };

    // --- 真实悬浮滚动条相关状态 (完全复刻 CustomSelect) ---
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollRatio, setScrollRatio] = useState(0);
    const [thumbHeight, setThumbHeight] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [isScrolling, setIsScrolling] = useState(false);
    const scrollTimerRef = useRef<NodeJS.Timeout>();

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const maxScroll = scrollHeight - clientHeight;
        const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
        setScrollRatio(ratio);
        // CustomSelect 中最小滑块为 35
        setThumbHeight(Math.max((clientHeight / scrollHeight) * clientHeight, 35));
        setContainerHeight(clientHeight);
        setIsScrolling(true);
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 1000);
    };

    useEffect(() => {
        handleScroll();
    }, [latestValues]);

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
                <Tooltip content={t('sidebar.clearData')} position="bottom">
                <button
                    className="p-1 rounded opacity-30 hover:opacity-100 hover:bg-[var(--st-status-error-bg)] hover:text-[var(--st-status-error)] transition-all flex items-center justify-center cursor-pointer"
                    onClick={() => { if (activeSessionId) resetSession(activeSessionId); }}
                >
                    <IconTrash />
                </button>
                </Tooltip>
            </div>

            {/* 数据列表容器 */}
            <div className="flex-1 relative overflow-hidden group/menu">
                <style dangerouslySetInnerHTML={{
                    __html: `
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                    .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
                `}} />
                <div 
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="h-full w-full overflow-y-auto scrollbar-none overscroll-contain p-2.5 space-y-2.5"
                >
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
                    <>
                        {activeSchemes.map((scheme) => {
                            if (scheme.fields.length === 0) return null;
                            return (
                                <div key={scheme.id} className="mb-4 last:mb-0 space-y-2.5">
                                    <div className="text-[10px] font-bold text-[var(--sidebar-muted-foreground)] uppercase tracking-wide px-1 opacity-70 flex items-center gap-1.5 overflow-hidden">
                                        <span className="w-2 h-[1px] bg-[var(--sidebar-muted-foreground)] opacity-50 flex-shrink-0" />
                                        <span className="truncate">{scheme.name || t('sidebar.unnamedScheme') || '未命名方案'}</span>
                                        <span className="flex-1 h-[1px] bg-[var(--sidebar-muted-foreground)] opacity-50" />
                                    </div>
                                    {scheme.fields.map((fieldDef, localIndex) => {
                                        const key = fieldDef.name;
                                        const value = latestValues[key];
                                        const hasValue = value !== undefined;
                                        // 使用在方案内的索引（localIndex）使其与 ParserSidebar 保存默认色相一致
                                        const color = fieldDef.color ?? FIELD_COLORS[Math.max(0, localIndex) % FIELD_COLORS.length];

                                        return (
                                            <div key={key} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                <div className="flex items-center gap-2 justify-between mb-1.5">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <ColorPickerTrigger value={color} onChange={c => setFieldColor(scheme.id, key, c)} shape="circle" size={14} />
                                                        <span className="font-mono text-[12px] font-semibold truncate" style={{ color }}>{key}</span>
                                                    </div>
                                                    {hasValue && (
                                                        <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: '#4ade80', border: '1px solid rgba(74,222,128,0.5)', background: 'rgba(74,222,128,0.08)', lineHeight: 1.2 }}>LIVE</span>
                                                    )}
                                                </div>
                                                <div className="font-mono tabular-nums leading-none mb-1.5" style={{ fontSize: 22, fontWeight: 700, color: hasValue ? 'var(--app-foreground)' : 'rgba(255,255,255,0.15)' }}>
                                                    {hasValue ? Number(value!.toFixed(3)).toString() : '—'}
                                                </div>
                                                {/* 底部：原始字节公式行 */}
                                                <RawBytesRow
                                                    dataType={fieldDef.data_type}
                                                    multiplier={fieldDef.multiplier}
                                                    finalValue={hasValue ? value! : undefined}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        
                        {extraKeys.length > 0 && (
                            <div className="mb-4 last:mb-0 space-y-2.5">
                                <div className="text-[10px] font-bold text-[var(--sidebar-muted-foreground)] uppercase tracking-wide px-1 opacity-70 flex items-center gap-1.5 overflow-hidden mt-4">
                                    <span className="w-2 h-[1px] bg-[var(--sidebar-muted-foreground)] opacity-50 flex-shrink-0" />
                                    <span className="truncate">Raw / Unmapped</span>
                                    <span className="flex-1 h-[1px] bg-[var(--sidebar-muted-foreground)] opacity-50" />
                                </div>
                                {extraKeys.map((key, index) => {
                                    const value = latestValues[key];
                                    const hasValue = value !== undefined;
                                    const color = FIELD_COLORS[(fieldKeys.length + index) % FIELD_COLORS.length];

                                    return (
                                        <div key={key} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <div className="flex items-center gap-2 justify-between mb-1.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 5px ${color}80` }} />
                                                    <span className="font-mono text-[12px] font-semibold truncate" style={{ color }}>{key}</span>
                                                </div>
                                                {hasValue && (
                                                    <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: '#4ade80', border: '1px solid rgba(74,222,128,0.5)', background: 'rgba(74,222,128,0.08)', lineHeight: 1.2 }}>LIVE</span>
                                                )}
                                            </div>
                                            <div className="font-mono tabular-nums leading-none mb-1.5" style={{ fontSize: 22, fontWeight: 700, color: hasValue ? 'var(--app-foreground)' : 'rgba(255,255,255,0.15)' }}>
                                                {hasValue ? Number(value!.toFixed(3)).toString() : '—'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
                </div>

                {/* 完全悬浮的 React 组件级别滚动条 */}
                <div
                    className={`absolute right-[2px] transition-opacity duration-300 pointer-events-none z-50 ${isScrolling ? 'opacity-100' : 'opacity-0 group-hover/menu:opacity-60'}`}
                    style={{
                        top: `${scrollRatio * ((containerHeight || 0) - thumbHeight)}px`,
                        height: `${thumbHeight}px`,
                        width: '4px',
                        backgroundColor: 'var(--scrollbar-slider-hover-color)',
                        borderRadius: '4px',
                        display: thumbHeight >= containerHeight || containerHeight === 0 ? 'none' : 'block' // 内容没溢出时隐藏
                    }}
                />
            </div>

            {/* 状态栏 */}
            <div className="px-3 py-1.5 border-t border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
                <span className="text-[8px] font-mono text-[var(--sidebar-muted-foreground)] opacity-40">{allKeys.length} FIELDS</span>
                <span className="text-[8px] font-mono text-[var(--sidebar-muted-foreground)] opacity-30">60Hz</span>
            </div>
        </div>
    );
};
