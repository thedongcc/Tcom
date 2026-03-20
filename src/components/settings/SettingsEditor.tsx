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
import { useState, useRef } from 'react';
import { Search, RotateCcw, Download, Upload, FolderOpen, FileJson, Settings } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useI18n } from '../../context/I18nContext';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
import { useSettingsActions } from './useSettingsActions';
import { FactoryResetDialog } from './SettingsComponents';
import { KeybindingInput } from '../common/KeybindingInput';
import { DEFAULT_KEYBINDINGS, type KeybindingAction } from '../../utils/keybindings';
import type { ThemeImages } from '../../types/theme';
import { Group, SettingRow, Checkbox, INPUT_CLS, type SettingSection } from './SettingsShared';
import { ModuleSettings } from './ModuleSettings';
import { isCrashReportEnabled, setCrashReportEnabled } from '../../lib/crashReporter';

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export const SettingsEditor = () => {
    const { config, availableThemes, loadThemes, updateConfig, updateUI, setTheme } =
        useSettings();
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Factory Reset State
    const [showFactoryReset, setShowFactoryReset] = useState(false);
    const [resetInput, setResetInput] = useState('');
    const [showBgSettings, setShowBgSettings] = useState(false);
    const [crashReportOn, setCrashReportOn] = useState(isCrashReportEnabled);

    // 操作函数和字体列表（委托给 Hook）
    const { handleImport, handleDownload, handleReset, performFactoryReset, finalFontList } = useSettingsActions();

    // ── 设置区块数据定义 ──
    const settingSections: SettingSection[] = [
        {
            title: t('settings.groups.appearance'),
            items: [
                {
                    label: t('settings.appearance.colorScheme'),
                    description: t('settings.appearance.colorSchemeDesc'),
                    render: () => (
                        <div
                            className="flex items-center gap-1 w-56"
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
                            className={`w-56 ${INPUT_CLS}`}
                        />
                    ),
                },
                {
                    label: t('settings.logFormat.bgImage'),
                    description: t('settings.logFormat.bgImageDesc'),
                    render: () => {
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
                                    className={`flex-1 min-w-0 ${INPUT_CLS}`}
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

    return (
        <div className="flex flex-col h-full bg-[var(--settings-editor-bg)]" data-component="settings-editor">
            {/* 头部工具栏 */}
            <div className="h-[35px] flex items-center shrink-0 px-4 border-b border-[var(--border-color)] bg-[var(--widget-background)] justify-between">
                <span className="text-[13px] font-semibold text-[var(--st-settings-title-text)]">{t('settings.title')}</span>
                <div className="flex items-center gap-1">
                    <Tooltip content={t('settings.exportTooltip')} position="bottom">
                        <button onClick={handleDownload} className="p-1.5 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors">
                            <Download size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('settings.importTooltip')} position="bottom">
                        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-[var(--input-placeholder-color)] hover:text-[var(--st-settings-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors">
                            <Upload size={14} />
                        </button>
                    </Tooltip>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <div className="w-[1px] h-4 bg-[var(--border-color)] mx-1" />
                    <Tooltip content={t('settings.resetTooltip')} position="bottom">
                        <button onClick={handleReset} className="p-1.5 text-[var(--st-status-error)] hover:text-[var(--st-settings-danger-text)] hover:bg-[var(--list-hover-background)] rounded transition-colors">
                            <RotateCcw size={14} />
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* 搜索栏 */}
            <div className="p-6 bg-[var(--editor-background)]">
                <div className="max-w-3xl mx-auto relative group">
                    <Search className="absolute left-3 top-2.5 text-[var(--input-placeholder-color)] group-focus-within:text-[var(--focus-border-color)]" size={16} />
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
                    {filteredSettings.length === 0 && searchTerm && (
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
                    <ModuleSettings searchTerm={searchTerm} />
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
