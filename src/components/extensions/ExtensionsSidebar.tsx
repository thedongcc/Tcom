import { useRef, useState } from 'react';
import { usePluginManager } from '../../context/PluginContextShared';
import { Box, Play, Pause, Trash2, Search, FolderOpen, ExternalLink, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { PLUGIN_REGISTRY } from '../../plugins/registry';
import { useI18n } from '../../context/I18nContext';

export const ExtensionsSidebar = () => {
    const { plugins, activatePlugin, deactivatePlugin, uninstallPlugin, registerPlugin, installFromJson } =
        usePluginManager();
    const { t } = useI18n();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [installError, setInstallError] = useState<string | null>(null);
    const [installedSection, setInstalledSection] = useState(true);
    const [recommendedSection, setRecommendedSection] = useState(true);

    // 计算状态
    const installedIds = new Set(plugins.map(p => p.plugin.id));
    const availablePlugins = PLUGIN_REGISTRY.filter(p => !installedIds.has(p.id));

    // 搜索过滤
    const lowerSearch = search.toLowerCase();
    const filteredInstalled = plugins.filter(p =>
        !lowerSearch ||
        p.plugin.name.toLowerCase().includes(lowerSearch) ||
        p.plugin.description?.toLowerCase().includes(lowerSearch)
    );
    const filteredAvailable = availablePlugins.filter(p =>
        !lowerSearch ||
        p.name.toLowerCase().includes(lowerSearch) ||
        p.description?.toLowerCase().includes(lowerSearch)
    );

    // 从文件安装
    const handleFileInstall = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const json = ev.target?.result as string;
            const result = installFromJson(json);
            if (!result.success) {
                setInstallError(result.error ?? '安装失败');
                setTimeout(() => setInstallError(null), 5000);
            } else {
                setInstallError(null);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const SectionHeader = ({
        title,
        count,
        expanded,
        onToggle,
    }: {
        title: string;
        count: number;
        expanded: boolean;
        onToggle: () => void;
    }) => (
        <button
            onClick={onToggle}
            className="w-full flex items-center gap-1 px-4 py-2 text-[11px] font-bold text-[var(--input-placeholder-color)] uppercase tracking-wide hover:text-[var(--app-foreground)] transition-colors"
        >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {title}
            <span className="ml-auto font-normal normal-case text-[10px] opacity-60">{count}</span>
        </button>
    );

    const PluginCard = ({
        id,
        name,
        version,
        description,
        author,
        homepage,
        icon: Icon,
        isActive,
        isExternal,
        actions,
    }: {
        id: string;
        name: string;
        version: string;
        description?: string;
        author?: string;
        homepage?: string;
        icon?: React.ComponentType<{ size?: number; className?: string }>;
        isActive?: boolean;
        isExternal?: boolean;
        actions: React.ReactNode;
    }) => {
        const isExpanded = expandedId === id;
        return (
            <div
                className="px-4 py-3 hover:bg-[var(--list-hover-background)] group border-l-2 border-transparent hover:border-[var(--focus-border-color)] transition-colors cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : id)}
            >
                <div className="flex gap-3">
                    {/* 图标 */}
                    <div className="pt-0.5 flex-shrink-0">
                        {Icon
                            ? <Icon size={36} className="text-[var(--app-foreground)] opacity-70" />
                            : <Box size={36} className="text-[var(--app-foreground)] opacity-40" />
                        }
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[13px] font-bold text-[var(--app-foreground)] truncate pr-2">{name}</span>
                            <div
                                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity flex-shrink-0"
                                onClick={e => e.stopPropagation()}
                            >
                                {actions}
                            </div>
                        </div>
                        <div className="text-[12px] text-[var(--input-placeholder-color)] truncate mb-1">{description}</div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--input-placeholder-color)]">
                            <span>{version}</span>
                            {author && <><span>•</span><span>{author}</span></>}
                            {isActive !== undefined && (
                                <>
                                    <span>•</span>
                                    <span className={isActive ? 'text-[#4ec9b0]' : 'text-[var(--input-placeholder-color)]'}>
                                        {isActive ? t('extensions.enabled') : t('extensions.disabled')}
                                    </span>
                                </>
                            )}
                            {isExternal && (
                                <>
                                    <span>•</span>
                                    <span className="text-[#ce9178]">{t('extensions.userInstalled')}</span>
                                </>
                            )}
                        </div>

                        {/* 展开详情 */}
                        {isExpanded && (
                            <div className="mt-2 pt-2 border-t border-[var(--border-color)] space-y-1">
                                <div className="text-[11px] text-[var(--app-foreground)] opacity-70">ID: <code className="font-mono">{id}</code></div>
                                {homepage && (
                                    <a
                                        href={homepage}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 text-[11px] text-[var(--accent-color)] hover:underline"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <ExternalLink size={11} />
                                        {homepage}
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-[var(--sidebar-background)]">
            {/* 搜索栏 */}
            <div className="p-2.5 border-b border-[var(--border-color)]">
                <div className="bg-[var(--input-background)] flex items-center px-2 py-1 border border-[var(--widget-border-color)] focus-within:border-[var(--focus-border-color)] transition-colors">
                    <Search size={14} className="text-[var(--input-placeholder-color)] mr-2 flex-shrink-0" />
                    <input
                        className="bg-transparent border-none outline-none text-[13px] text-[var(--input-foreground)] w-full placeholder-[var(--input-placeholder-color)]"
                        placeholder={t('extensions.searchPlaceholder')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* 从文件安装按钮 */}
            <div className="px-3 py-2 border-b border-[var(--border-color)]">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-[12px] text-[var(--app-foreground)] border border-[var(--widget-border-color)] hover:bg-[var(--list-hover-background)] hover:border-[var(--focus-border-color)] transition-colors"
                >
                    <FolderOpen size={13} />
                    {t('extensions.installFromFile')}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".tpkg,.json"
                    className="hidden"
                    onChange={handleFileInstall}
                />

                {/* 安装错误提示 */}
                {installError && (
                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-[#f48771] bg-[#5a1d1d] px-2 py-1.5 rounded">
                        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                        <span>{installError}</span>
                    </div>
                )}
            </div>

            {/* 列表区域 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* 已安装 */}
                <SectionHeader
                    title={t('extensions.installed')}
                    count={filteredInstalled.length}
                    expanded={installedSection}
                    onToggle={() => setInstalledSection(v => !v)}
                />
                {installedSection && (
                    <div>
                        {filteredInstalled.map(({ plugin, isActive, isExternal }) => (
                            <PluginCard
                                key={plugin.id}
                                id={plugin.id}
                                name={plugin.name}
                                version={plugin.version}
                                description={plugin.description}
                                author={(plugin as any).author}
                                homepage={(plugin as any).homepage}
                                icon={plugin.icon}
                                isActive={isActive}
                                isExternal={isExternal}
                                actions={
                                    <>
                                        {isActive ? (
                                            <button
                                                onClick={() => deactivatePlugin(plugin.id)}
                                                title={t('extensions.disable')}
                                                className="p-1 hover:bg-[var(--list-hover-background)] rounded text-[var(--app-foreground)] opacity-70 hover:opacity-100"
                                            >
                                                <Pause size={14} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => activatePlugin(plugin.id)}
                                                title={t('extensions.enable')}
                                                className="p-1 hover:bg-[var(--list-hover-background)] rounded text-[var(--app-foreground)] opacity-70 hover:opacity-100"
                                            >
                                                <Play size={14} />
                                            </button>
                                        )}
                                        {isExternal && (
                                            <button
                                                onClick={() => uninstallPlugin(plugin.id)}
                                                title={t('extensions.uninstall')}
                                                className="p-1 hover:bg-[#c53030] hover:text-white rounded text-[var(--app-foreground)] opacity-70 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </>
                                }
                            />
                        ))}
                        {filteredInstalled.length === 0 && (
                            <div className="px-4 py-3 text-[13px] text-[var(--input-placeholder-color)] italic">
                                {search ? t('extensions.noMatches') : t('extensions.noneInstalled')}
                            </div>
                        )}
                    </div>
                )}

                {/* 推荐（内置可安装） */}
                {filteredAvailable.length > 0 && (
                    <>
                        <SectionHeader
                            title={t('extensions.recommended')}
                            count={filteredAvailable.length}
                            expanded={recommendedSection}
                            onToggle={() => setRecommendedSection(v => !v)}
                        />
                        {recommendedSection && (
                            <div>
                                {filteredAvailable.map(plugin => (
                                    <PluginCard
                                        key={plugin.id}
                                        id={plugin.id}
                                        name={plugin.name}
                                        version={plugin.version}
                                        description={plugin.description}
                                        icon={plugin.icon}
                                        actions={
                                            <button
                                                onClick={() => registerPlugin(plugin)}
                                                className="px-2 py-0.5 bg-[var(--button-background,#0e639c)] hover:bg-[var(--button-hover-background,#1177bb)] text-white text-[11px] flex items-center gap-1 transition-colors"
                                            >
                                                {t('extensions.install')}
                                            </button>
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 底部提示 */}
            <div className="px-4 py-2 border-t border-[var(--border-color)] text-[10px] text-[var(--input-placeholder-color)]">
                <a
                    href="https://github.com/thedongcc/Tcom/blob/main/PLUGIN_API.md"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-[var(--app-foreground)] transition-colors"
                >
                    <ExternalLink size={10} />
                    {t('extensions.devDocs')}
                </a>
            </div>
        </div>
    );
};
