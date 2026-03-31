/**
 * ParserSidebar.tsx
 * 协议解析规则配置面板 — 二期重构版
 */
import { useI18n } from '../../context/I18nContext';
import { useParserStore, type ParserScheme, type FieldDef, type DataType, FIELD_COLORS } from '../../store/useParserStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from '../../context/SessionContext';
import { Switch } from '../common/Switch';
import { Tooltip } from '../common/Tooltip';
import { GripVertical } from 'lucide-react';
import { ColorPickerTrigger } from '../theme/ColorPickerShared';

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';






// ─── 工具函数 ──────────────────────────────────
const bufToHex = (arr: number[]) =>
    arr.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const hexToBuf = (hex: string) =>
    hex.split(/\s+/).filter(Boolean).map(x => parseInt(x, 16)).filter(x => !isNaN(x));

// ─── 统一输入框样式 ────────────────────────────
const INPUT_CLS =
    'w-full h-[28px] text-[12px] font-mono px-2 rounded-sm outline-none transition-colors duration-150 ' +
    'bg-[var(--input-background)] border border-[var(--input-border-color)] ' +
    'text-[var(--app-foreground)] focus:border-[var(--focus-border-color)]';

// ─── 图标 ──────────────────────────────────────
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

// ══════════════════════════════════════════════
//  字段编辑卡片
// ══════════════════════════════════════════════
const FieldCard: React.FC<{
    field: FieldDef;
    index: number;
    color: string;
    onChange: (patch: Partial<FieldDef>) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onColorChange: (c: string) => void;
}> = ({ field, index, color, onChange, onDelete, onDuplicate, onColorChange }) => {
    const [open, setOpen] = useState(true);

    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging
    } = useSortable({ id: field.name || `field_${index}` });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
    };

    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
    const ctxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ctxMenu) return;
        const close = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [ctxMenu]);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`rounded-sm overflow-hidden border transition-colors duration-150 ${
                isDragging ? 'border-[var(--focus-border-color)] opacity-60 shadow-lg' :
                open ? 'border-[var(--border-color)]' : 'border-[var(--widget-border-color)]'
            }`}
        >
            {/* 卡片头 */}
            <div 
                className={`px-3 py-2 flex items-center gap-2 bg-[var(--widget-background)] cursor-pointer select-none ${open ? '' : 'hover:bg-[var(--list-hover-background)]'}`}
                onClick={() => setOpen(o => !o)}
                onContextMenu={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY });
                }}
            >
                {/* 拖拽手柄 */}
                <span
                    {...attributes}
                    {...listeners}
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--activitybar-inactive-foreground)] opacity-30 hover:opacity-80 transition-opacity flex items-center justify-center p-1 -ml-1 outline-none"
                    onClick={e => e.stopPropagation()}
                >
                    <GripVertical size={13} pointerEvents="none" />
                </span>

                <div onClick={e => e.stopPropagation()}>
                    <ColorPickerTrigger value={color} onChange={onColorChange} shape="circle" size={14} />
                </div>

                <input
                    className="flex-1 bg-transparent text-[12px] font-mono font-semibold outline-none min-w-0 border-b border-transparent focus:border-[var(--focus-border-color)] transition-colors duration-150 text-[var(--app-foreground)]"
                    style={{ height: 20 }}
                    value={field.name}
                    placeholder="field_name"
                    spellCheck={false}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onChange({ name: e.target.value })}
                />

                {/* 折叠按钮外观（作为状态指示，不再独立响应点击） */}
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center pointer-events-none text-[var(--activitybar-inactive-foreground)] opacity-50">
                    <IconChevron open={open} />
                </div>
            </div>

            {/* 右键菜单（含复制、删除） */}
            {ctxMenu && (
                <div
                    ref={ctxRef}
                    className="fixed z-[5000] rounded-sm overflow-hidden shadow-xl py-1 bg-[var(--st-menu-bg)] border border-[var(--menu-border-color)] min-w-[140px]"
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                >
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)]"
                        onClick={(e) => { e.stopPropagation(); onDuplicate(); setCtxMenu(null); }}
                    >
                        <IconCopy />
                        <span>复制字段</span>
                    </button>
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors text-[var(--st-status-error)] hover:bg-[var(--st-status-error-bg)]"
                        onClick={(e) => { e.stopPropagation(); onDelete(); setCtxMenu(null); }}
                    >
                        <IconTrash />
                        <span>删除字段</span>
                    </button>
                </div>
            )}

            {/* 字段详情 */}
            {open && (
                <div className="px-3 py-2.5 grid grid-cols-2 gap-x-2.5 gap-y-2 bg-[var(--input-background)] border-t border-[var(--border-color)] cursor-default" onClick={e => e.stopPropagation()}>
                    <div>
                        <label className="block text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide mb-1 whitespace-nowrap truncate">字节偏移 (含帧头)</label>
                        <input type="number" min={0} className={INPUT_CLS} value={field.offset}
                            onChange={e => onChange({ offset: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div>
                        <label className="block text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide mb-1 whitespace-nowrap truncate">换算比例 (×)</label>
                        <input type="number" step="0.001" className={INPUT_CLS} value={field.multiplier}
                            onChange={e => onChange({ multiplier: parseFloat(e.target.value) || 1.0 })} />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide mb-1 whitespace-nowrap truncate">数据类型</label>
                        <div className="relative w-full">
                            <select
                                className={INPUT_CLS + ' cursor-pointer appearance-none pr-7'}
                                value={field.data_type}
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
                            {/* 自定义箭头 */}
                            <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-50 text-[var(--input-placeholder-color)]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ════════════════════════════════════════════
//  单个方案行 — 统一模板（拖拽排序 + 右键菜单）
// ════════════════════════════════════════════
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
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [ctxMenu]);

    const updateField = (i: number, patch: Partial<FieldDef>) =>
        onUpdate({ ...scheme, fields: scheme.fields.map((f, idx) => idx === i ? { ...f, ...patch } : f) });
    const deleteField = (i: number) =>
        onUpdate({ ...scheme, fields: scheme.fields.filter((_, idx) => idx !== i) });
    const duplicateField = (i: number) => {
        const field = scheme.fields[i];
        const newFields = [...scheme.fields];
        newFields.splice(i + 1, 0, { ...field, name: `${field.name}_copy` });
        onUpdate({ ...scheme, fields: newFields });
    };
    const addField = () =>
        onUpdate({ ...scheme, fields: [...scheme.fields, { name: `field_${scheme.fields.length}`, offset: 0, data_type: 'u16_be' as const, multiplier: 1.0, color: FIELD_COLORS[scheme.fields.length % FIELD_COLORS.length] }] });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleFieldDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = scheme.fields.findIndex(f => (f.name || `field_unknown`) === active.id || `field_${scheme.fields.indexOf(f)}` === active.id);
            const newIndex = scheme.fields.findIndex(f => (f.name || `field_unknown`) === over.id || `field_${scheme.fields.indexOf(f)}` === over.id);

            // Fallback for names
            const safeOldIndex = oldIndex !== -1 ? oldIndex : scheme.fields.findIndex((_, idx) => `field_${idx}` === active.id);
            const safeNewIndex = newIndex !== -1 ? newIndex : scheme.fields.findIndex((_, idx) => `field_${idx}` === over.id);

            if (safeOldIndex !== -1 && safeNewIndex !== -1 && safeOldIndex !== safeNewIndex) {
                const newFields = arrayMove(scheme.fields, safeOldIndex, safeNewIndex);
                onUpdate({ ...scheme, fields: newFields });
            }
        }
    };

    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging
    } = useSortable({ id: scheme.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`rounded-sm overflow-hidden border transition-colors duration-150 relative ${
                isDragging ? 'border-[var(--focus-border-color)] opacity-60 shadow-lg' :
                (isActive || open) ? 'border-[var(--focus-border-color)]' : 'border-[var(--border-color)]'
            }`}
        >
            {/* 方案头部 — 左：拖拽+圆点 • 中：名称只读 • 右：折叠箭头 */}
            <div
                className={`flex items-center gap-1.5 px-1.5 py-2 transition-colors duration-150 select-none bg-[var(--widget-background)] ${open ? '' : 'hover:bg-[var(--list-hover-background)]'} cursor-pointer`}
                onClick={() => setOpen(o => !o)}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
            >
                {/* 拖拽手柄 — 最左侧 */}
                <Tooltip content={t('settings.modules.dragToReorder')} position="top">
                <span
                    {...attributes}
                    {...listeners}
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--activitybar-inactive-foreground)] opacity-30 hover:opacity-80 transition-opacity outline-none"
                    onClick={e => e.stopPropagation()}
                >
                    <GripVertical size={13} pointerEvents="none" />
                </span>
                </Tooltip>

                {/* 激活圆点 — w-3 h-3（比规则圆点稍大） */}
                <Tooltip content={isActive ? t('sidebar.schemeActive') : t('sidebar.activateScheme')} position="top">
                <span
                    className={`flex-shrink-0 w-3 h-3 rounded-full transition-colors cursor-pointer border-[1.5px] ${
                        isActive ? 'bg-[var(--focus-border-color)] border-[var(--focus-border-color)]' : 'bg-transparent border-[var(--activitybar-inactive-foreground)] opacity-50 hover:opacity-100 hover:border-[var(--focus-border-color)]'
                    }`}
                    onClick={e => { e.stopPropagation(); onActivate(); }}
                />
                </Tooltip>

                {/* 方案名 — 只读文本，展开后才可编辑 */}
                <span className={`flex-1 text-[12px] truncate font-medium ${
                    isActive ? 'text-[var(--app-foreground)]' : 'text-[var(--activitybar-inactive-foreground)]'
                }`}>
                    {scheme.name || t('sidebar.unnamedScheme')}
                </span>

                {/* 运行中标签 */}
                {usedByPorts.length > 0 && (
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded-sm flex-shrink-0 font-bold max-w-[70px] truncate text-[var(--st-status-success)] border border-[var(--st-status-success)] whitespace-nowrap"
                        title={usedByPorts.join(', ')}
                    >
                        ·{usedByPorts.length}口
                    </span>
                )}

                {/* 展开/折叠 — 最右側 */}
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center pointer-events-none text-[var(--activitybar-inactive-foreground)] opacity-50">
                    <IconChevron open={open} />
                </div>
            </div>

            {/* 右键菜单（含复制、删除） */}
            {ctxMenu && (
                <div
                    ref={ctxRef}
                    className="fixed z-[5000] rounded-sm overflow-hidden shadow-xl py-1 bg-[var(--st-menu-bg)] border border-[var(--menu-border-color)] min-w-[140px]"
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                >
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)]"
                        onClick={() => { onDuplicate(); setCtxMenu(null); }}
                    >
                        <IconCopy />
                        <span>复制方案</span>
                    </button>
                    {canDelete && (
                        <button
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left cursor-pointer transition-colors text-[var(--st-status-error)] hover:bg-[var(--st-status-error-bg)]"
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
                <div className="border-t border-[var(--border-color)]">
                    {/* 方案名称编辑，仅展开后可用 */}
                    <div className="px-3 pt-2.5 pb-1">
                        <label className="block text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide mb-1">方案名称</label>
                        <input
                            className={INPUT_CLS}
                            value={scheme.name}
                            spellCheck={false}
                            placeholder="方案名称"
                            onChange={e => onUpdate({ ...scheme, name: e.target.value })}
                        />
                    </div>
                    {/* 帧头 HEX + 总帧长两列并排 */}
                    <div className="px-3 pt-1 pb-2 grid grid-cols-2 gap-x-2.5 bg-[var(--input-background)]">
                        <div>
                            <label className="block text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide mb-1">帧头 HEX</label>
                            <input type="text" spellCheck={false} className={INPUT_CLS}
                                placeholder="AA 55"
                                value={bufToHex(scheme.frame_header)}
                                onChange={e => onUpdate({ ...scheme, frame_header: hexToBuf(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-[11px] text-[var(--serial-config-label)] opacity-80 font-medium uppercase tracking-wide mb-1">总帧长 (字节)</label>
                            <input
                                type="number" min={1} className={INPUT_CLS}
                                value={scheme.min_frame_len ?? 10}
                                onChange={e => onUpdate({ ...scheme, min_frame_len: Math.max(1, parseInt(e.target.value) || 10) })}
                            />
                            <p className="text-[10px] mt-1 leading-none text-[var(--activitybar-inactive-foreground)] opacity-60">含帧头在内</p>
                        </div>
                    </div>

                    {/* 字段列表 */}
                    <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[var(--serial-config-bg)] flex items-center justify-between border-t border-[var(--border-color)]">
                        <span className="text-[var(--serial-config-label)] opacity-80">
                            {t('sidebar.fields') || 'FIELDS'} · {scheme.fields.length}
                        </span>
                        <button
                            className="text-[10px] px-2 py-0.5 rounded-sm text-[var(--button-foreground)] bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] transition-colors cursor-pointer"
                            onClick={addField}
                        >
                            + {t('sidebar.addField') || '添加字段'}
                        </button>
                    </div>

                    {scheme.fields.length === 0 && (
                        <div className="flex flex-col items-center py-6 gap-2 text-[11px] text-[var(--activitybar-inactive-foreground)] opacity-40">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
                            {t('sidebar.noFields')}
                        </div>
                    )}

                    <div className="px-3 pb-3 space-y-2 mt-1">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleFieldDragEnd}>
                            <SortableContext 
                                items={scheme.fields.map((f, i) => f.name || `field_${i}`)} 
                                strategy={verticalListSortingStrategy}
                            >
                                {scheme.fields.map((field, i) => {
                                    const color = field.color ?? FIELD_COLORS[i % FIELD_COLORS.length];
                                    const computedId = field.name || `field_${i}`;
                                    return (
                                        <FieldCard
                                            key={computedId}
                                            field={field}
                                            index={i}
                                            color={color}
                                            onChange={patch => updateField(i, patch)}
                                            onDelete={() => deleteField(i)}
                                            onDuplicate={() => duplicateField(i)}
                                            onColorChange={c => updateField(i, { color: c })}
                                        />
                                    );
                                })}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
            )}
        </div>
    );
};

// ════════════════════════════════════════════
//  ParserSidebar 主组件
// ════════════════════════════════════════════
export const ParserSidebar: React.FC = () => {
    const { t } = useI18n();
    const { config, isLoading, error, loadConfig, deleteScheme, toggleActiveScheme, updateScheme, pushToEngine, reorderSchemes, duplicateScheme } = useParserStore();
    const { isVisible: dataViewVisible, toggleVisible } = useDashboardStore();
    const { sessions } = useSession();

    const [schemesOpen, setSchemesOpen] = useState(true);
    const initialized = useRef(false);
    const lastPushedConfigRef = useRef<string>('');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- 真实悬浮滚动条状态 ---
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
        setThumbHeight(Math.max((clientHeight / scrollHeight) * clientHeight, 35));
        setContainerHeight(clientHeight);
        setIsScrolling(true);
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 1000);
    };

    useEffect(() => {
        if (config) handleScroll();
    }, [config, schemesOpen]);

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

    useEffect(() => {
        if (!config || !initialized.current) return;
        if (JSON.stringify(config) === lastPushedConfigRef.current) return;
        scheduleAutoSave();
    }, [config, scheduleAutoSave]);

    // 拖拽排序处理
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = config!.schemes.findIndex(s => s.id === active.id);
            const newIndex = config!.schemes.findIndex(s => s.id === over.id);
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                reorderSchemes(oldIndex, newIndex);
            }
        }
    };

    if (error) return <div className="p-4 text-[11px] text-[var(--st-status-error)]">{error}</div>;
    if (isLoading && !config) return <div className="p-4 text-[11px] animate-pulse text-[var(--activitybar-inactive-foreground)] opacity-60">正在加载…</div>;
    if (!config) return null;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[var(--serial-config-bg)] text-[var(--serial-config-text)]">
            {/* 实时数据开关——和 AutoReplySidebar 完全一致：px-4 py-2 + direct Switch */}
            <div className="px-4 py-2 border-b border-[var(--border-color)] shrink-0">
                <Switch
                    label="实时数据"
                    checked={dataViewVisible}
                    onChange={toggleVisible}
                />
            </div>

            {/* ══ 方案列表滚动区（真实悬浮滚动条层） ══ */}
            <div className="flex-1 min-h-0 relative">
                <div 
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="h-full overflow-y-auto overscroll-contain scrollbar-none"
                >
                    {/* 方案区标题行（可折叠）——与 MqttConfigPanel Broker Connection 标题行完全一致 */}
                    <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase bg-[var(--serial-config-bg)] sticky top-0 flex items-center justify-between cursor-pointer hover:bg-[var(--list-hover-background)] border-b border-[var(--border-color)] z-10"
                        onClick={() => { setSchemesOpen(o => !o); setTimeout(handleScroll, 10); }}
                    >
                        <div className="flex items-center gap-2">
                            {schemesOpen
                                ? <IconChevron open={true} />
                                : <IconChevronRight open={false} />}
                            <span>{t('sidebar.schemes') || 'SCHEMES'} · {config.schemes.length}</span>
                        </div>
                        <button
                            className="text-[10px] px-2 py-0.5 rounded-sm text-[var(--button-foreground)] bg-[var(--button-background)] hover:bg-[var(--button-hover-background)] transition-colors cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); const { addScheme } = useParserStore.getState(); addScheme(); setSchemesOpen(true); setTimeout(handleScroll, 10); }}
                        >
                            + {t('sidebar.addScheme') || '新建'}
                        </button>
                    </div>

                    {/* 方案列表 */}
                    {schemesOpen && (
                        <div className="px-2 py-2 space-y-1.5 pb-6">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
                                <SortableContext items={config.schemes.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                    {config.schemes.map((scheme) => (
                                        <SchemeRow
                                            key={scheme.id}
                                            scheme={scheme}
                                            isActive={config.active_ids.includes(scheme.id)}
                                            usedByPorts={sessions.filter((s: unknown) => (s as { config?: { parserSchemeIds?: string[]; parserSchemeId?: string; name?: string } }).config?.parserSchemeIds?.includes(scheme.id) || (s as { config?: { parserSchemeId?: string } }).config?.parserSchemeId === scheme.id).map((s: unknown) => (s as { config: { name: string } }).config.name)}
                                            canDelete={config.schemes.length > 1}
                                            onActivate={() => toggleActiveScheme(scheme.id)}
                                            onUpdate={s => updateScheme(scheme.id, () => s)}
                                            onDelete={() => deleteScheme(scheme.id)}
                                            onDuplicate={() => duplicateScheme(scheme)}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                        </div>
                    )}
                </div>

                {/* 悬浮滚动条 Thumb */}
                {containerHeight > 0 && thumbHeight < containerHeight && (
                    <div className="absolute right-[2px] top-0 bottom-0 w-[4px] pointer-events-none z-[100]">
                        <div
                            className="w-full rounded-full transition-opacity transition-colors duration-300"
                            style={{
                                height: thumbHeight,
                                transform: `translateY(${scrollRatio * (containerHeight - thumbHeight)}px)`,
                                backgroundColor: isScrolling ? 'var(--scrollbar-slider-active-color)' : 'var(--scrollbar-slider-color)',
                                opacity: isScrolling ? 0.8 : 0
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
