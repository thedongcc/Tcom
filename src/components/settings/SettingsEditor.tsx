import { useState, useRef, useEffect } from 'react';
import { Search, RotateCcw, Download, Upload, Image as ImageIcon, Pipette, Check, FolderOpen, FileJson, AlertTriangle, X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useI18n } from '../../context/I18nContext';
import { CustomSelect } from '../common/CustomSelect';
import { Tooltip } from '../common/Tooltip';
// ─── 分组容器 ─────────────────────────────────────────────────────────────────
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-8">
        <h3 className="text-[11px] font-bold text-[var(--app-foreground)] opacity-50 uppercase tracking-widest mb-3 px-2 border-l-2 border-[var(--focus-border-color)] ml-[-8px] pl-[6px]">
            {title}
        </h3>
        <div className="flex flex-col bg-[var(--editor-background)] rounded border border-[var(--border-color)] overflow-hidden">
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
    <div className="flex items-center justify-between py-3 border-b border-[var(--settings-row-hover-background)] last:border-0 hover:bg-[var(--list-hover-background)] px-3">
        <div className="flex flex-col flex-1 mr-4">
            <label className="text-[13px] text-[var(--app-foreground)] font-medium">{label}</label>
            {description && (
                <p className="text-[11px] text-[var(--input-placeholder-color)] mt-0.5">{description}</p>
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
            ? 'bg-[var(--checkbox-background)] border-[var(--checkbox-border-color)]'
            : 'bg-[var(--input-background)] border-[var(--input-border-color)]'
            }`}
    >
        {checked && <Check size={12} className="text-[var(--checkbox-foreground)]" />}
    </div>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export const SettingsEditor = () => {
    const { config, availableThemes, loadThemes, updateConfig, updateUI, setTheme, resetConfig, importConfig, exportConfig } =
        useSettings();
    const { confirm } = useConfirm();
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');
    const [systemFonts, setSystemFonts] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const themeFileInputRef = useRef<HTMLInputElement>(null);

    // Factory Reset State
    const [showFactoryReset, setShowFactoryReset] = useState(false);
    const [resetInput, setResetInput] = useState('');
    const resetKeyword = t('settings.factoryResetKeyword'); // "RESET"
    const canFactoryReset = resetInput === resetKeyword;

    const performFactoryReset = async () => {
        if (!canFactoryReset) return;
        try {
            if (!(window as any).appAPI) {
                alert('appAPI 未定义，请完全重启应用以加载最新的主进程和预加载脚本！\nappAPI is undefined, please restart the app fully.');
                return;
            }
            const res = await (window as any).appAPI.factoryReset();
            if (res && res.success === false) {
                alert('重置失败 (Reset Failed):\n' + res.error);
            }
        } catch (e: any) {
            console.error(e);
            alert('重置期间发生异常:\n' + e.message);
        }
    };

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



    // 通用样式
    const inputCls =
        'bg-[var(--input-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] text-[13px] px-2 h-7 outline-none focus:border-[var(--focus-border-color)] rounded-[4px]';

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
                                        (window as any).themeAPI?.openFolder();
                                    }}
                                    className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)] rounded transition-colors cursor-pointer flex-shrink-0"
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
                                            (window as any).themeAPI?.openFile(currentDef.id);
                                        }
                                    }}
                                    className="p-1 text-[var(--input-placeholder-color)] hover:text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)] rounded transition-colors cursor-pointer flex-shrink-0"
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
                        <div className="w-56">
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
                            className={`w-56 ${inputCls}`}
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
                                className={`w-56 ${inputCls}`}
                            />
                            {config.images.rxBackground && <ImageIcon size={18} className="text-[var(--input-placeholder-color)]" />}
                        </div>
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
                            onClick={() => {
                                setResetInput('');
                                setShowFactoryReset(true);
                            }}
                            className="bg-[#a1260d] hover:bg-[#c93f24] text-white px-3 py-1.5 rounded-[3px] text-xs transition-colors"
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



    const hasResults = filteredSettings.length > 0;

    return (
        <div className="flex flex-col h-full bg-[var(--editor-background)]">
            {/* 头部工具栏 */}
            <div className="h-[35px] flex items-center shrink-0 px-4 border-b border-[var(--border-color)] bg-[var(--widget-background)] justify-between">
                <span className="text-[13px] font-semibold text-[var(--app-foreground)]">{t('settings.title')}</span>
                <div className="flex items-center gap-1">

                    <Tooltip content={t('settings.exportTooltip')} position="bottom">
                        <button
                            onClick={handleDownload}
                            className="p-1.5 text-[var(--input-placeholder-color)] hover:text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)] rounded transition-colors"
                        >
                            <Download size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('settings.importTooltip')} position="bottom">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 text-[var(--input-placeholder-color)] hover:text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)] rounded transition-colors"
                        >
                            <Upload size={14} />
                        </button>
                    </Tooltip>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <div className="w-[1px] h-4 bg-[var(--border-color)] mx-1" />
                    <Tooltip content={t('settings.resetTooltip')} position="bottom">
                        <button
                            onClick={handleReset}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-[var(--list-hover-background)] rounded transition-colors"
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

                </div>
            </div>

            {/* Factory Reset Confirmation Dialog */}
            {showFactoryReset && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className="bg-[#252526] border border-[#a1260d] shadow-2xl w-[450px] flex flex-col rounded-md overflow-hidden animate-in zoom-in-95 fade-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-3 border-b border-[#3c3c3c] bg-[#a1260d]/20">
                            <span className="text-[12px] font-bold text-[#f48771] uppercase tracking-wider flex items-center gap-2">
                                <AlertTriangle size={14} />
                                {t('settings.factoryResetDialogTitle')}
                            </span>
                            <button onClick={() => setShowFactoryReset(false)} className="text-[#cccccc] hover:text-white transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="p-5">
                            <p className="text-[13px] text-[#cccccc] leading-relaxed whitespace-pre-wrap mb-4">
                                {t('settings.factoryResetDialogMessage', { keyword: resetKeyword })}
                            </p>
                            <input
                                autoFocus
                                type="text"
                                className="w-full bg-[var(--input-background)] border border-[var(--input-border-color)] p-2 text-sm text-[var(--input-foreground)] outline-none focus:border-[#a1260d] rounded"
                                placeholder={resetKeyword}
                                value={resetInput}
                                onChange={e => setResetInput(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2 p-3 bg-[#1e1e1e] border-t border-[#3c3c3c]">
                            <button
                                onClick={() => setShowFactoryReset(false)}
                                className="px-4 py-1.5 text-[#cccccc] hover:bg-[#3c3c3c] rounded-sm text-xs transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                disabled={!canFactoryReset}
                                onClick={performFactoryReset}
                                className={`px-4 py-1.5 text-white rounded-sm text-xs transition-all flex items-center gap-2 ${canFactoryReset ? 'bg-[#a1260d] hover:bg-[#c93f24] cursor-pointer' : 'bg-[#3c3c3c] text-[#888] cursor-not-allowed opacity-50'}`}
                            >
                                {canFactoryReset && <AlertTriangle size={12} />}
                                {t('settings.factoryResetBtn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
