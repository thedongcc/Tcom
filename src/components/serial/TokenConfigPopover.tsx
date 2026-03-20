import { useEffect, useRef, useState } from 'react';
import { Token } from '../../types/token';
import { X, Check } from 'lucide-react';
import { tokenRegistry } from '../../tokens';
import { useI18n } from '../../context/I18nContext';

interface TokenConfigPopoverProps {
    token: Token;
    onUpdate: (id: string, newConfig: any) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

export const TokenConfigPopover = ({ token, onUpdate, onDelete, onClose, position }: TokenConfigPopoverProps) => {
    const { t } = useI18n();
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

    // 弹窗宽度：首次渲染后锁定，不再因内容变化而变宽
    const [lockedWidth, setLockedWidth] = useState<number | null>(null);
    const [userWidth, setUserWidth] = useState<number | null>(null);
    const [userHeight, setUserHeight] = useState<number | null>(null);
    const [pos, setPos] = useState({ x: position.x, y: position.y });

    useEffect(() => {
        requestAnimationFrame(() => {
            const el = popoverRef.current;
            if (!el) return;
            const actualH = el.offsetHeight;
            const actualW = el.offsetWidth;
            // 锁定首次渲染宽度
            setLockedWidth(actualW);
            const screenH = window.innerHeight;
            const screenW = window.innerWidth;

            let newY = position.y - actualH - 4;
            if (newY < 10) newY = position.y + 24;
            let newX = Math.min(position.x, screenW - actualW - 10);
            if (newX < 10) newX = 10;
            setPos({ x: newX, y: newY });
        });
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
        const el = popoverRef.current;
        resizeStart.current = { x: e.clientX, y: e.clientY, w: el?.offsetWidth || 250, h: el?.offsetHeight || 200 };
        document.addEventListener('mousemove', handleMouseMoveResize);
        document.addEventListener('mouseup', handleMouseUpResize);
    };
    const handleMouseMoveResize = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        setUserWidth(Math.max(200, resizeStart.current.w + dx));
        setUserHeight(Math.max(150, resizeStart.current.h + dy));
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
            className="fixed z-50 rounded-lg flex flex-col select-none shadow-lg overflow-hidden"
            style={{
                left: pos.x, top: pos.y,
                ...(userWidth ? { width: userWidth } : lockedWidth ? { width: lockedWidth } : { width: 'auto', minWidth: 200, maxWidth: 320 }),
                ...(userHeight ? { height: userHeight } : { maxHeight: 500 }),
                backgroundColor: 'var(--menu-background)',
                border: '1px solid var(--theme-editor-card-border, var(--widget-border-color))',
                color: 'var(--app-foreground, var(--st-dialog-text))',
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

            {/* 标题栏 — 参考主题编辑器 header */}
            <div
                className="flex items-center justify-between px-3 py-2 cursor-move select-none"
                style={{ borderBottom: '1px solid var(--theme-editor-card-border, var(--border-color))' }}
                onMouseDown={handleMouseDownHeader}
            >
                <span className="text-[12px] font-semibold tracking-tight opacity-90">
                    {t(`serial.token${plugin.type.charAt(0).toUpperCase() + plugin.type.slice(1).replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())}`) || plugin.label}
                </span>
                <button
                    onClick={onClose}
                    className="p-0.5 rounded transition-all cursor-pointer"
                    style={{ opacity: 0.5 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = 'var(--theme-editor-btn-hover, rgba(255,255,255,0.06))'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* 表单内容 */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2.5 flex flex-col custom-scrollbar">
                {renderContent()}
            </div>

            {/* 底部操作栏 — 参考主题编辑器 footer */}
            <div
                className="px-3 py-2 flex justify-end gap-2 shrink-0"
                style={{
                    borderTop: '1px solid var(--theme-editor-card-border, var(--border-color))',
                    backgroundColor: 'var(--widget-background)',
                }}
            >
                <button
                    className="px-3 py-1.5 text-[11px] rounded-md transition-all flex items-center gap-1 font-medium cursor-pointer"
                    style={{ border: '1px solid var(--theme-editor-input-border, var(--input-border-color))', color: 'var(--st-error-text)' }}
                    onClick={() => { onDelete(token.id); onClose(); }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--theme-editor-btn-hover, rgba(255,255,255,0.06))'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    {t('common.delete')}
                </button>
                <button
                    className="px-4 py-1.5 text-[11px] rounded-md text-white transition-all flex items-center gap-1 font-semibold shadow-sm cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-color, var(--button-background))' }}
                    onClick={handleSave}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                    <Check size={12} /> {t('common.confirm')}
                </button>
            </div>

            {/* 缩放手柄 */}
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 flex items-center justify-center opacity-30 hover:opacity-70 transition-opacity"
                onMouseDown={handleMouseDownResize}
            >
                <div className="w-2 h-2 border-r-2 border-b-2" style={{ borderColor: 'var(--app-foreground, var(--st-token-arrow))' }} />
            </div>
        </div>
    );
};
