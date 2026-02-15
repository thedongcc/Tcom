import { useEffect, useRef, useState } from 'react';
import { Token, CRCConfig, FlagConfig, HexConfig } from '../../types/token';
import { X, Check, ChevronDown } from 'lucide-react';

interface TokenConfigPopoverProps {
    token: Token;
    onUpdate: (id: string, newConfig: any) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

export const TokenConfigPopover = ({ token, onUpdate, onDelete, onClose, position }: TokenConfigPopoverProps) => {
    console.log('TokenConfigPopover Rendering:', { token, position });
    const popoverRef = useRef<HTMLDivElement>(null);
    const [config, setConfig] = useState<CRCConfig | FlagConfig | HexConfig>(token.config);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleSave = () => {
        onUpdate(token.id, config);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
    };

    const renderContent = () => {
        if (token.type === 'flag') {
            const flagConfig = config as FlagConfig;
            return (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696]">Name (Optional)</label>
                        <input
                            type="text"
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                            value={flagConfig.name || ''}
                            placeholder="e.g. Frame Header"
                            onChange={e => setConfig({ ...flagConfig, name: e.target.value })}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696]">Hex Content</label>
                        <textarea
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] h-20 font-mono resize-none"
                            value={flagConfig.hex || ''}
                            placeholder="AA BB CC"
                            onChange={e => {
                                // Simple hex validation/filter could be added here
                                setConfig({ ...flagConfig, hex: e.target.value });
                            }}
                            onKeyDown={handleKeyDown}
                        />
                        <p className="text-[10px] text-[#666]">Enter hex bytes separated by space</p>
                    </div>
                </div>
            );
        }

        if (token.type === 'hex') {
            const hexConfig = config as HexConfig;
            return (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696]">Byte Width</label>
                        <input
                            type="number"
                            min="1"
                            max="8"
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                            value={hexConfig.byteWidth || 1}
                            onChange={e => setConfig({ ...hexConfig, byteWidth: Math.max(1, parseInt(e.target.value) || 1) })}
                            onKeyDown={handleKeyDown}
                        />
                        <p className="text-[10px] text-[#666]">Target size in bytes (pads with 00 or truncates)</p>
                    </div>
                </div>
            );
        }

        if (token.type === 'crc') {
            const crcConfig = config as CRCConfig;
            return (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696] mb-1">Algorithm</label>
                        <div className="relative">
                            <select
                                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] appearance-none pr-8"
                                value={crcConfig.algorithm}
                                onChange={e => setConfig({ ...crcConfig, algorithm: e.target.value as any })}
                                onKeyDown={handleKeyDown}
                            >
                                <option value="modbus-crc16">Modbus CRC16 (LE)</option>
                                <option value="ccitt-crc16">CCITT CRC16 (BE)</option>
                                <option value="crc32">CRC32</option>
                            </select>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                <ChevronDown size={12} />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 my-1 text-[10px] font-bold text-[#666] whitespace-nowrap">
                        <span>Range Settings</span>
                        <div className="h-[1px] bg-[#3c3c3c] flex-1 mt-0.5" />
                    </div>

                    <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-[#969696]">Start Offset</label>
                            <input
                                type="number"
                                className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                                value={crcConfig.startIndex}
                                onChange={e => setConfig({ ...crcConfig, startIndex: parseInt(e.target.value) || 0 })}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-[#969696]">End</label>
                            <div className="relative">
                                <select
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] appearance-none pr-8"
                                    value={crcConfig.endIndex ?? 0}
                                    onChange={e => setConfig({ ...crcConfig, endIndex: parseInt(e.target.value) })}
                                    onKeyDown={handleKeyDown}
                                >
                                    <option value="0">末尾 (End)</option>
                                    <option value="-1">-1</option>
                                    <option value="-2">-2</option>
                                    <option value="-3">-3</option>
                                </select>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                    <ChevronDown size={12} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (token.type === 'timestamp') {
            const tsConfig = config as any;
            return (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#cccccc] mb-1">Format</label>
                        <div className="relative">
                            <select
                                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] appearance-none pr-8"
                                value={tsConfig.format || 'seconds'}
                                onChange={e => setConfig({ ...tsConfig, format: e.target.value })}
                                onKeyDown={handleKeyDown}
                            >
                                <option value="seconds">Seconds (4-byte)</option>
                                <option value="milliseconds">Milliseconds (8-byte)</option>
                            </select>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                <ChevronDown size={12} />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#cccccc] mb-1">Byte Order</label>
                        <div className="relative">
                            <select
                                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1.5 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)] appearance-none pr-8"
                                value={tsConfig.byteOrder || 'big'}
                                onChange={e => setConfig({ ...tsConfig, byteOrder: e.target.value })}
                                onKeyDown={handleKeyDown}
                            >
                                <option value="big">Big Endian</option>
                                <option value="little">Little Endian</option>
                            </select>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#969696]">
                                <ChevronDown size={12} />
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return null;
    };

    // State for drag and resize
    // We initialize size.
    const [size, setSize] = useState({ width: 300, height: 320 });
    // We initialize pos from props, but allow dragging.
    const [pos, setPos] = useState({ x: position.x, y: position.y });

    // Adjust initial position to fit screen if needed logic moved to effect?
    // Actually, we can just use the prop position as initial state, but we need to handle "prop changes" if we want to reset.
    // However, usually popover is remounted.
    // Let's ensure it doesn't spawn offscreen.
    useEffect(() => {
        const POPOVER_HEIGHT = 320;
        const screenH = window.innerHeight;
        const screenW = window.innerWidth;

        let newY = position.y + 24;
        if (newY + POPOVER_HEIGHT > screenH) {
            newY = Math.max(10, position.y - POPOVER_HEIGHT - 10);
        }
        let newX = Math.min(position.x, screenW - 320);

        setPos({ x: newX, y: newY });
    }, []); // Run once on mount

    // Drag Logic
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleMouseDownHeader = (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        dragOffset.current = {
            x: e.clientX - pos.x,
            y: e.clientY - pos.y
        };
        document.addEventListener('mousemove', handleMouseMoveDrag);
        document.addEventListener('mouseup', handleMouseUpDrag);
    };

    const handleMouseMoveDrag = (e: MouseEvent) => {
        if (!isDragging.current) return;
        setPos({
            x: e.clientX - dragOffset.current.x,
            y: e.clientY - dragOffset.current.y
        });
    };

    const handleMouseUpDrag = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMoveDrag);
        document.removeEventListener('mouseup', handleMouseUpDrag);
    };

    // Resize Logic
    const isResizing = useRef(false);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    const handleMouseDownResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Don't trigger drag
        isResizing.current = true;
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            w: size.width,
            h: size.height
        };
        document.addEventListener('mousemove', handleMouseMoveResize);
        document.addEventListener('mouseup', handleMouseUpResize);
    };

    const handleMouseMoveResize = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;

        setSize({
            width: Math.max(200, resizeStart.current.w + dx),
            height: Math.max(150, resizeStart.current.h + dy)
        });
    };

    const handleMouseUpResize = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMoveResize);
        document.removeEventListener('mouseup', handleMouseUpResize);
    };

    if (token.type !== 'crc' && token.type !== 'flag' && token.type !== 'timestamp') return null;

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 bg-[#252526] border border-[var(--vscode-widget-border)] shadow-xl rounded-md flex flex-col text-[var(--vscode-fg)] select-none"
            style={{
                left: pos.x,
                top: pos.y,
                width: size.width,
                height: size.height
            }}
        >
            <style>
                {`
                    input[type=number]::-webkit-inner-spin-button,
                    input[type=number]::-webkit-outer-spin-button {
                        -webkit-appearance: none;
                        margin: 0;
                    }
                    input[type=number] {
                        -moz-appearance: textfield;
                    }
                `}
            </style>
            <div
                className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-border)] bg-[#2d2d2d] cursor-move select-none"
                onMouseDown={handleMouseDownHeader}
            >
                <span className="text-xs font-bold uppercase tracking-wide">{token.type === 'crc' ? 'CRC Config' : token.type === 'timestamp' ? 'Timestamp Config' : 'Custom Flag'}</span>
                <div className="flex gap-2">
                    <X size={14} className="cursor-pointer hover:text-white" onClick={onClose} />
                </div>
            </div>

            <div className="flex-1 overflow-auto p-3 flex flex-col">
                {renderContent()}

                <div className="mt-auto pt-3 flex items-center justify-between border-t border-[var(--vscode-border)]">
                    <button
                        className="px-2 py-1 text-[11px] text-[#f48771] hover:bg-[#4b1818] rounded"
                        onClick={() => { onDelete(token.id); onClose(); }}
                    >
                        Delete
                    </button>
                    <button
                        className="px-3 py-1 bg-[var(--vscode-button-bg)] text-white text-[12px] rounded hover:bg-[var(--vscode-button-hover-bg)] flex items-center gap-1"
                        onClick={handleSave}
                    >
                        <Check size={12} /> Apply
                    </button>
                </div>
            </div>

            {/* Resize Handle (Bottom-Right) */}
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 flex items-center justify-center opacity-50 hover:opacity-100"
                onMouseDown={handleMouseDownResize}
            >
                <div className="w-2 h-2 border-r-2 border-b-2 border-[#666]" />
            </div>
        </div>
    );
};
