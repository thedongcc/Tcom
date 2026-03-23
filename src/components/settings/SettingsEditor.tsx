/**
 * SettingsEditor.tsx
 * 设置编辑器主入口 — 工具栏 + 搜索 + 各分组设置项的数据定义与渲染。
 *
 * 子组件：
 * - SettingsShared.tsx — Group / SettingRow / Checkbox 公共 UI
 * - ModuleSettings.tsx — 功能模块 DnD 排序区域
 * - SettingsComponents.tsx — FactoryResetDialog 对话框
 * - useSettingsActions.ts — 导入导出/重置等操作逻辑
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, RotateCcw, Download, Upload, FolderOpen, FileJson, Settings, Package, ArchiveRestore, Eye } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useI18n } from '../../context/I18nContext';
import { confirm } from '../../services/confirmManager';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
import { useSettingsActions } from './useSettingsActions';
import { isGlassTheme } from '../../hooks/useThemeEffects';
import { FactoryResetDialog } from './SettingsComponents';
import { KeybindingInput } from '../common/KeybindingInput';
import { DEFAULT_KEYBINDINGS, formatKeybinding, type KeybindingAction } from '../../utils/keybindings';
import type { ThemeImages } from '../../types/theme';
import { Group, SettingRow, Checkbox, INPUT_CLS, type SettingSection } from './SettingsShared';
import { ModuleSettings } from './ModuleSettings';
import { isCrashReportEnabled, setCrashReportEnabled } from '../../lib/crashReporter';

// ── 生成分组 ID ──
const sectionId = (index: number) => `settings-section-${index}`;
const MODULE_SECTION_ID = 'settings-section-modules';

// ─── 独立高性能滑块组件 (绕开 Context 重绘实现 60fps 实时预览) ───────────────────
const LiveSlider = ({ value, min, max, unit, label, onChange, liveUpdate }: {
    value: number; min: number; max: number; unit: string; label: string;
    onChange: (val: number) => void;
    liveUpdate: (val: number) => void;
}) => {
    const [local, setLocal] = useState(value);
    useEffect(() => setLocal(value), [value]);

    const startPeek = (e: React.PointerEvent) => {
        document.body.classList.add('settings-peek-mode');
        const row = (e.target as HTMLElement).closest('[data-peek-row]');
        if (row) row.classList.add('peek-active-slider');
    };

    return (
        <div className="flex items-center justify-between mt-1" data-peek-row>
            <span className="text-[11px] text-[var(--input-placeholder-color)]">{label}</span>
            <div className="flex items-center gap-2 w-48">
                <input
                    type="range"
                    min={min} max={max}
                    value={local}
                    onChange={e => {
                        const val = Number(e.target.value);
                        setLocal(val);
                        liveUpdate(val);
                    }}
                    onPointerUp={() => onChange(local)}
                    onPointerDown={startPeek}
                    className="flex-1 accent-[var(--focus-border-color)] h-1 cursor-grab active:cursor-grabbing"
                />
                <span className="text-[11px] text-[var(--input-placeholder-color)] w-12 shrink-0 text-right font-mono">
                    {local}{unit}
                </span>
            </div>
        </div>
    );
};

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export const SettingsEditor = () => {
    const { config, availableThemes, loadThemes, updateConfig, updateUI, setTheme } =
        useSettings();
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [activeSection, setActiveSection] = useState(0);

    // Factory Reset State
    const [showFactoryReset, setShowFactoryReset] = useState(false);
    const [resetInput, setResetInput] = useState('');
    const [showBgSettings, setShowBgSettings] = useState(!!config.images.rxBackground);
    const [crashReportOn, setCrashReportOn] = useState(isCrashReportEnabled);

    // 操作函数和字体列表（委托给 Hook）
    const { handleImport, handleDownload, handleReset, performFactoryReset, finalFontList } = useSettingsActions();

    // ── Ghost Peek Mode
    useEffect(() => {
        const stopPeek = () => {
            document.body.classList.remove('settings-peek-mode');
            document.querySelectorAll('.peek-active-slider').forEach(el => el.classList.remove('peek-active-slider'));
        };
        document.addEventListener('pointerup', stopPeek);
        document.addEventListener('pointercancel', stopPeek);
        return () => {
            document.removeEventListener('pointerup', stopPeek);
            document.removeEventListener('pointercancel', stopPeek);
            stopPeek();
        };
    }, []);

    const JITAlphaUpdate = useCallback((val: number) => {
        const theme = availableThemes.find(t => t.id === config.theme);
        if (!theme) return;
        const scale = val / 100;
        const root = document.documentElement;
        Object.entries(theme.colors).forEach(([key, colorValue]) => {
            if (typeof colorValue === 'string' && colorValue.startsWith('rgba(')) {
                const match = colorValue.match(/rgba\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([0-9.]+)\)/);
                if (match) {
                    root.style.setProperty(key, `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${(parseFloat(match[4]) * scale).toFixed(3)})`);
                }
            }
        });
    }, [availableThemes, config.theme]);
    const settingSections: SettingSection[] = [
        {
            title: t('settings.groups.appearance'),
            items: [
                {
                    label: t('settings.appearance.colorScheme'),
                    description: t('settings.appearance.colorSchemeDesc'),
                    render: () => (
                        <div
                            className="flex items-center gap-1 w-64"
                            onClickCapture={() => { loadThemes(); }}
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
                                    onClick={(e) => { e.stopPropagation(); window.themeAPI?.openFolder?.(); }}
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
                                        if (currentDef) { window.themeAPI?.openFile?.(currentDef.id); }
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
                        <div className="w-64">
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
                ...(isGlassTheme(config.theme) ? [{
                    label: t('settings.logFormat.bgImage'),
                    description: t('settings.logFormat.bgImageDesc'),
                    alignTop: true,
                    expandedContent: showBgSettings && config.images.rxBackground ? (
                        <div className="flex flex-col gap-3 pt-3 mt-1 border-t border-[var(--border-color)]">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('settings.logFormat.bgSize')}</span>
                                <div className="w-64">
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
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-[var(--input-placeholder-color)]">{t('settings.logFormat.bgPosition')}</span>
                                <div className="w-64">
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
                            <LiveSlider
                                label={t('settings.logFormat.bgOpacity')}
                                value={config.images.bgOpacity ?? 100}
                                min={0} max={100} unit="%"
                                onChange={val => updateConfig(prev => ({ ...prev, images: { ...prev.images, bgOpacity: val } }))}
                                liveUpdate={val => document.documentElement.style.setProperty('--bg-opacity', (val / 100).toString())}
                            />
                            <LiveSlider
                                label={t('settings.logFormat.bgBlur') === 'settings.logFormat.bgBlur' ? '图片模糊度 (Blur)' : t('settings.logFormat.bgBlur')}
                                value={config.images.bgBlur ?? 0}
                                min={0} max={20} unit="px"
                                onChange={val => updateConfig(prev => ({ ...prev, images: { ...prev.images, bgBlur: val } }))}
                                liveUpdate={val => {
                                    document.documentElement.style.setProperty('--glass-filter', val > 0 ? `blur(${val}px)` : 'none');
                                    document.documentElement.style.setProperty('--bg-inset', val > 0 ? `-${val * 2}px` : '0px');
                                }}
                            />
                            <LiveSlider
                                label="UI 面板不透明度"
                                value={config.images.uiOpacity ?? 100}
                                min={0} max={100} unit="%"
                                onChange={val => updateConfig(prev => ({ ...prev, images: { ...prev.images, uiOpacity: val } }))}
                                liveUpdate={JITAlphaUpdate}
                            />
                        </div>
                    ) : undefined,
                    render: () => {
                        const displayValue = config.images.rxBackground || '';
                        return (
                        <div className="flex flex-col gap-2 w-64">
                            {/* 第一行：独立撑满的图片路径输入框 */}
                            <input
                                type="text"
                                placeholder={t('settings.logFormat.bgImagePlaceholder')}
                                value={displayValue}
                                title={displayValue} // 悬浮显示完整长路径
                                onChange={e => {
                                    const val = e.target.value.trim();
                                    updateConfig(prev => ({ ...prev, images: { ...prev.images, rxBackground: val } }));
                                }}
                                className={`w-full text-xs font-mono !px-2.5 !py-1.5 ${INPUT_CLS}`}
                            />

                            {/* 第二行：操作按钮打散对齐 */}
                            <div className="flex items-center justify-between">
                                {/* 左侧：主操作框 — 浏览图片 */}
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
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--button-secondary-background)] hover:bg-[var(--button-secondary-hover-background)] text-[var(--button-foreground)] rounded border border-[var(--border-color)] transition-colors cursor-pointer"
                                    >
                                        <FolderOpen size={14} />
                                        <span>浏览图片</span>
                                    </button>
                                </Tooltip>

                                {/* 右侧：次级辅助操作组 */}
                                {config.images.rxBackground && (
                                    <div className="flex items-center gap-1">
                                        <Tooltip content={t('settings.logFormat.bgImageClear')} position="top">
                                            <button
                                                onClick={() => updateConfig(prev => ({ ...prev, images: { ...prev.images, rxBackground: '' } }))}
                                                className="p-1.5 text-[var(--input-placeholder-color)] hover:text-[#e81123] hover:bg-[#e8112320] rounded transition-colors cursor-pointer"
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                        </Tooltip>

                                        <Tooltip content={t('settings.logFormat.bgImageSettings')} position="top">
                                            <button
                                                onClick={() => setShowBgSettings(v => !v)}
                                                className={`p-1.5 rounded transition-colors cursor-pointer ${
                                                    showBgSettings
                                                        ? 'text-[var(--focus-border-color)] bg-[var(--list-active-background)]'
                                                        : 'text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)]'
                                                }`}
                                            >
                                                <Settings size={14} />
                                            </button>
                                        </Tooltip>

                                        <Tooltip content={t('settings.logFormat.bgImagePeek') === 'settings.logFormat.bgImagePeek' ? '按住预览背景效果' : t('settings.logFormat.bgImagePeek')} position="top">
                                            <button
                                                onPointerDown={() => document.body.classList.add('settings-peek-mode')}
                                                className="p-1.5 rounded transition-colors cursor-grab active:cursor-grabbing text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)]"
                                            >
                                                <Eye size={14} />
                                            </button>
                                        </Tooltip>
                                    </div>
                                )}
                            </div>
                        </div>
                        );
                    },
                }] : []),
            ],
        },
        {
            title: t('settings.groups.layout'),
            items: [
                {
                    label: t('settings.layout.sidebarPosition'),
                    description: t('settings.layout.sidebarPositionDesc'),
                    render: () => (
                        <div className="w-64">
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
                        <div className="w-64">
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
                            className={`w-64 ${INPUT_CLS}`}
                        />
                    ),
                },
            ],
        },
        {
            title: t('settings.groups.keybindings'),
            items: [
                // 可配置快捷键
                ...(Object.keys(DEFAULT_KEYBINDINGS) as KeybindingAction[]).map(action => ({
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
                // 系统快捷键（只读）
                ...[
                    { key: 'undo', binding: 'Ctrl+Z' },
                    { key: 'redo', binding: 'Ctrl+Shift+Z' },
                    { key: 'copy', binding: 'Ctrl+C' },
                    { key: 'paste', binding: 'Ctrl+V' },
                    { key: 'selectAll', binding: 'Ctrl+A' },
                    { key: 'delete', binding: 'Delete' },
                    { key: 'graphZoom', binding: 'Ctrl+Scroll' },
                ].map(({ key, binding }) => ({
                    label: t(`settings.keybindings.${key}`),
                    description: t(`settings.keybindings.${key}Desc`),
                    render: () => (
                        <span className="inline-flex items-center px-2.5 py-1 bg-[var(--input-background)] border border-[var(--input-border-color)] rounded text-[12px] text-[var(--input-placeholder-color)] font-mono select-none">
                            {formatKeybinding(binding)}
                        </span>
                    ),
                })),
            ],
        },
        {
            title: t('settings.groups.privacy'),
            items: [
                {
                    label: t('settings.privacy.crashReport'),
                    description: t('settings.privacy.crashReportDesc'),
                    render: () => (
                        <Checkbox
                            checked={crashReportOn}
                            onChange={() => {
                                const next = !crashReportOn;
                                setCrashReportOn(next);
                                setCrashReportEnabled(next);
                            }}
                        />
                    ),
                },
            ],
        },
        {
            title: t('settings.groups.dataBackup'),
            items: [
                {
                    label: t('settings.dataBackup.exportAll'),
                    description: t('settings.dataBackup.exportAllDesc'),
                    render: () => (
                        <button
                            onClick={async () => {
                                try {
                                    await window.globalSettingsAPI?.exportAll();
                                } catch (e) {
                                    console.error('全量导出失败:', e);
                                }
                            }}
                            className="flex items-center gap-1.5 bg-[var(--st-status-info)] hover:bg-[#1177bb] text-white px-3 py-1.5 rounded-[3px] text-xs transition-colors"
                        >
                            <Package size={13} />
                            {t('settings.dataBackup.exportAllBtn')}
                        </button>
                    ),
                },
                {
                    label: t('settings.dataBackup.importAll'),
                    description: t('settings.dataBackup.importAllDesc'),
                    render: () => (
                        <button
                            onClick={async () => {
                                try {
                                    const res = await window.globalSettingsAPI?.importAll();
                                    if (res?.success && !res.canceled) {
                                        await confirm({
                                            title: t('settings.groups.dataBackup'),
                                            message: t('settings.dataBackup.importSuccess'),
                                            confirmText: t('common.ok'),
                                        });
                                        window.location.reload();
                                    }
                                } catch (e) {
                                    console.error('全量恢复失败:', e);
                                }
                            }}
                            className="flex items-center gap-1.5 bg-[var(--st-settings-danger-bg)] hover:bg-[#c93f24] text-white px-3 py-1.5 rounded-[3px] text-xs transition-colors"
                        >
                            <ArchiveRestore size={13} />
                            {t('settings.dataBackup.importAllBtn')}
                        </button>
                    ),
                },
            ],
        },
        {
            title: 'Danger Zone',
            items: [
                {
                    label: t('settings.factoryReset'),
                    description: t('settings.factoryResetDesc'),
                    render: () => (
                        <button
                            onClick={() => { setResetInput(''); setShowFactoryReset(true); }}
                            className="bg-[var(--st-settings-danger-bg)] hover:bg-[var(--st-settings-danger-hover)] text-[var(--st-settings-danger-text)] px-3 py-1.5 rounded-[3px] text-xs transition-colors"
                        >
                            {t('settings.factoryResetBtn')}
                        </button>
                    ),
                },
            ],
        },
    ];

    // 目录数据：外观 → 布局 → 字体排版 → 功能模块 → 日志格式 → 快捷键 → 隐私 → 数据备份 → Danger Zone
    const MODULE_INDEX = 3; // 功能模块插在第 3 个位置（字体排版之后）
    const tocItems = [
        ...settingSections.slice(0, MODULE_INDEX).map((sec, i) => ({ id: sectionId(i), title: sec.title })),
        { id: MODULE_SECTION_ID, title: t('settings.groups.modules') },
        ...settingSections.slice(MODULE_INDEX).map((sec, i) => ({ id: sectionId(MODULE_INDEX + i), title: sec.title })),
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

    // 目录项点击滚动
    const handleTocClick = useCallback((id: string, index: number) => {
        setActiveSection(index);
        const el = document.getElementById(id);
        if (el && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const elTop = el.offsetTop - container.offsetTop;
            container.scrollTo({ top: elTop - 8, behavior: 'smooth' });
        }
    }, []);

    // 滚动时自动检测当前可见分组
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || searchTerm) return;

        const onScroll = () => {
            const containerTop = container.scrollTop + 20;
            let current = 0;
            for (let i = 0; i < tocItems.length; i++) {
                const el = document.getElementById(tocItems[i].id);
                if (el) {
                    const elTop = el.offsetTop - container.offsetTop;
                    if (containerTop >= elTop) current = i;
                }
            }
            setActiveSection(current);
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll);
    }, [tocItems, searchTerm]);

    return (
        <div className="flex h-full w-full bg-[var(--editor-background)]" data-component="settings-editor">
            {/* 左侧导航面板 */}
            {!searchTerm && (
                <nav className="w-[210px] shrink-0 overflow-y-auto custom-scrollbar bg-[var(--editor-background)] border-r border-[var(--border-color)] flex flex-col py-3 pl-4">
                    {/* 搜索 + 工具栏 */}
                    <div className="px-3 mb-3 flex items-center gap-1">
                        <div className="flex-1 relative group">
                            <Search className="absolute left-2 top-1.5 text-[var(--input-placeholder-color)] group-focus-within:text-[var(--focus-border-color)]" size={13} />
                            <input
                                type="text"
                                placeholder={t('settings.search')}
                                className="w-full bg-[var(--input-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] pl-7 pr-2 py-1 text-[11px] outline-none focus:border-[var(--focus-border-color)] rounded-[3px]"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center">
                            <Tooltip content={t('settings.exportTooltip')} position="bottom">
                                <button onClick={handleDownload} className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors">
                                    <Download size={12} />
                                </button>
                            </Tooltip>
                            <Tooltip content={t('settings.importTooltip')} position="bottom">
                                <button onClick={() => fileInputRef.current?.click()} className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors">
                                    <Upload size={12} />
                                </button>
                            </Tooltip>
                            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                            <Tooltip content={t('settings.resetTooltip')} position="bottom">
                                <button onClick={handleReset} className="p-1 text-[var(--st-status-error)] hover:text-[var(--st-settings-danger-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors">
                                    <RotateCcw size={12} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    {/* 目录项 */}
                    <div className="flex flex-col gap-0.5 px-2">
                        {tocItems.map((item, i) => (
                            <button
                                key={item.id}
                                onClick={() => handleTocClick(item.id, i)}
                                className={`w-full text-left text-[13px] px-3 py-1.5 rounded-md transition-colors truncate ${
                                    activeSection === i
                                        ? 'text-[var(--st-settings-title-text)] bg-[var(--list-active-background)] font-medium'
                                        : 'text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)]'
                                }`}
                            >
                                {item.title}
                            </button>
                        ))}
                    </div>
                </nav>
            )}

            {/* 搜索模式下的顶部搜索栏 */}
            {searchTerm && (
                <div className="flex flex-col flex-1 overflow-hidden">
                    <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-[var(--border-color)]">
                        <div className="flex-1 relative group">
                            <Search className="absolute left-3 top-2 text-[var(--input-placeholder-color)] group-focus-within:text-[var(--focus-border-color)]" size={15} />
                            <input
                                type="text"
                                placeholder={t('settings.search')}
                                className="w-full bg-[var(--input-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] pl-9 pr-4 py-1.5 text-[13px] outline-none focus:border-[var(--focus-border-color)] rounded-[3px]"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="max-w-[720px] mx-auto px-8 pb-20 pt-4">
                            {filteredSettings.length === 0 && (
                                <div className="text-center py-16 text-[var(--input-placeholder-color)] text-[13px]">
                                    {t('settings.noResults', { term: searchTerm })}
                                </div>
                            )}
                            {filteredSettings.map((sec, i) => (
                                <Group key={`s-${i}`} title={sec.title} id={sectionId(i)}>
                                    {sec.items.map((item, j) => (
                                        <SettingRow
                                            key={j}
                                            label={item.label}
                                            description={item.description}
                                            alignTop={item.alignTop}
                                            expandedContent={item.expandedContent}
                                        >
                                            {item.render()}
                                        </SettingRow>
                                    ))}
                                </Group>
                            ))}
                            <div id={MODULE_SECTION_ID}>
                                <ModuleSettings searchTerm={searchTerm} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 右侧设置内容（非搜索模式） */}
            {!searchTerm && (
                <div className="flex-1 overflow-y-auto custom-scrollbar" ref={scrollContainerRef}>
                    <div className="px-8 pb-20 pt-4">
                        {filteredSettings.slice(0, MODULE_INDEX).map((sec, i) => (
                            <Group key={`s-${i}`} title={sec.title} id={sectionId(i)}>
                                {sec.items.map((item, j) => (
                                    <SettingRow
                                        key={j}
                                        label={item.label}
                                        description={item.description}
                                        alignTop={(item as any).alignTop}
                                        expandedContent={(item as any).expandedContent}
                                    >
                                        {item.render()}
                                    </SettingRow>
                                ))}
                            </Group>
                        ))}

                        <div id={MODULE_SECTION_ID}>
                            <ModuleSettings searchTerm={searchTerm} />
                        </div>

                        {filteredSettings.slice(MODULE_INDEX).map((sec, i) => (
                            <Group key={`s-post-${i}`} title={sec.title} id={sectionId(MODULE_INDEX + i)}>
                                {sec.items.map((item, j) => (
                                    <SettingRow
                                        key={j}
                                        label={item.label}
                                        description={item.description}
                                        alignTop={(item as any).alignTop}
                                        expandedContent={(item as any).expandedContent}
                                    >
                                        {item.render()}
                                    </SettingRow>
                                ))}
                            </Group>
                        ))}
                    </div>
                </div>
            )}

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
