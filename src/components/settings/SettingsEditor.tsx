import { useState, useRef } from 'react';
import { Search, RotateCcw, Download, Upload, Image as ImageIcon, Pipette } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const ColorInput = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const openEyeDropper = async () => {
        if (!('EyeDropper' in window)) return;
        try {
            const eyeDropper = new (window as any).EyeDropper();
            const result = await eyeDropper.open();
            onChange(result.sRGBHex);
        } catch (e) {
            // User cancelled or error
        }
    };

    return (
        <div className="flex items-center justify-between py-2 border-b border-[var(--vscode-settings-row-hover-bg)] hover:bg-[var(--vscode-list-hover)] px-2 group">
            <label className="text-[13px] text-[var(--vscode-fg)]">{label}</label>
            <div className="flex items-center gap-2">
                {/* Visual Swatch / Trigger */}
                <div
                    className="w-5 h-5 rounded border border-[#3c3c3c] cursor-pointer shadow-sm relative overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: value || '#000000' }}
                    onClick={() => inputRef.current?.click()}
                    title="Click to pick color"
                >
                    <input
                        ref={inputRef}
                        type="color"
                        value={(value && value.length === 7) ? value : '#000000'}
                        onChange={e => onChange(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full p-0 border-none"
                    />
                </div>

                {/* Eyedropper Button (if supported) */}
                {'EyeDropper' in window && (
                    <button
                        onClick={openEyeDropper}
                        className="p-1 text-[#969696] hover:text-[#cccccc] hover:bg-[#3c3c3c] rounded transition-colors"
                        title="Pick color from screen"
                    >
                        <Pipette size={14} />
                    </button>
                )}

                {/* Text Input */}
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-20 bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] text-[12px] px-1 py-0.5 outline-none focus:border-[var(--vscode-focusBorder)] uppercase font-mono text-center"
                    spellCheck={false}
                />
            </div>
        </div>
    );
};

const Group = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="mb-6">
        <h3 className="text-[11px] font-bold text-[var(--vscode-fg)] opacity-60 uppercase tracking-wider mb-2 px-2">{title}</h3>
        <div className="flex flex-col">
            {children}
        </div>
    </div>
);

export const SettingsEditor = () => {
    const { config, updateColors, updateConfig, resetConfig, importConfig, exportConfig } = useSettings();
    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    importConfig(ev.target.result as string);
                }
            };
            reader.readAsText(file);
        }
    };

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

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-bg)]">
            {/* Header */}
            <div className="h-[35px] flex items-center shrink-0 px-4 border-b border-[var(--vscode-border)] bg-[var(--vscode-editor-widget-bg)] justify-between">
                <div className="flex items-center gap-2 text-[13px] text-[var(--vscode-fg)]">
                    <span className="font-semibold">User Settings</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleDownload} className="p-1 text-[#969696] hover:text-[#cccccc]" title="Export Settings">
                        <Download size={14} />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="p-1 text-[#969696] hover:text-[#cccccc]" title="Import Settings">
                        <Upload size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <button onClick={resetConfig} className="p-1 text-[#969696] hover:text-[#cccccc]" title="Reset to Defaults">
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-[var(--vscode-border)]">
                <div className="relative">
                    <Search className="absolute left-2 top-1.5 text-[#969696]" size={14} />
                    <input
                        type="text"
                        placeholder="Search settings..."
                        className="w-full bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] pl-8 pr-2 py-1 text-[13px] outline-none focus:border-[var(--vscode-focusBorder)]"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Content using default VSCode variable colors for UI, but controls specific vars for Serial Monitor */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">



                <Group title="Serial Monitor Colors">
                    <ColorInput label="Received Label (RX)" value={config.colors.rxLabelColor} onChange={v => updateColors({ rxLabelColor: v })} />
                    <ColorInput label="Sent Label (TX)" value={config.colors.txLabelColor} onChange={v => updateColors({ txLabelColor: v })} />
                    <ColorInput label="Received Text Color (RX)" value={config.colors.rxTextColor} onChange={v => updateColors({ rxTextColor: v })} />
                    <ColorInput label="Sent Text Color (TX)" value={config.colors.txTextColor} onChange={v => updateColors({ txTextColor: v })} />
                    <ColorInput label="Received Background (RX)" value={config.colors.rxBgColor} onChange={v => updateColors({ rxBgColor: v })} />
                    <ColorInput label="Input Area Background" value={config.colors.inputBgColor} onChange={v => updateColors({ inputBgColor: v })} />
                    <ColorInput label="Input Text Color" value={config.colors.inputTextColor} onChange={v => updateColors({ inputTextColor: v })} />
                    <ColorInput label="Timestamp Color" value={config.colors.timestampColor} onChange={v => updateColors({ timestampColor: v })} />
                    <ColorInput label="Info Text Color" value={config.colors.infoColor} onChange={v => updateColors({ infoColor: v })} />
                    <ColorInput label="Error Text Color" value={config.colors.errorColor} onChange={v => updateColors({ errorColor: v })} />
                </Group>

                <Group title="Tokens">
                    <ColorInput label="CRC Token Color" value={config.colors.crcTokenColor} onChange={v => updateColors({ crcTokenColor: v })} />
                    <ColorInput label="Flag Token Color" value={config.colors.flagTokenColor} onChange={v => updateColors({ flagTokenColor: v })} />
                    <ColorInput label="Accent / Highlight" value={config.colors.accentColor} onChange={v => updateColors({ accentColor: v })} />
                </Group>

                <Group title="Typography">
                    <div className="py-2 px-2 border-b border-[var(--vscode-settings-row-hover-bg)]">
                        <label className="block text-[13px] text-[var(--vscode-fg)] mb-1">Font Family</label>
                        <input
                            type="text"
                            value={config.typography.fontFamily}
                            onChange={e => updateConfig(prev => ({ ...prev, typography: { ...prev.typography, fontFamily: e.target.value } }))}
                            className="w-full bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] text-[12px] px-2 py-1 outline-none focus:border-[var(--vscode-focusBorder)]"
                        />
                    </div>
                </Group>

                <Group title="Background Images">
                    <div className="py-2 px-2">
                        <label className="block text-[13px] text-[var(--vscode-fg)] mb-1">RX Area Background URL</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="https://... or data:image/..."
                                value={config.images.rxBackground || ''}
                                onChange={e => updateConfig(prev => ({ ...prev, images: { ...prev.images, rxBackground: e.target.value } }))}
                                className="flex-1 bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] text-[12px] px-2 py-1 outline-none focus:border-[var(--vscode-focusBorder)]"
                            />
                            {config.images.rxBackground && <ImageIcon size={20} className="text-[#969696]" />}
                        </div>
                    </div>
                </Group>

                <Group title="Log Formatting">
                    <div className="py-2 px-2">
                        <label className="block text-[13px] text-[var(--vscode-fg)] mb-1">Timestamp Format</label>
                        <input
                            type="text"
                            placeholder="HH:mm:ss.SSS"
                            value={config.timestampFormat}
                            onChange={e => updateConfig({ timestampFormat: e.target.value })}
                            className="w-full bg-[var(--vscode-input-bg)] text-[var(--vscode-input-fg)] border border-[var(--vscode-input-border)] text-[12px] px-2 py-1 outline-none focus:border-[var(--vscode-focusBorder)]"
                        />
                        <p className="text-[11px] text-[#969696] mt-1">Format symbols: HH, mm, ss, SSS (Milliseconds)</p>
                    </div>
                </Group>
            </div>

        </div>
    );
};
