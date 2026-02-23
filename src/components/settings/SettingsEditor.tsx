import { useState, useRef, useEffect } from 'react';
import { Search, RotateCcw, Download, Upload, Image as ImageIcon, Pipette, Check, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useI18n } from '../../context/I18nContext';
import { ThemeMode } from '../../types/theme';
import { BUILT_IN_THEMES, BUILT_IN_THEME_IDS, importTheme as parseTheme, exportTheme } from '../../themes';
import { CustomSelect } from '../common/CustomSelect';

// ─── 颜色选择器 ───────────────────────────────────────────────────────────────
const ColorInput = ({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const openEyeDropper = async () => {
        if (!('EyeDropper' in window)) return;
        try {
            const eyeDropper = new (window as any).EyeDropper();
            const result = await eyeDropper.open();
            onChange(result.sRGBHex);
        } catch {
            // 用户取消或出错
        }
    };

    return (
        <div className="flex items-center justify-between py-2 border-b border-[var(--vscode-settings-row-hover-bg)] last:border-0 hover:bg-[var(--vscode-list-hover)] px-3 group">
            <label className="text-[13px] text-[var(--vscode-fg)]">{label}</label>
            <div className="flex items-center gap-2">
                {/* 颜色预览块 */}
                <div
                    className="w-5 h-5 rounded border border-[var(--vscode-input-border)] cursor-pointer shadow-sm relative overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: value || '#000000' }}
                    onClick={() => inputRef.current?.click()}
                    title="Click to pick color"
                >
                    <input
                        ref={inputRef}
                        type="color"
                        value={value && value.length === 7 ? value : '#000000'}
                        onChange={e => onChange(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full p-0 border-none"
                    />
                </div>

                {'EyeDropper' in window && (
                    <button
                        onClick={openEyeDropper}
                        className="p-1 text-[var(--vscode-input-placeholder)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] rounded transition-colors"
                        title="Pick color from screen"
                    >
                        <Pipette size={14} />
                    </button>
                )}

                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-24 bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] text-[12px] px-2 py-0.5 outline-none focus:border-[var(--vscode-focusBorder)] uppercase font-mono"
                    spellCheck={false}
                />
            </div>
        </div>
    );
};

// ─── 分组容器 ─────────────────────────────────────────────────────────────────
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-8">
        <h3 className="text-[11px] font-bold text-[var(--vscode-fg)] opacity-50 uppercase tracking-widest mb-3 px-2 border-l-2 border-[var(--vscode-focusBorder)] ml-[-8px] pl-[6px]">
            {title}
        </h3>
        <div className="flex flex-col bg-[var(--vscode-editor-background)] rounded border border-[var(--vscode-border)] overflow-hidden">
            {children}
        </div>
    </div>
);

// ─── 普通设置行 ───────────────────────────────────────────────────────────────
const SettingRow = ({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
}) => (
    <div className="flex items-center justify-between py-3 border-b border-[var(--vscode-settings-row-hover-bg)] last:border-0 hover:bg-[var(--vscode-list-hover)] px-3">
        <div className="flex flex-col flex-1 mr-4">
            <label className="text-[13px] text-[var(--vscode-fg)] font-medium">{label}</label>
            {description && (
                <p className="text-[11px] text-[var(--vscode-input-placeholder)] mt-0.5">{description}</p>
            )}
        </div>
        <div className="flex-shrink-0">{children}</div>
    </div>
);

// ─── 复选框 ───────────────────────────────────────────────────────────────────
const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div
        onClick={onChange}
        className={`w-4 h-4 border flex items-center justify-center cursor-pointer transition-colors ${checked
            ? 'bg-[var(--vscode-checkbox-background)] border-[var(--vscode-checkbox-border)]'
            : 'bg-[var(--vscode-input-bg)] border-[var(--vscode-input-border)]'
            }`}
    >
        {checked && <Check size={12} className="text-[var(--vscode-checkbox-foreground)]" />}
    </div>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export const SettingsEditor = () => {
    const { config, updateColors, updateConfig, updateUI, setTheme, resetConfig, importConfig, exportConfig, addCustomTheme, removeCustomTheme } =
        useSettings();
    const { confirm } = useConfirm();
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');
    const [systemFonts, setSystemFonts] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const themeFileInputRef = useRef<HTMLInputElement>(null);

    // 加载系统字体列表
    useEffect(() => {
        (window as any).updateAPI?.listFonts?.().then((res: any) => {
            if (res?.success && Array.isArray(res.fonts)) {
                setSystemFonts(res.fonts);
            }
        }).catch(() => { /* 忽略错误，使用预设列表 */ });
    }, []);

    // ── 文件导入 ──
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => {
                if (ev.target?.result) importConfig(ev.target.result as string);
            };
            reader.readAsText(file);
        }
    };

    // ── 文件导出 ──
    const handleDownload = () => {
        const json = exportConfig();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tcom-settings.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── 重置确认 ──
    const handleReset = async () => {
        const ok = await confirm({
            title: t('settings.resetTitle'),
            message: t('settings.resetMessage'),
            confirmText: t('settings.resetConfirm'),
            cancelText: t('common.cancel'),
            type: 'warning',
        });
        if (ok) resetConfig();
    };

    // ── 导入主题文件 ──
    const handleImportTheme = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const json = ev.target?.result as string;
            const theme = parseTheme(json);
            if (theme) {
                // 防止覆盖内置主题
                if (BUILT_IN_THEME_IDS.has(theme.id)) {
                    theme.id = `${theme.id}-custom-${Date.now()}`;
                }
                addCustomTheme(theme);
                setTheme(theme.id);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // ── 基于当前主题新建自定义主题 ──
    const handleNewCustomTheme = () => {
        const currentDef = [...BUILT_IN_THEMES, ...config.customThemes].find(t => t.id === config.theme);
        const newId = `custom-${Date.now()}`;
        const newTheme = {
            id: newId,
            name: `Custom (${currentDef?.name ?? config.theme})`,
            type: (currentDef?.type ?? 'dark') as 'dark' | 'light',
            colors: { ...(currentDef?.colors ?? {}) },
        };
        addCustomTheme(newTheme);
        setTheme(newId);
    };

    // ── 导出当前主题为 JSON ──
    const handleExportCurrentTheme = () => {
        const currentDef = [...BUILT_IN_THEMES, ...config.customThemes].find(t => t.id === config.theme);
        if (!currentDef) return;
        const json = exportTheme(currentDef);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentDef.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── 删除自定义主题 ──
    const handleDeleteCustomTheme = async (themeId: string) => {
        const ok = await confirm({
            title: '删除主题',
            message: '确定要删除此自定义主题吗？',
            confirmText: '删除',
            cancelText: t('common.cancel'),
            type: 'warning',
        });
        if (ok) removeCustomTheme(themeId);
    };


    // 通用样式
    const inputCls =
        'bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] text-[12px] px-2 py-0.5 outline-none focus:border-[var(--vscode-focusBorder)]';

    // 预设字体列表（内置字体 + 分类后的系统字体）
    const fontFamilyPresets = [
        { label: '-- Built-in --', value: '', disabled: true },
        { label: '内嵌字体 (Default)', value: 'AppCoreFont' },
    ];

    // 分类系统字体
    const monoFonts: { label: string; value: string }[] = [];
    const propFonts: { label: string; value: string }[] = [];

    // 定义一些常见的等宽字体关键词，用于初步分类
    const monoKeywords = ['mono', 'console', 'code', 'courier', 'fixed', 'terminal'];

    systemFonts.forEach(f => {
        const lowerF = f.toLowerCase();
        const item = { label: f, value: `"${f}"` };
        if (monoKeywords.some(kw => lowerF.includes(kw))) {
            monoFonts.push(item);
        } else {
            propFonts.push(item);
        }
    });

    const finalFontList = [
        ...fontFamilyPresets,
        ...(monoFonts.length > 0 ? [{ label: '-- Monospaced --', value: '', disabled: true }, ...monoFonts] : []),
        ...(propFonts.length > 0 ? [{ label: '-- Proportional --', value: '', disabled: true }, ...propFonts] : [])
    ];

    // ── 颜色区块数据 ──
    const colorSections: {
        title: string;
        colors: { label: string; value: string; onChange: (v: string) => void }[];
    }[] = [
            {
                title: t('settings.groups.serialColors'),
                colors: [
                    { label: t('settings.colors.rxLabel'), value: config.colors.rxLabelColor, onChange: v => updateColors({ rxLabelColor: v }) },
                    { label: t('settings.colors.txLabel'), value: config.colors.txLabelColor, onChange: v => updateColors({ txLabelColor: v }) },
                    { label: t('settings.colors.rxText'), value: config.colors.rxTextColor, onChange: v => updateColors({ rxTextColor: v }) },
                    { label: t('settings.colors.txText'), value: config.colors.txTextColor, onChange: v => updateColors({ txTextColor: v }) },
                    { label: t('settings.colors.rxBg'), value: config.colors.rxBgColor, onChange: v => updateColors({ rxBgColor: v }) },
                    { label: t('settings.colors.inputBg'), value: config.colors.inputBgColor, onChange: v => updateColors({ inputBgColor: v }) },
                    { label: t('settings.colors.inputText'), value: config.colors.inputTextColor, onChange: v => updateColors({ inputTextColor: v }) },
                    { label: t('settings.colors.timestamp'), value: config.colors.timestampColor, onChange: v => updateColors({ timestampColor: v }) },
                    { label: t('settings.colors.info'), value: config.colors.infoColor, onChange: v => updateColors({ infoColor: v }) },
                    { label: t('settings.colors.error'), value: config.colors.errorColor, onChange: v => updateColors({ errorColor: v }) },
                ],
            },
            {
                title: t('settings.groups.tokenColors'),
                colors: [
                    { label: t('settings.tokens.crc'), value: config.colors.crcTokenColor, onChange: v => updateColors({ crcTokenColor: v }) },
                    { label: t('settings.tokens.flag'), value: config.colors.flagTokenColor, onChange: v => updateColors({ flagTokenColor: v }) },
                    { label: t('settings.tokens.accent'), value: config.colors.accentColor, onChange: v => updateColors({ accentColor: v }) },
                ],
            },
        ];

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
                        <div className="flex items-center gap-1 w-48">
                            <CustomSelect
                                items={[
                                    ...BUILT_IN_THEMES.map(th => ({ label: th.name, value: th.id })),
                                    ...config.customThemes.map(th => ({ label: th.name, value: th.id }))
                                ]}
                                value={config.theme}
                                onChange={(val) => setTheme(val as ThemeMode)}
                            />
                        </div>
                    ),
                },
                {
                    label: t('settings.appearance.language'),
                    description: t('settings.appearance.languageDesc'),
                    render: () => (
                        <div className="w-36">
                            <CustomSelect
                                items={[
                                    { label: t('settings.appearance.languages.zh-CN'), value: 'zh-CN' },
                                    { label: t('settings.appearance.languages.en-US'), value: 'en-US' },
                                ]}
                                value={config.language}
                                onChange={(val) => updateConfig({ language: val as any })}
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
                        <div className="w-36">
                            <CustomSelect
                                items={[
                                    { label: t('settings.layout.sidebarLeft'), value: 'left' },
                                    { label: t('settings.layout.sidebarRight'), value: 'right' },
                                ]}
                                value={config.ui.sidebarPosition}
                                onChange={(val) => updateUI({ sidebarPosition: val as any })}
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
                            className={`w-48 ${inputCls}`}
                        />
                    ),
                },
                {
                    label: t('settings.logFormat.bgImage'),
                    description: t('settings.logFormat.bgImageDesc'),
                    render: () => (
                        <div className="flex gap-2 items-center">
                            <input
                                type="text"
                                placeholder={t('settings.logFormat.bgImagePlaceholder')}
                                value={config.images.rxBackground || ''}
                                onChange={e => updateConfig(prev => ({ ...prev, images: { ...prev.images, rxBackground: e.target.value } }))}
                                className={`w-48 ${inputCls}`}
                            />
                            {config.images.rxBackground && <ImageIcon size={18} className="text-[var(--vscode-input-placeholder)]" />}
                        </div>
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

    const filteredColors = searchTerm
        ? colorSections
            .map(sec => {
                if (sec.title.toLowerCase().includes(lowerSearch)) return sec;
                const colors = sec.colors.filter(c => c.label.toLowerCase().includes(lowerSearch));
                return colors.length ? { ...sec, colors } : null;
            })
            .filter(Boolean) as typeof colorSections
        : colorSections;

    const hasResults = filteredSettings.length > 0 || filteredColors.length > 0;

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-editor-background)]">
            {/* 头部工具栏 */}
            <div className="h-[35px] flex items-center shrink-0 px-4 border-b border-[var(--vscode-border)] bg-[var(--vscode-editor-widget-bg)] justify-between">
                <span className="text-[13px] font-semibold text-[var(--vscode-fg)]">{t('settings.title')}</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleExportCurrentTheme}
                        className="p-1.5 text-[var(--vscode-input-placeholder)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] rounded transition-colors"
                        title="导出当前主题为 JSON"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        onClick={() => themeFileInputRef.current?.click()}
                        className="p-1.5 text-[var(--vscode-input-placeholder)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] rounded transition-colors"
                        title="导入主题文件"
                    >
                        <Upload size={14} />
                    </button>
                    <input type="file" ref={themeFileInputRef} className="hidden" accept=".json" onChange={handleImportTheme} />
                    <button
                        onClick={handleNewCustomTheme}
                        className="p-1.5 text-[var(--vscode-input-placeholder)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] rounded transition-colors"
                        title="基于当前主题新建自定义主题"
                    >
                        <Plus size={14} />
                    </button>
                    <div className="w-[1px] h-4 bg-[var(--vscode-border)] mx-1" />
                    <button
                        onClick={handleDownload}
                        className="p-1.5 text-[var(--vscode-input-placeholder)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] rounded transition-colors"
                        title={t('settings.exportTooltip')}
                    >
                        <Download size={14} />
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 text-[var(--vscode-input-placeholder)] hover:text-[var(--vscode-fg)] hover:bg-[var(--vscode-list-hover)] rounded transition-colors"
                        title={t('settings.importTooltip')}
                    >
                        <Upload size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <div className="w-[1px] h-4 bg-[var(--vscode-border)] mx-1" />
                    <button
                        onClick={handleReset}
                        className="p-1.5 text-[#f48771] hover:text-[#f8a190] hover:bg-[var(--vscode-list-hover)] rounded transition-colors"
                        title={t('settings.resetTooltip')}
                    >
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>

            {/* 搜索栏 */}
            <div className="p-6 bg-[var(--vscode-editor-background)]">
                <div className="max-w-3xl mx-auto relative group">
                    <Search
                        className="absolute left-3 top-2.5 text-[var(--vscode-input-placeholder)] group-focus-within:text-[var(--vscode-focusBorder)]"
                        size={16}
                    />
                    <input
                        type="text"
                        placeholder={t('settings.search')}
                        className="w-full bg-[var(--vscode-settings-header-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] pl-10 pr-4 py-2 text-[13px] outline-none focus:border-[var(--vscode-focusBorder)] shadow-sm"
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
                        <div className="text-center py-16 text-[var(--vscode-input-placeholder)] text-[13px]">
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

                    {/* 自定义主题管理区块（无搜索时显示） */}
                    {!searchTerm && config.customThemes.length > 0 && (
                        <Group title={t('settings.groups.customThemes')}>
                            {config.customThemes.map(theme => (
                                <div key={theme.id} className="flex items-center justify-between py-2 px-3 border-b border-[var(--vscode-settings-row-hover-bg)] last:border-0 hover:bg-[var(--vscode-list-hover)] group">
                                    <div className="flex items-center gap-2">
                                        {config.theme === theme.id && <Check size={12} className="text-[var(--vscode-accent)]" />}
                                        <span
                                            className="text-[13px] text-[var(--vscode-fg)] cursor-pointer hover:text-[var(--vscode-accent)]"
                                            onClick={() => setTheme(theme.id)}
                                        >
                                            {theme.name}
                                        </span>
                                        <span className="text-[11px] text-[var(--vscode-input-placeholder)] opacity-0 group-hover:opacity-100">{theme.id}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteCustomTheme(theme.id)}
                                        className="p-1 text-[var(--vscode-input-placeholder)] hover:text-[#f48771] opacity-0 group-hover:opacity-100 transition-all"
                                        title="删除此主题"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </Group>
                    )}

                    {/* 颜色设置区块 */}
                    {filteredColors.map((sec, i) => (
                        <Group key={`c-${i}`} title={sec.title}>
                            {sec.colors.map((c, j) => (
                                <ColorInput key={j} label={c.label} value={c.value} onChange={c.onChange} />
                            ))}
                        </Group>
                    ))}
                </div>
            </div>
        </div>
    );
};
