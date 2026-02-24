import { useEffect, useRef, useState } from 'react';
import { Token, CRCConfig, FlagConfig, HexConfig, TimestampConfig, AutoIncConfig } from '../../types/token';
import { X, Check, ChevronDown } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';

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
    const [config, setConfig] = useState<CRCConfig | FlagConfig | HexConfig | TimestampConfig | AutoIncConfig>(token.config);
    // Local state for bytes input to allow temporary empty string
    const [bytesInput, setBytesInput] = useState<string>((token.config as any).bytes?.toString() || '1');
    // Local state for step input to allow temporary '-' sign or empty string
    const [stepInput, setStepInput] = useState<string>((token.config as any).step?.toString() || '0');
    // Local state for CRC range inputs
    const [startIndexInput, setStartIndexInput] = useState<string>((token.config as any).startIndex?.toString() || '0');
    const [endIndexInput, setEndIndexInput] = useState<string>((token.config as any).endIndex?.toString() || '0');
    const [hexByteWidthInput, setHexByteWidthInput] = useState<string>((token.config as any).byteWidth?.toString() || '1');

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
        let finalConfig = { ...config };

        // When updating auto_inc, we reset currentValue to defaultValue as well
        if (token.type === 'auto_inc') {
            const auto = finalConfig as AutoIncConfig;
            // Pad or truncate defaultValue to matches bytes
            let hex = auto.defaultValue.replace(/\s/g, '');
            const targetNibbles = auto.bytes * 2;
            if (hex.length < targetNibbles) {
                hex = hex.padStart(targetNibbles, '0');
            } else if (hex.length > targetNibbles) {
                hex = hex.substring(hex.length - targetNibbles);
            }
            auto.defaultValue = hex;
            auto.currentValue = hex;
        }

        if (token.type === 'hex') {
            const hex = finalConfig as HexConfig;
            hex.byteWidth = Math.max(1, Math.min(8, hex.byteWidth || 1));
        }

        onUpdate(token.id, finalConfig);
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
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Name (Optional)</label>
                        <input
                            type="text"
                            className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] text-[var(--input-foreground)] placeholder-[var(--input-placeholder-color)]"
                            value={flagConfig.name || ''}
                            placeholder="e.g. Frame Header"
                            onChange={e => setConfig({ ...flagConfig, name: e.target.value })}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Hex Content</label>
                        <textarea
                            className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] p-2 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] h-24 font-mono resize-none text-[var(--input-foreground)] placeholder-[var(--input-placeholder-color)] leading-relaxed"
                            value={flagConfig.hex || ''}
                            placeholder="AA BB CC"
                            onChange={e => {
                                setConfig({ ...flagConfig, hex: e.target.value.replace(/[^0-9A-Fa-f\s]/g, '') });
                            }}
                            onKeyDown={handleKeyDown}
                        />
                        <p className="text-[10px] text-[var(--activitybar-inactive-foreground)] leading-snug">Enter hex bytes separated by space</p>
                    </div>
                </div>
            );
        }

        if (token.type === 'hex') {
            const hexConfig = config as HexConfig;
            return (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Byte Width</label>
                        <input
                            type="text"
                            className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] text-[var(--input-foreground)] w-16"
                            value={hexByteWidthInput}
                            onChange={e => {
                                const val = e.target.value.replace(/\D/g, '');
                                setHexByteWidthInput(val);
                                if (val !== '') {
                                    setConfig({ ...hexConfig, byteWidth: Math.max(1, Math.min(8, parseInt(val) || 1)) });
                                }
                            }}
                            onBlur={() => {
                                const final = Math.max(1, Math.min(8, parseInt(hexByteWidthInput) || 1));
                                setHexByteWidthInput(final.toString());
                                setConfig({ ...hexConfig, byteWidth: final });
                            }}
                            onKeyDown={handleKeyDown}
                        />
                        <p className="text-[10px] text-[var(--activitybar-inactive-foreground)] leading-snug">Target size in bytes (1-8)</p>
                    </div>
                </div>
            );
        }

        if (token.type === 'crc') {
            const crcConfig = config as CRCConfig;
            const algoItems = [
                { label: 'Modbus CRC16 (LE)', value: 'modbus-crc16' },
                { label: 'CCITT CRC116 (BE)', value: 'ccitt-crc16' },
                { label: 'CRC32', value: 'crc32' },
            ];
            const endItems = [
                { label: '末尾 (End)', value: '0' },
                { label: '-1 (Last)', value: '-1' },
                { label: '-2', value: '-2' },
                { label: '-3', value: '-3' },
            ];

            return (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Algorithm</label>
                        <CustomSelect
                            items={algoItems}
                            value={crcConfig.algorithm}
                            onChange={(val) => setConfig({ ...crcConfig, algorithm: val as any })}
                        />
                    </div>

                    <div className="flex items-center gap-2 my-1">
                        <span className="text-[10px] font-bold text-[var(--input-placeholder-color)] uppercase tracking-[0.1em] whitespace-nowrap">Range Settings</span>
                        <div className="h-[1px] bg-[var(--border-color)] flex-1 mt-0.5" />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1.5 flex-none w-20">
                            <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Start</label>
                            <input
                                type="text"
                                className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] text-[var(--input-foreground)]"
                                value={startIndexInput}
                                onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    setStartIndexInput(val);
                                    if (val !== '') {
                                        setConfig({ ...crcConfig, startIndex: parseInt(val) || 0 });
                                    }
                                }}
                                onBlur={() => {
                                    const final = parseInt(startIndexInput) || 0;
                                    setStartIndexInput(final.toString());
                                    setConfig({ ...crcConfig, startIndex: final });
                                }}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">End</label>
                            <CustomSelect
                                items={endItems}
                                value={(crcConfig.endIndex ?? 0).toString()}
                                onChange={(val) => {
                                    setEndIndexInput(val);
                                    setConfig({ ...crcConfig, endIndex: parseInt(val) });
                                }}
                            />
                        </div>
                    </div>
                </div>
            );
        }

        if (token.type === 'timestamp') {
            const tsConfig = config as any;
            const formatItems = [
                { label: 'Seconds (4-byte)', value: 'seconds' },
                { label: 'Milliseconds (8-byte)', value: 'milliseconds' },
            ];
            const orderItems = [
                { label: 'Big Endian (BE)', value: 'big' },
                { label: 'Little Endian (LE)', value: 'little' },
            ];

            return (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Format</label>
                        <CustomSelect
                            items={formatItems}
                            value={tsConfig.format || 'seconds'}
                            onChange={(val) => setConfig({ ...tsConfig, format: val })}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Byte Order</label>
                        <CustomSelect
                            items={orderItems}
                            value={tsConfig.byteOrder || 'big'}
                            onChange={(val) => setConfig({ ...tsConfig, byteOrder: val })}
                        />
                    </div>
                </div>
            );
        }

        if (token.type === 'auto_inc') {
            const autoConfig = config as AutoIncConfig;
            return (
                <div className="flex flex-col gap-4">
                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1.5 flex-none w-16">
                            <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Bytes</label>
                            <input
                                type="text"
                                className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] text-[var(--input-foreground)]"
                                value={bytesInput}
                                onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    setBytesInput(val);
                                    if (val !== '') {
                                        const bytes = Math.max(1, Math.min(8, parseInt(val) || 1));
                                        setConfig({ ...autoConfig, bytes });
                                    }
                                }}
                                onBlur={() => {
                                    const bytes = Math.max(1, Math.min(8, parseInt(bytesInput) || 1));
                                    setBytesInput(bytes.toString());
                                    setConfig({ ...autoConfig, bytes });
                                }}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Initial Val (Hex)</label>
                            <input
                                type="text"
                                className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] font-mono text-[var(--input-foreground)] placeholder-[var(--input-placeholder-color)]"
                                value={autoConfig.defaultValue || ''}
                                placeholder="00 00 05"
                                onChange={e => {
                                    const val = e.target.value.replace(/[^0-9A-Fa-f\s]/g, '');
                                    setConfig({ ...autoConfig, defaultValue: val });
                                }}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-[var(--input-placeholder-color)] uppercase tracking-wider">Step (Offset)</label>
                        <input
                            type="text"
                            className="bg-[var(--input-background)] border border-[var(--input-border-color)] text-[12px] px-2 h-7 outline-none rounded-[4px] focus:border-[var(--focus-border-color)] text-[var(--input-foreground)]"
                            value={stepInput}
                            onChange={e => {
                                const val = e.target.value;
                                if (val === '' || val === '-' || !isNaN(Number(val))) {
                                    setStepInput(val);
                                    const parsed = parseInt(val);
                                    if (!isNaN(parsed)) {
                                        setConfig({ ...autoConfig, step: parsed });
                                    }
                                }
                            }}
                            onBlur={() => {
                                const parsed = parseInt(stepInput);
                                const finalStep = isNaN(parsed) ? 0 : parsed;
                                setStepInput(finalStep.toString());
                                setConfig({ ...autoConfig, step: finalStep });
                            }}
                            onKeyDown={handleKeyDown}
                        />
                        <p className="text-[10px] text-[var(--activitybar-inactive-foreground)] leading-snug">Added after each send (can be negative)</p>
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

    if (token.type !== 'crc' && token.type !== 'flag' && token.type !== 'timestamp' && token.type !== 'auto_inc') return null;

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 bg-[var(--menu-background)] border border-[var(--widget-border-color)] shadow-xl rounded-md flex flex-col text-[var(--app-foreground)] select-none"
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
                className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--widget-background)] cursor-move select-none rounded-t-md"
                onMouseDown={handleMouseDownHeader}
            >
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--input-placeholder-color)]">
                    {token.type === 'crc' ? 'CRC Config' :
                        token.type === 'timestamp' ? 'Time Token' :
                            token.type === 'auto_inc' ? 'Auto Token' :
                                'Custom Flag'}
                </span>
                <X size={14} className="cursor-pointer hover:text-[var(--app-foreground)] text-[var(--activitybar-inactive-foreground)] transition-colors" onClick={onClose} />
            </div>

            <div className="flex-1 overflow-auto p-4 flex flex-col custom-scrollbar">
                {renderContent()}

                <div className="mt-8 pt-4 flex items-center justify-between border-t border-[#333]">
                    <button
                        className="px-2 py-1 text-[11px] text-[#f48771] hover:bg-[#4b1818] rounded-[4px] transition-colors"
                        onClick={() => { onDelete(token.id); onClose(); }}
                    >
                        Delete
                    </button>
                    <button
                        className="px-4 py-1.5 bg-[#0e639c] text-white text-[12px] font-medium rounded-[4px] hover:bg-[#1177bb] transition-colors flex items-center gap-1.5 shadow-sm"
                        onClick={handleSave}
                    >
                        <Check size={14} /> Apply
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
