/**
 * ParserSidebar.tsx
 * 协议解析规则配置面板 — 二期重构版
 */
import { useI18n } from '../../context/I18nContext';
import { useParserStore, ParserScheme, FieldDef, DataType } from '../../store/useParserStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from '../../context/SessionContext';
import { Switch } from '../common/Switch';




// ─── 默认颜色调色板 ────────────────────────────
export const FIELD_COLORS = [
    '#60a5fa', '#34d399', '#f59e0b', '#a78bfa',
    '#f87171', '#38bdf8', '#fb923c', '#4ade80',
    '#e879f9', '#facc15',
];

// ─── 工具函数 ──────────────────────────────────
const bufToHex = (arr: number[]) =>
    arr.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const hexToBuf = (hex: string) =>
    hex.split(/\s+/).filter(Boolean).map(x => parseInt(x, 16)).filter(x => !isNaN(x));
const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ─── 悬浮滚动条 ────────────────────────────────
const SCROLL_CSS = `
.ps-scroll::-webkit-scrollbar { width: 3px; }
.ps-scroll::-webkit-scrollbar-track { background: transparent; }
.ps-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
.ps-scroll:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-slider-color); }
`;

// ─── 统一输入框样式 ────────────────────────────
const INPUT_CLS =
    'w-full h-[28px] text-[12px] font-mono px-2 rounded-md outline-none transition-colors duration-150 ' +
    'bg-[var(--input-background)] border border-[var(--border-color)] ' +
    'text-[var(--app-foreground)] focus:border-[var(--accent-color)]';

// ─── 图标 ──────────────────────────────────────
const IconPlus = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
);
const IconTrash = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/>
    </svg>
);
const IconCopy = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.18s ease' }}>
        <polyline points="6,9 12,15 18,9"/>
    </svg>
);
const IconChevronRight = ({ open }: { open: boolean }) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}>
        <polyline points="9,18 15,12 9,6"/>
    </svg>
);

// ─── 颜色圆点（可点击）────────────────────────
export const ColorDot = ({ color, onChange }: { color: string; onChange: (c: string) => void }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <span
                className="w-2.5 h-2.5 rounded-full cursor-pointer flex-shrink-0 transition-transform hover:scale-125"
                style={{ background: color, boxShadow: `0 0 5px ${color}99` }}
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

// ─── Toggle 开关 ──────────────────────────────
const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button onClick={onChange} className="cursor-pointer flex-shrink-0" style={{ background: 'none', border: 'none', padding: 0 }}>
        <div
            className="relative w-8 h-4 rounded-full transition-colors duration-200 flex-shrink-0"
            style={{ background: checked ? 'var(--accent-color)' : 'rgba(255,255,255,0.12)' }}
        >
            <div
                className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
            />
        </div>
    </button>
);

