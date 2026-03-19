import { useState, useRef, useCallback } from 'react';
import { Search, RotateCcw, Download, Upload, Check, FolderOpen, FileJson, Settings, GripVertical, Files, Monitor } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useI18n } from '../../context/I18nContext';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
import { Switch } from '../common/Switch';
import { useSettingsActions } from './useSettingsActions';
import { FactoryResetDialog } from './SettingsComponents';
import { useFeatureManager } from '../../context/FeatureContextShared';
import { FEATURE_REGISTRY } from '../../features/registry';
import { KeybindingInput } from '../common/KeybindingInput';
import { DEFAULT_KEYBINDINGS, type KeybindingAction } from '../../utils/keybindings';
import type { ThemeImages } from '../../types/theme';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
    arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── 分组容器 ─────────────────────────────────────────────────────────────────
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-8">
        <h3 className="text-[11px] font-bold text-[var(--st-settings-title-text)] opacity-50 uppercase tracking-widest mb-3 px-2 border-l-2 border-[var(--focus-border-color)] ml-[-8px] pl-[6px]">
            {title}
        </h3>
        <div className="flex flex-col bg-[var(--settings-editor-bg)] rounded border border-[var(--border-color)] overflow-hidden">
            {children}
        </div>
    </div>
);

// ─── 普通设置行 ───────────────────────────────────────────────────────────────
const SettingRow = ({
    label,
    description,
    children,
    stackContent = false,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
    stackContent?: boolean;
}) => (
    <div className={`py-3 border-b border-[var(--settings-row-hover-background)] last:border-0 hover:bg-[var(--list-hover-background)] px-3 ${stackContent ? 'flex flex-col gap-2' : 'flex items-center justify-between'}`}>
        <div className={`flex flex-col ${stackContent ? '' : 'flex-1 mr-4'}`}>
            <label className="text-[13px] text-[var(--st-settings-text)] font-medium">{label}</label>
            {description && (
                <p className="text-[11px] text-[var(--input-placeholder-color)] mt-0.5">{description}</p>
            )}
        </div>
        <div className={stackContent ? '' : 'flex-shrink-0'}>{children}</div>
    </div>
);

