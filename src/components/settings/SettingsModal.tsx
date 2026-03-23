/**
 * SettingsModal.tsx
 * 全局设置模态浮层 — 基于 Portal 的 Obsidian 风格 Overlay。
 * 使用 createPortal 挂载到 document.body，逃离父组件 overflow 限制。
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { SettingsEditor } from './SettingsEditor';
import { useI18n } from '../../context/I18nContext';

export const SettingsModal = () => {
    const { isSettingsOpen, closeSettings } = useSettings();
    const { t } = useI18n();

    // ESC 键退出设置
    useEffect(() => {
        if (!isSettingsOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeSettings();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isSettingsOpen, closeSettings]);

    if (!isSettingsOpen) return null;

    const modalContent = (
        // 全屏遮罩层
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center animate-modalIn settings-backdrop"
            onClick={closeSettings}
        >
            {/* 设置面板主体 */}
            <div
                className="relative w-[85vw] max-w-[1000px] h-[80vh] min-h-[500px] flex flex-col rounded-xl overflow-hidden border border-[var(--widget-border-color)] settings-modal-panel"
                style={{
                    backgroundColor: 'var(--titlebar-background)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 顶部标题栏 */}
                <div
                    className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-[var(--border-color)]"
                    style={{ backgroundColor: 'var(--titlebar-background)' }}
                >
                    <span className="font-semibold text-[13px] text-[var(--app-foreground)]">
                        {t('editor.settingsTabName')}
                    </span>
                    <button
                        onClick={closeSettings}
                        className="p-1.5 rounded-md text-[var(--input-placeholder-color)] hover:bg-[var(--list-hover-background)] hover:text-[var(--app-foreground)] transition-colors cursor-pointer"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* 设置编辑器主体 */}
                <div className="flex-1 overflow-hidden flex" style={{ backgroundColor: 'var(--titlebar-background)' }}>
                    <SettingsEditor />
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