// ══════════════════════════════════════════════
//  字段编辑卡片
// ══════════════════════════════════════════════
const FieldCard: React.FC<{
    field: FieldDef;
    index: number;
    color: string;
    onChange: (patch: Partial<FieldDef>) => void;
    onDelete: () => void;
    onColorChange: (c: string) => void;
}> = ({ field, index, color, onChange, onDelete, onColorChange }) => {
    const [open, setOpen] = useState(true);

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {/* 卡片头 */}
            <div
                className="px-3 py-2 flex items-center gap-2"
                style={{ background: 'rgba(255,255,255,0.04)' }}
            >
                <ColorDot color={color} onChange={onColorChange} />

                <input
                    className="flex-1 bg-transparent text-[12px] font-mono font-semibold outline-none min-w-0 border-b border-transparent focus:border-current transition-colors duration-150"
                    style={{ color, height: 20 }}
                    value={field.name}
                    placeholder="field_name"
                    spellCheck={false}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onChange({ name: e.target.value })}
                />

                <span className="text-[9px] font-mono flex-shrink-0 opacity-25" style={{ color: 'var(--sys-text-muted)' }}>#{index}</span>

                {/* 删除按钮 */}
                <button
                    title="删除字段"
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-all duration-150 cursor-pointer"
                    style={{ color: 'var(--sys-text-muted)', opacity: 0.6 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--st-status-error)'; (e.currentTarget as HTMLElement).style.background = 'var(--st-status-error-bg)'; (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sys-text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                >
                    <IconTrash />
                </button>

                {/* 折叠按钮 */}
                <button
                    title={open ? '折叠' : '展开'}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-all duration-150 cursor-pointer"
                    style={{ color: 'var(--sys-text-muted)', opacity: 0.6 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
                    onClick={() => setOpen(o => !o)}
                >
                    <IconChevron open={open} />
                </button>
            </div>

            {/* 字段详情 */}
            {open && (
                <div className="px-3 py-2.5 grid grid-cols-2 gap-x-2.5 gap-y-2" style={{ background: 'rgba(0,0,0,0.18)' }}>
                    <div>
                        <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--sys-text-muted)' }}>字节偏移 (含帧头)</label>
                        <input type="number" min={0} className={INPUT_CLS} value={field.offset}
                            onChange={e => onChange({ offset: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div>
                        <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--sys-text-muted)' }}>换算比例 (×)</label>
                        <input type="number" step="0.001" className={INPUT_CLS} value={field.multiplier}
                            onChange={e => onChange({ multiplier: parseFloat(e.target.value) || 1.0 })} />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--sys-text-muted)' }}>数据类型</label>
                        <select
                            className={INPUT_CLS}
                            value={field.data_type}
                            style={{ cursor: 'pointer' }}
                            onChange={e => onChange({ data_type: e.target.value as DataType })}
                        >
                            <optgroup label="── 1 字节 ──">
                                <option value="u8">U8 · 无符号</option>
                                <option value="i8">I8 · 有符号</option>
                            </optgroup>
                            <optgroup label="── 2 字节 ──">
                                <option value="u16_le">U16-LE · 小端</option>
                                <option value="u16_be">U16-BE · 大端</option>
                                <option value="i16_le">I16-LE · 有符号小端</option>
                                <option value="i16_be">I16-BE · 有符号大端</option>
                            </optgroup>
                            <optgroup label="── 4 字节 ──">
                                <option value="u32_le">U32-LE · 小端</option>
                                <option value="u32_be">U32-BE · 大端</option>
                                <option value="i32_le">I32-LE · 有符号小端</option>
                                <option value="i32_be">I32-BE · 有符号大端</option>
                                <option value="f32_le">F32-LE · 单精度小端</option>
                                <option value="f32_be">F32-BE · 单精度大端</option>
                            </optgroup>
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
};

// ══════════════════════════════════════════════
//  单个方案行（含内联编辑 + 展开编辑区）
// ══════════════════════════════════════════════
const SchemeRow: React.FC<{
    scheme: ParserScheme;
    isActive: boolean;
    usedByPorts: string[];
    onActivate: () => void;
    onUpdate: (s: ParserScheme) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    canDelete: boolean;
}> = ({ scheme, isActive, usedByPorts, onActivate, onUpdate, onDelete, onDuplicate, canDelete }) => {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
    const ctxRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭右键菜单
    useEffect(() => {
        if (!ctxMenu) return;
        const close = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
                setCtxMenu(null);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [ctxMenu]);

    const updateField = (i: number, patch: Partial<FieldDef>) =>
        onUpdate({ ...scheme, fields: scheme.fields.map((f, idx) => idx === i ? { ...f, ...patch } : f) });
    const deleteField = (i: number) =>
        onUpdate({ ...scheme, fields: scheme.fields.filter((_, idx) => idx !== i) });
    const addField = () =>
        onUpdate({ ...scheme, fields: [...scheme.fields, { name: `field_${scheme.fields.length}`, offset: 0, data_type: 'u16_be' as const, multiplier: 1.0, color: FIELD_COLORS[scheme.fields.length % FIELD_COLORS.length] }] });

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${isActive ? 'var(--accent-color)' : 'rgba(255,255,255,0.07)'}`, transition: 'border-color 0.15s', position: 'relative' }}>
            {/* 方案行头 */}
            <div
                className="flex items-center gap-2 px-2.5 py-2 transition-colors duration-150 cursor-pointer"
                style={{ background: isActive ? 'var(--sys-bg-active)' : 'rgba(255,255,255,0.02)' }}
                onClick={onActivate}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
            >
                {/* 图标替代单选框 */}
                <span className="flex-shrink-0 flex items-center justify-center opacity-60" style={{ width: 14, height: 14 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                    </svg>
                </span>

                {/* 内联方案名 */}
                <input
                    className="flex-1 bg-transparent text-[12px] font-mono font-medium outline-none min-w-0 border-b border-transparent focus:border-current transition-colors duration-150"
                    style={{ color: isActive ? 'var(--app-foreground)' : 'var(--sys-text-secondary)', height: 20 }}
                    value={scheme.name}
                    spellCheck={false}
                    onChange={e => onUpdate({ ...scheme, name: e.target.value })}
                />

                {/* 运行中标签 -> 正在使用的端口 */}
                {usedByPorts.length > 0 && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded flex-shrink-0 font-bold max-w-[80px] truncate"
                        title={usedByPorts.join(', ')}
                        style={{ color: 'var(--st-status-success)', border: '1px solid var(--st-status-success)', background: 'var(--st-status-success-bg)', whiteSpace: 'nowrap' }}>
                        被 {usedByPorts.length} 个端口使用
                    </span>
                )}

                {/* 展开折叠 — 放大 */}
                <button
                    title={open ? '折叠' : '展开'}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer opacity-40 hover:opacity-90 hover:bg-white/10 transition-all duration-150"
                    style={{ color: 'var(--sys-text-muted)' }}
                    onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                >
                    <IconChevron open={open} />
                </button>
            </div>

            {/* 右键菜单 */}
            {ctxMenu && (
                <div
                    ref={ctxRef}
                    className="fixed z-50 rounded-lg overflow-hidden shadow-xl py-1"
                    style={{
                        left: ctxMenu.x, top: ctxMenu.y,
                        background: 'var(--menu-background, #1e1e2e)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        minWidth: 140,
                    }}
                >
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors duration-100"
                        style={{ color: 'var(--app-foreground)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        onClick={() => { onDuplicate(); setCtxMenu(null); }}
                    >
                        <IconCopy />
                        <span>复制方案</span>
                    </button>
                    {canDelete && (
                        <button
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors duration-100"
                            style={{ color: 'var(--st-status-error)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--st-status-error-bg)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            onClick={() => { onDelete(); setCtxMenu(null); }}
                        >
                            <IconTrash />
                            <span>删除方案</span>
                        </button>
                    )}
                </div>
            )}

            {/* 展开的编辑区 */}
            {open && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* 帧头 HEX + 总帧长两列并排 */}
                    <div className="px-3 pt-2.5 pb-2 grid grid-cols-2 gap-x-2.5">
                        <div>
                            <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--sys-text-muted)' }}>帧头 HEX</label>
                            <input type="text" spellCheck={false} className={INPUT_CLS}
                                placeholder="AA 55"
                                value={bufToHex(scheme.frame_header)}
                                onChange={e => onUpdate({ ...scheme, frame_header: hexToBuf(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--sys-text-muted)' }}>总帧长 (字节)</label>
                            <input
                                type="number" min={1} className={INPUT_CLS}
                                value={scheme.min_frame_len ?? 10}
                                onChange={e => onUpdate({ ...scheme, min_frame_len: Math.max(1, parseInt(e.target.value) || 10) })}
                            />
                            <p className="text-[9px] mt-1 leading-none" style={{ color: 'var(--sys-text-muted)', opacity: 0.45 }}>含帧头在内，达到此字节数才切帧</p>
                        </div>
                    </div>

                    {/* 字段列表头 */}
                    <div className="px-3 pb-1 flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--sys-text-muted)' }}>
                            {t('sidebar.fields') || 'FIELDS'} · {scheme.fields.length}
                        </span>
                        <button
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors duration-150"
                            style={{ color: 'var(--accent-color)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-color)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-color)'; }}
                            onClick={addField}
                        >
                            <IconPlus />{t('sidebar.addField') || '添加字段'}
                        </button>
                    </div>

                    {/* 字段空态 */}
                    {scheme.fields.length === 0 && (
                        <div className="flex flex-col items-center py-6 gap-2 text-[10px]" style={{ color: 'var(--sys-text-muted)', opacity: 0.35 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
                            暂无字段
                        </div>
                    )}

                    {/* 字段卡片 */}
                    <div className="px-3 pb-3 space-y-2 mt-1">
                        {scheme.fields.map((field, index) => {
                            const color = field.color ?? FIELD_COLORS[index % FIELD_COLORS.length];
                            return (
                                <FieldCard
                                    key={index}
                                    field={field}
                                    index={index}
                                    color={color}
                                    onChange={patch => updateField(index, patch)}
                                    onDelete={() => deleteField(index)}
                                    onColorChange={c => updateField(index, { color: c })}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ══════════════════════════════════════════════
//  ParserSidebar 主组件
// ══════════════════════════════════════════════
export const ParserSidebar: React.FC = () => {
    const { t } = useI18n();
    const { config, isLoading, error, loadConfig, deleteScheme, setActiveScheme, updateScheme, pushToEngine } = useParserStore();
    const { isVisible: dataViewVisible, toggleVisible } = useDashboardStore();
    const { sessions } = useSession();

    const [schemesOpen, setSchemesOpen] = useState(true);
    const initialized = useRef(false);
    const lastPushedConfigRef = useRef<string>('');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { loadConfig(); }, []); // eslint-disable-line

    // 初始化：记录当前 config 避免进入时误触发保存
    useEffect(() => {
        if (config && !initialized.current) {
            lastPushedConfigRef.current = JSON.stringify(config);
            initialized.current = true;
        }
    }, [config]);

    // 静默防抖保存
    const scheduleAutoSave = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            const { config: c } = useParserStore.getState();
            if (!c) return;
            const currentStr = JSON.stringify(c);
            if (currentStr === lastPushedConfigRef.current) return;
            try { await pushToEngine(); lastPushedConfigRef.current = currentStr; } catch { /* 静默 */ }
        }, 600);
    }, [pushToEngine]);

    useEffect(() => {
        if (!config || !initialized.current) return;
        if (JSON.stringify(config) === lastPushedConfigRef.current) return;
        scheduleAutoSave();
    }, [config, scheduleAutoSave]);

    // 复制方案
    const duplicateScheme = (scheme: ParserScheme) => {
        const { config: c } = useParserStore.getState();
        if (!c) return;
        const newScheme: ParserScheme = {
            ...scheme,
            id: generateId(),
            name: `${scheme.name} 副本`,
        };
        useParserStore.setState({
            config: { ...c, schemes: [...c.schemes, newScheme] }
        });
    };

    if (error) return <div className="p-4 text-[11px]" style={{ color: 'var(--st-status-error)' }}>{error}</div>;
    if (isLoading && !config) return <div className="p-4 text-[11px] animate-pulse" style={{ color: 'var(--sys-text-muted)' }}>正在加载…</div>;
    if (!config) return null;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[var(--serial-config-bg)] text-[var(--serial-config-text)]">
            <style>{SCROLL_CSS}</style>

            {/* 实时数据开关——和 AutoReplySidebar 完全一致：px-4 py-2 + direct Switch */}
            <div className="px-4 py-2 border-b border-[var(--border-color)] shrink-0">
                <Switch
                    label="实时数据"
                    checked={dataViewVisible}
                    onChange={toggleVisible}
                />
            </div>

            {/* ══ 方案列表滚动区 ══ */}
            <div className="flex-1 overflow-y-auto overscroll-contain ps-scroll">
                {/* 方案区标题行（可折叠）——与 MqttConfigPanel Broker Connection 标题行完全一致 */}
                <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[var(--serial-config-bg)] sticky top-0 flex items-center justify-between cursor-pointer hover:bg-[var(--list-hover-background)] border-b border-[var(--border-color)] z-10"
                    onClick={() => setSchemesOpen(o => !o)}
                >
                    <div className="flex items-center gap-2">
                        {schemesOpen
                            ? <IconChevron open={true} />
                            : <IconChevronRight open={false} />}
                        <span>{t('sidebar.schemes') || 'SCHEMES'} · {config.schemes.length}</span>
                    </div>
                    <button
                        className="text-[10px] px-2 py-0.5 rounded-sm text-[var(--button-foreground)] bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] transition-colors cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); const { addScheme } = useParserStore.getState(); addScheme(); setSchemesOpen(true); }}
                    >
                        + {t('sidebar.addScheme') || '新建'}
                    </button>
                </div>

                {/* 方案列表 */}
                {schemesOpen && (
                    <div className="px-3 py-2 space-y-2 pb-8">
                        {config.schemes.map(scheme => (
                            <SchemeRow
                                key={scheme.id}
                                scheme={scheme}
                                isActive={scheme.id === config.active_id}
                                usedByPorts={sessions.filter((s: any) => s.config.parserSchemeId === scheme.id).map((s: any) => s.config.name)}
                                canDelete={config.schemes.length > 1}
                                onActivate={() => setActiveScheme(scheme.id)}
                                onUpdate={s => updateScheme(scheme.id, () => s)}
                                onDelete={() => deleteScheme(scheme.id)}
                                onDuplicate={() => duplicateScheme(scheme)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