// ─── 复选框 ───────────────────────────────────────────────────────────────────
const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div
        onClick={onChange}
        className={`w-4 h-4 border flex items-center justify-center cursor-pointer transition-colors ${checked
            ? 'bg-[var(--checkbox-background)] border-[var(--checkbox-border-color)]'
            : 'bg-[var(--input-background)] border-[var(--input-border-color)]'
            }`}
    >
        {checked && <Check size={12} className="text-[var(--checkbox-foreground)]" />}
    </div>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export const SettingsEditor = () => {
    const { config, availableThemes, loadThemes, updateConfig, updateUI, setTheme } =
        useSettings();
    const { t } = useI18n();
    const { features, activateFeature, deactivateFeature } = useFeatureManager();
    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Factory Reset State
    const [showFactoryReset, setShowFactoryReset] = useState(false);
    const [resetInput, setResetInput] = useState('');
    const [showBgSettings, setShowBgSettings] = useState(false);

    // ── 操作函数和字体列表（委托给 Hook） ──
    const { handleImport, handleDownload, handleReset, performFactoryReset, finalFontList } = useSettingsActions();

    // 通用样式
    const inputCls =
        'bg-[var(--input-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] text-[13px] px-2 h-7 outline-none focus:border-[var(--focus-border-color)] rounded-[4px]';

    // ── 普通设置区块数据 ──
    type SettingItem = { label: string; description?: string; render: () => React.ReactNode };
    const settingSections: { title: string; items: SettingItem[] }[] = [
        {
            title: t('settings.groups.appearance'),
            items: [
                {
                    label: t('settings.appearance.colorScheme'),
                    description: t('settings.appearance.colorSchemeDesc'),
                    render: () => (
                        <div
                            className="flex items-center gap-1 w-56"
                            onClickCapture={() => {
                                // 任何点击配色方案这一行的行为，都静默尝试刷新一下可用主题列表
                                loadThemes();
                            }}
                        >
                            <div className="flex-1 min-w-0">
                                <CustomSelect
                                    items={availableThemes.map(th => ({ label: th.name, value: th.id }))}
                                    value={config.theme}
                                    onChange={(val) => setTheme(val)}
                                />
                            </div>
                            <Tooltip content={t('settings.openThemeFolder')} position="top">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.themeAPI?.openFolder?.();
                                    }}
                                    className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors cursor-pointer flex-shrink-0"
                                >
                                    <FolderOpen size={14} />
                                </button>
                            </Tooltip>
                            <Tooltip content={t('settings.openThemeFile')} position="top">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const currentDef = availableThemes.find(t => t.id === config.theme);
                                        if (currentDef) {
                                            window.themeAPI?.openFile?.(currentDef.id);
                                        }
                                    }}
                                    className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors cursor-pointer flex-shrink-0"
                                >
                                    <FileJson size={14} />
                                </button>
                            </Tooltip>
                        </div>
                    ),
                },
                {
                    label: t('settings.appearance.language'),
                    description: t('settings.appearance.languageDesc'),
                    render: () => (
                        <div className="w-56">
                            <CustomSelect
                                items={[
                                    { label: t('settings.appearance.languages.zh-CN'), value: 'zh-CN' },
                                    { label: t('settings.appearance.languages.en-US'), value: 'en-US' },
                                ]}
                                value={config.language}
                                onChange={(val) => updateConfig({ language: val as 'zh-CN' | 'en-US' })}
                            />
                        </div>
                    ),
                },
            ],
        },
        {
            title: t('settings.groups.layout'),
            items: [
                {
                    label: t('settings.layout.sidebarPosition'),
                    description: t('settings.layout.sidebarPositionDesc'),
                    render: () => (
                        <div className="w-56">
                            <CustomSelect
                                items={[
                                    { label: t('settings.layout.sidebarLeft'), value: 'left' },
                                    { label: t('settings.layout.sidebarRight'), value: 'right' },
                                ]}
                                value={config.ui.sidebarPosition}
                                onChange={(val) => updateUI({ sidebarPosition: val as 'left' | 'right' })}
                            />
                        </div>
                    ),
                },
                {
                    label: t('settings.layout.showStatusBar'),
                    description: t('settings.layout.showStatusBarDesc'),
                    render: () => (
                        <Checkbox checked={config.ui.showStatusBar} onChange={() => updateUI({ showStatusBar: !config.ui.showStatusBar })} />
                    ),
                },
            ],
        },
        {
            title: t('settings.groups.typography'),
            items: [
                {
                    label: t('settings.typography.fontFamily'),
                    description: t('settings.typography.fontFamilyDesc'),
                    render: () => (
                        <div className="w-56">
                            <CustomSelect
                                items={finalFontList}
                                value={config.typography.fontFamily}
                                onChange={(val) => updateConfig(prev => ({ ...prev, typography: { ...prev.typography, fontFamily: val } }))}
                            />
                        </div>
                    ),
                },
            ],
        },
        {
            title: t('settings.groups.logFormat'),
            items: [
                {
                    label: t('settings.logFormat.timestampFormat'),
                    description: t('settings.logFormat.timestampFormatDesc'),
                    render: () => (
                        <input
                            type="text"
                            placeholder="HH:mm:ss.SSS"
                            value={config.timestampFormat}
                            onChange={e => updateConfig({ timestampFormat: e.target.value })}
                            className={`w-56 ${inputCls}`}
                        />
                    ),
                },
                {
                    label: t('settings.logFormat.bgImage'),
                    description: t('settings.logFormat.bgImageDesc'),
                    render: () => {
                        // 直接显示本地路径
                        const displayValue = config.images.rxBackground || '';
                        return (
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-1.5 items-center w-56">
                                <input
                                    type="text"
                                    placeholder={t('settings.logFormat.bgImagePlaceholder')}
                                    value={displayValue}
                                    onChange={e => {
                                        const val = e.target.value.trim();
                                        updateConfig(prev => ({ ...prev, images: { ...prev.images, rxBackground: val } }));
                                    }}
                                    className={`flex-1 min-w-0 ${inputCls}`}
                                />
                                <Tooltip content={t('settings.logFormat.bgImageBrowse')} position="top">
                                    <button
                                        onClick={async () => {
                                            if (!window.shellAPI?.showOpenDialog) return;
                                            const result = await window.shellAPI.showOpenDialog({
                                                title: t('settings.logFormat.bgImageBrowse'),
                                                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
                                                properties: ['openFile'],
                                            });
                                            const res = result as { canceled?: boolean; filePaths?: string[] };
                                            if (!res.canceled && res.filePaths?.[0]) {
                                                const filePath = res.filePaths[0].replace(/\\/g, '/');
                                                updateConfig(prev => ({ ...prev, images: { ...prev.images, rxBackground: filePath } }));
                                            }
                                        }}
                                        className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors cursor-pointer flex-shrink-0"
                                    >
                                        <FolderOpen size={16} />
                                    </button>
                                </Tooltip>
                                {config.images.rxBackground && (
                                    <Tooltip content={t('settings.logFormat.bgImageClear')} position="top">
                                        <button
                                            onClick={() => updateConfig(prev => ({ ...prev, images: { ...prev.images, rxBackground: '' } }))}
                                            className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--st-status-error)] hover:bg-[var(--list-hover-background)] rounded transition-colors cursor-pointer flex-shrink-0"
                                        >
                                            <RotateCcw size={14} />
                                        </button>
                                    </Tooltip>
                                )}
                                {config.images.rxBackground && (
                                    <Tooltip content={t('settings.logFormat.bgImageSettings')} position="top">
                                        <button
                                            onClick={() => setShowBgSettings(v => !v)}
                                            className={`p-1 rounded transition-colors cursor-pointer flex-shrink-0 ${
                                                showBgSettings
                                                    ? 'text-[var(--focus-border-color)] bg-[var(--list-active-background)]'
                                                    : 'text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)]'
                                            }`}
                                        >
                                            <Settings size={14} />
                                        </button>
                                    </Tooltip>
                                )}
                            </div>
                            {/* 展开的高级设置 */}
                            {showBgSettings && config.images.rxBackground && (
                                <div className="flex flex-col gap-2 pl-1 pt-1 border-t border-[var(--border-color)]">
                                    {/* 填充模式 */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('settings.logFormat.bgSize')}</span>
                                        <div className="w-32">
                                            <CustomSelect
                                                items={[
                                                    { label: t('settings.logFormat.bgSizeCover'), value: 'cover' },
                                                    { label: t('settings.logFormat.bgSizeContain'), value: 'contain' },
                                                    { label: t('settings.logFormat.bgSizeAuto'), value: 'auto' },
                                                    { label: t('settings.logFormat.bgSizeStretch'), value: '100% 100%' },
                                                ]}
                                                value={config.images.bgSize || 'cover'}
                                                onChange={val => updateConfig(prev => ({ ...prev, images: { ...prev.images, bgSize: val as ThemeImages['bgSize'] } }))}
                                            />
                                        </div>
                                    </div>
                                    {/* 对齐方向 */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('settings.logFormat.bgPosition')}</span>
                                        <div className="w-32">
                                            <CustomSelect
                                                items={[
                                                    { label: t('settings.logFormat.bgPositionCenter'), value: 'center' },
                                                    { label: t('settings.logFormat.bgPositionTop'), value: 'top' },
                                                    { label: t('settings.logFormat.bgPositionBottom'), value: 'bottom' },
                                                    { label: t('settings.logFormat.bgPositionLeft'), value: 'left' },
                                                    { label: t('settings.logFormat.bgPositionRight'), value: 'right' },
                                                    { label: t('settings.logFormat.bgPositionTopLeft'), value: 'top left' },
                                                    { label: t('settings.logFormat.bgPositionTopRight'), value: 'top right' },
                                                    { label: t('settings.logFormat.bgPositionBottomLeft'), value: 'bottom left' },
                                                    { label: t('settings.logFormat.bgPositionBottomRight'), value: 'bottom right' },
                                                ]}
                                                value={config.images.bgPosition || 'center'}
                                                onChange={val => updateConfig(prev => ({ ...prev, images: { ...prev.images, bgPosition: val as ThemeImages['bgPosition'] } }))}
                                            />
                                        </div>
                                    </div>
                                    {/* 不透明度 */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('settings.logFormat.bgOpacity')}</span>
                                        <div className="flex items-center gap-2 w-32">
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                value={config.images.bgOpacity ?? 100}
                                                onChange={e => updateConfig(prev => ({ ...prev, images: { ...prev.images, bgOpacity: Number(e.target.value) } }))}
                                                className="flex-1 accent-[var(--focus-border-color)] h-1 cursor-pointer"
                                            />
                                            <span className="text-[11px] text-[var(--input-placeholder-color)] w-8 text-right">{config.images.bgOpacity ?? 100}%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    },
                },
            ],
        },
        {
            title: t('settings.groups.keybindings'),
            items: (
                Object.keys(DEFAULT_KEYBINDINGS) as KeybindingAction[]
            ).map(action => ({
                label: t(`settings.keybindings.${action}`),
                description: t(`settings.keybindings.${action}Desc`),
                render: () => (
                    <KeybindingInput
                        value={config.keybindings?.[action] || DEFAULT_KEYBINDINGS[action]}
                        onChange={(binding) => updateConfig(prev => ({
                            ...prev,
                            keybindings: { ...DEFAULT_KEYBINDINGS, ...prev.keybindings, [action]: binding }
                        }))}
                    />
                ),
            })),
        },
        // 功能模块区域已迁移为独立的 DnD 排序组件，见下方 moduleSectionJSX
        {
            title: 'Danger Zone',
            items: [
                {
                    label: t('settings.factoryReset'),
                    description: t('settings.factoryResetDesc'),
                    render: () => (
                        <button
                            onClick={() => {
                                setResetInput('');
                                setShowFactoryReset(true);
                            }}
                            className="bg-[var(--st-settings-danger-bg)] hover:bg-[var(--st-settings-danger-hover)] text-[var(--st-settings-danger-text)] px-3 py-1.5 rounded-[3px] text-xs transition-colors"
                        >
                            {t('settings.factoryResetBtn')}
                        </button>
                    ),
                },
            ],
        },
    ];

    // ── 搜索过滤 ──
    const lowerSearch = searchTerm.toLowerCase();

    const filteredSettings = searchTerm
        ? settingSections
            .map(sec => {
                if (sec.title.toLowerCase().includes(lowerSearch)) return sec;
                const items = sec.items.filter(it => it.label.toLowerCase().includes(lowerSearch));
                return items.length ? { ...sec, items } : null;
            })
            .filter(Boolean) as typeof settingSections
        : settingSections;
    // ── 功能模块 DnD 排序 ──
    // 默认侧边栏项（不可关闭）
    const DEFAULT_MODULE_ITEMS = [
        { id: 'explorer', nameKey: 'sidebar.sessions', descriptionKey: '', icon: Files, tier: 'core' as const },
        { id: 'serial', nameKey: 'sidebar.configuration', descriptionKey: '', icon: Monitor, tier: 'core' as const },
    ];

    // 所有模块项（默认 + 可选）
    const allModuleItems = [
        ...DEFAULT_MODULE_ITEMS,
        ...FEATURE_REGISTRY.filter(d => d.tier === 'optional').map(d => ({
            id: d.id, nameKey: d.nameKey, descriptionKey: d.descriptionKey, icon: d.icon, tier: d.tier,
        })),
    ];

    // 模块排序状态
    const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
        const saved = localStorage.getItem('activitybar-order');
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as string[];
                const allIds = allModuleItems.map(m => m.id);
                const validIds = new Set(allIds);
                const order = parsed.filter(id => validIds.has(id));
                allIds.forEach(id => { if (!order.includes(id)) order.push(id); });
                return order;
            } catch { /* 回退默认顺序 */ }
        }
        return allModuleItems.map(m => m.id);
    });

    // 排序变更时写入 localStorage
    const saveModuleOrder = useCallback((newOrder: string[]) => {
        setModuleOrder(newOrder);
        localStorage.setItem('activitybar-order', JSON.stringify(newOrder));
        // 手动触发 storage 事件让 ActivityBar 实时同步（同一 tab 内不自动触发 StorageEvent）
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'activitybar-order',
            newValue: JSON.stringify(newOrder),
        }));
    }, []);

    const moduleSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleModuleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = moduleOrder.indexOf(active.id as string);
            const newIndex = moduleOrder.indexOf(over?.id as string);
            saveModuleOrder(arrayMove(moduleOrder, oldIndex, newIndex));
        }
    };

    // 可拖拽模块行
    const SortableModuleRow = ({ id }: { id: string }) => {
        const {
            attributes, listeners, setNodeRef, transform, transition, isDragging
        } = useSortable({ id });

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
            zIndex: isDragging ? 999 : 'auto' as const,
        };

        const moduleItem = allModuleItems.find(m => m.id === id);
        if (!moduleItem) return null;

        const isOptional = moduleItem.tier === 'optional';
        const isActive = isOptional
            ? (features.find(f => f.feature.id === id)?.isActive ?? false)
            : true;

        const IconComponent = moduleItem.icon;

        return (
            <div
                ref={setNodeRef}
                style={style}
                className={`py-2.5 border-b border-[var(--settings-row-hover-background)] last:border-0 hover:bg-[var(--list-hover-background)] px-3 flex items-center gap-3 ${isDragging ? 'bg-[var(--list-active-background)] rounded shadow-lg' : ''}`}
            >
                {/* 拖拽手柄 */}
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] transition-colors flex-shrink-0"
                    title={t('settings.modules.dragToReorder')}
                >
                    <GripVertical size={16} />
                </div>

                {/* 图标 */}
                <div className={`flex-shrink-0 ${isActive ? 'text-[var(--app-foreground)]' : 'text-[var(--input-placeholder-color)]'}`}>
                    <IconComponent size={18} />
                </div>

                {/* 名称和描述 */}
                <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium ${isActive ? 'text-[var(--st-settings-text)]' : 'text-[var(--input-placeholder-color)]'}`}>
                        {t(moduleItem.nameKey)}
                    </div>
                    {moduleItem.descriptionKey && (
                        <p className="text-[11px] text-[var(--input-placeholder-color)] mt-0.5 truncate">
                            {t(moduleItem.descriptionKey)}
                        </p>
                    )}
                </div>

                {/* 核心模块标签 / 可选模块开关 */}
                <div className="flex-shrink-0">
                    {isOptional ? (
                        <Switch
                            checked={isActive}
                            onChange={(checked) => {
                                if (checked) activateFeature(id);
                                else deactivateFeature(id);
                            }}
                        />
                    ) : (
                        <span className="text-[10px] text-[var(--input-placeholder-color)] opacity-60 uppercase tracking-wider">
                            {t('settings.modules.core')}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    // 模块区域 JSX
    const moduleSectionJSX = (!searchTerm || t('settings.groups.modules').toLowerCase().includes(lowerSearch)) ? (
        <Group title={t('settings.groups.modules')}>
            <DndContext
                sensors={moduleSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleModuleDragEnd}
            >
                <SortableContext items={moduleOrder} strategy={verticalListSortingStrategy}>
                    {moduleOrder.map(id => (
                        <SortableModuleRow key={id} id={id} />
                    ))}
                </SortableContext>
            </DndContext>
        </Group>
    ) : null;

    const hasResults = filteredSettings.length > 0 || moduleSectionJSX !== null;

    return (
        <div className="flex flex-col h-full bg-[var(--settings-editor-bg)]" data-component="settings-editor">
            {/* 头部工具栏 */}
            <div className="h-[35px] flex items-center shrink-0 px-4 border-b border-[var(--border-color)] bg-[var(--widget-background)] justify-between">
                <span className="text-[13px] font-semibold text-[var(--st-settings-title-text)]">{t('settings.title')}</span>
                <div className="flex items-center gap-1">

                    <Tooltip content={t('settings.exportTooltip')} position="bottom">
                        <button
                            onClick={handleDownload}
                            className="p-1.5 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors"
                        >
                            <Download size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('settings.importTooltip')} position="bottom">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors"
                        >
                            <Upload size={14} />
                        </button>
                    </Tooltip>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <div className="w-[1px] h-4 bg-[var(--border-color)] mx-1" />
                    <Tooltip content={t('settings.resetTooltip')} position="bottom">
                        <button
                            onClick={handleReset}
                            className="p-1.5 text-[var(--st-status-error)] hover:text-[var(--st-settings-danger-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* 搜索栏 */}
            <div className="p-6 bg-[var(--editor-background)]">
                <div className="max-w-3xl mx-auto relative group">
                    <Search
                        className="absolute left-3 top-2.5 text-[var(--input-placeholder-color)] group-focus-within:text-[var(--focus-border-color)]"
                        size={16}
                    />
                    <input
                        type="text"
                        placeholder={t('settings.search')}
                        className="w-full bg-[var(--settings-header-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] pl-10 pr-4 py-2 text-[13px] outline-none focus:border-[var(--focus-border-color)] shadow-sm rounded-md"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* 配置内容区 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-3xl mx-auto px-6 pb-20">
                    {/* 无结果提示 */}
                    {!hasResults && searchTerm && (
                        <div className="text-center py-16 text-[var(--input-placeholder-color)] text-[13px]">
                            {t('settings.noResults', { term: searchTerm })}
                        </div>
                    )}

                    {/* 普通设置区块 */}
                    {filteredSettings.map((sec, i) => (
                        <Group key={`s-${i}`} title={sec.title}>
                            {sec.items.map((item, j) => (
                                <SettingRow key={j} label={item.label} description={item.description}>
                                    {item.render()}
                                </SettingRow>
                            ))}
                        </Group>
                    ))}

                    {/* 功能模块 DnD 排序区 */}
                    {moduleSectionJSX}

                </div>
            </div>

            {showFactoryReset && (
                <FactoryResetDialog
                    resetInput={resetInput}
                    setResetInput={setResetInput}
                    onReset={performFactoryReset}
                    onClose={() => setShowFactoryReset(false)}
                />
            )}
        </div>
    );
};
