import { useEffect, useRef, useState } from 'react';
import { Token } from '../../types/token';
import { X, Check } from 'lucide-react';
import { tokenRegistry } from '../../tokens';

interface TokenConfigPopoverProps {
    token: Token;
    onUpdate: (id: string, newConfig: any) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

export const TokenConfigPopover = ({ token, onUpdate, onDelete, onClose, position }: TokenConfigPopoverProps) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [config, setConfig] = useState<any>(token.config);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // ─── 保存：通过 registry 规范化 config ────────────────────────────
    const handleSave = () => {
        const plugin = tokenRegistry.get(token.type);
        const finalConfig = plugin?.normalizeConfig
            ? plugin.normalizeConfig({ ...config })
            : { ...config };
        onUpdate(token.id, finalConfig);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
    };

    // ─── 内容：通过 registry 获取 ConfigForm ─────────────────────────
    const renderContent = () => {
        const plugin = tokenRegistry.get(token.type);
        if (!plugin) return null;
        const { ConfigForm } = plugin;
        return <ConfigForm config={config} setConfig={setConfig} onKeyDown={handleKeyDown} />;
    };

    const [size, setSize] = useState({ width: 300, height: 320 });
    const [pos, setPos] = useState({ x: position.x, y: position.y });

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
    }, []);

    // ─── 拖拽逻辑 ─────────────────────────────────────────────────────
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleMouseDownHeader = (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        document.addEventListener('mousemove', handleMouseMoveDrag);
        document.addEventListener('mouseup', handleMouseUpDrag);
    };
    const handleMouseMoveDrag = (e: MouseEvent) => {
        if (!isDragging.current) return;
        setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const handleMouseUpDrag = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMoveDrag);
        document.removeEventListener('mouseup', handleMouseUpDrag);
    };

    // ─── 缩放逻辑 ─────────────────────────────────────────────────────
    const isResizing = useRef(false);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    const handleMouseDownResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        resizeStart.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };
        document.addEventListener('mousemove', handleMouseMoveResize);
        document.addEventListener('mouseup', handleMouseUpResize);
    };
    const handleMouseMoveResize = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        setSize({ width: Math.max(200, resizeStart.current.w + dx), height: Math.max(150, resizeStart.current.h + dy) });
    };
    const handleMouseUpResize = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMoveResize);
        document.removeEventListener('mouseup', handleMouseUpResize);
    };

    // ─── 白名单：仅 registry 中存在的类型才渲染弹窗 ──────────────────
    if (!tokenRegistry.has(token.type)) return null;

    const plugin = tokenRegistry.get(token.type)!;

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 bg-[var(--menu-background)] border border-[var(--widget-border-color)] shadow-xl rounded-md flex flex-col text-[var(--st-dialog-text)] select-none"
            style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
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
                {/* 标题通过 registry 获取 */}
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--input-placeholder-color)]">
                    {plugin.label}
                </span>
                <X size={14} className="cursor-pointer hover:text-[var(--st-dialog-text)] text-[var(--activitybar-inactive-foreground)] transition-colors" onClick={onClose} />
            </div>

            <div className="flex-1 overflow-auto p-4 flex flex-col custom-scrollbar">
                {renderContent()}

                <div className="mt-8 pt-4 flex items-center justify-between border-t border-[var(--st-token-divider)]">
                    <button
                        className="px-2 py-1 text-[11px] text-[var(--st-error-text)] hover:bg-[var(--st-error-text)]/20 rounded-[4px] transition-colors"
                        onClick={() => { onDelete(token.id); onClose(); }}
                    >
                        Delete
                    </button>
                    <button
                        className="px-4 py-1.5 bg-[var(--button-background)] text-[var(--button-foreground)] text-[12px] font-medium rounded-[4px] hover:bg-[var(--button-hover-background)] transition-colors flex items-center gap-1.5 shadow-sm"
                        onClick={handleSave}
                    >
                        <Check size={14} /> Apply
                    </button>
                </div>
            </div>

            {/* 缩放手柄 */}
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 flex items-center justify-center opacity-50 hover:opacity-100"
                onMouseDown={handleMouseDownResize}
            >
                <div className="w-2 h-2 border-r-2 border-b-2 border-[var(--st-token-arrow)]" />
            </div>
        </div>
    );
};
