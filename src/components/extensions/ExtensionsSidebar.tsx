import { usePluginManager } from '../../context/PluginContext';
import { Box, Play, Pause, Trash2, Download, Search } from 'lucide-react';
import { Plugin } from '../../types/plugin';
import { PLUGIN_REGISTRY } from '../../plugins/registry';

export const ExtensionsSidebar = () => {
    const { plugins, activatePlugin, deactivatePlugin, uninstallPlugin, registerPlugin } = usePluginManager();

    // Compute status
    const installedIds = new Set(plugins.map(p => p.plugin.id));
    const availablePlugins = PLUGIN_REGISTRY.filter(p => !installedIds.has(p.id));

    return (
        <div className="flex flex-col h-full bg-[#252526]">
            {/* Search Header */}
            <div className="p-2.5">
                <div className="bg-[#3c3c3c] flex items-center px-2 py-1 rounded-sm border border-transparent focus-within:border-[var(--vscode-focusBorder)]">
                    <Search size={14} className="text-[#969696] mr-2" />
                    <input
                        className="bg-transparent border-none outline-none text-[13px] text-[#cccccc] w-full placeholder-[#969696]"
                        placeholder="Search Extensions..."
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">

                {/* Installed Section */}
                <div className="px-4 py-2 text-[11px] font-bold text-[#969696] uppercase tracking-wide">
                    INSTALLED
                </div>
                <div>
                    {plugins.map(({ plugin, isActive }) => (
                        <div key={plugin.id} className="px-4 py-3 hover:bg-[#2a2d2e] group flex gap-3 border-l-2 border-transparent hover:border-l-2 hover:border-transparent">
                            <div className="pt-0.5">
                                {plugin.icon ? <plugin.icon size={36} strokeWidth={1} className="text-[#cccccc]" /> : <Box size={36} strokeWidth={1} className="text-[#cccccc]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[13px] font-bold text-[#cccccc] truncate pr-2">{plugin.name}</span>
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                        {isActive ? (
                                            <button onClick={() => deactivatePlugin(plugin.id)} title="Disable" className="p-1 hover:bg-[#3c3c3c] rounded text-[#cccccc]">
                                                <Pause size={14} />
                                            </button>
                                        ) : (
                                            <button onClick={() => activatePlugin(plugin.id)} title="Enable" className="p-1 hover:bg-[#3c3c3c] rounded text-[#cccccc]">
                                                <Play size={14} />
                                            </button>
                                        )}
                                        <button onClick={() => uninstallPlugin(plugin.id)} title="Uninstall" className="p-1 hover:bg-[#c53030] hover:text-white rounded text-[#cccccc]">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-[12px] text-[#969696] truncate mb-1">{plugin.description}</div>
                                <div className="flex items-center gap-2 text-[11px] text-[#969696]">
                                    <span>{plugin.version}</span>
                                    <span>•</span>
                                    <span className={isActive ? 'text-[#4ec9b0]' : 'text-[#969696]'}>{isActive ? 'Enabled' : 'Disabled'}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {plugins.length === 0 && (
                        <div className="px-4 py-2 text-[13px] text-[#969696] italic">No extensions installed.</div>
                    )}
                </div>

                {/* Recommended / Available Section */}
                {availablePlugins.length > 0 && (
                    <>
                        <div className="px-4 py-2 mt-4 text-[11px] font-bold text-[#969696] uppercase tracking-wide">
                            RECOMMENDED
                        </div>
                        <div>
                            {availablePlugins.map(plugin => (
                                <div key={plugin.id} className="px-4 py-3 hover:bg-[#2a2d2e] group flex gap-3">
                                    <div className="pt-0.5">
                                        {plugin.icon ? <plugin.icon size={36} strokeWidth={1} className="text-[#cccccc]" /> : <Box size={36} strokeWidth={1} className="text-[#cccccc]" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-[13px] font-bold text-[#cccccc] truncate pr-2">{plugin.name}</span>
                                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                                <button
                                                    onClick={() => registerPlugin(plugin)}
                                                    className="px-2 py-0.5 bg-[#0e639c] hover:bg-[#1177bb] text-white text-[11px] rounded-sm flex items-center gap-1"
                                                >
                                                    Install
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-[12px] text-[#969696] truncate mb-1">{plugin.description}</div>
                                        <div className="flex items-center gap-2 text-[11px] text-[#969696]">
                                            <span>{plugin.version}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
