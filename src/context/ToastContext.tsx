/**
 * ToastContext.tsx
 * Toast 渲染容器 — 无 Provider 包裹，订阅 toastManager 状态后自渲染。
 * 同时挂载全局剪贴板事件监听器。
 *
 * 用法：在 FullApp.tsx 中 <ToastContainer /> 平铺即可。
 * 业务代码直接 import { toast } from '@/services/toastManager'。
 */
import { useSyncExternalStore, useEffect } from 'react';
import { Toast } from '../components/common/Toast';
import { toastStore, toast } from '../services/toastManager';
import { useI18n } from './I18nContext';

/** Toast 渲染容器（无需 Provider，平铺使用） */
export const ToastContainer = () => {
    const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
    const { t } = useI18n();

    // 全局剪贴板事件监听
    useEffect(() => {
        const handleCopy = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) {
                toast.success(t('toast.copied'), 800);
            }
        };

        const handlePaste = (e: ClipboardEvent) => {
            const target = e.target as HTMLElement;
            const isEditable = target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName);
            if (isEditable) {
                toast.success(t('toast.pasted'), 800);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrMeta = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();
            if (isCtrlOrMeta && key === 'v') {
                navigator.clipboard.readText().then(text => {
                    if (!text) {
                        toast.warning(t('toast.nothingToPaste'), 800);
                    }
                }).catch(() => {});
            }
        };

        document.addEventListener('copy', handleCopy);
        document.addEventListener('paste', handlePaste);
        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.removeEventListener('copy', handleCopy);
            document.removeEventListener('paste', handlePaste);
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [t]);

    return (
        <div className="fixed top-26 left-1/2 -translate-x-1/2 z-[9999] w-[400px] pointer-events-none flex justify-center perspective-[2000px]">
            {toasts.map((item, index) => {
                const reverseIndex = toasts.length - 1 - index;
                const offset = reverseIndex * 50;
                const scale = 1 - (reverseIndex * 0.03);
                const opacity = 1 - (reverseIndex * 0.1);
                const brightness = 1 - (reverseIndex * 0.2);

                return (
                    <div
                        key={item.id}
                        className="absolute transition-all duration-500 cubic-bezier(0.25, 1, 0.5, 1) pointer-events-auto origin-top"
                        style={{
                            transform: `translateY(-${offset}px) scale(${scale})`,
                            zIndex: 100 - reverseIndex,
                            opacity,
                            filter: `brightness(${brightness})`
                        }}
                    >
                        <Toast
                            message={item.message}
                            type={item.type}
                            duration={item.duration}
                            onClose={() => toastStore.remove(item.id)}
                            onExpire={() => toastStore.markAsExpired(item.id)}
                            closing={item.closing}
                        />
                    </div>
                );
            })}
        </div>
    );
};

/**
 * @deprecated 保留旧 API 签名的兼容函数，
 * 直接返回 { showToast } 以兼容少数未迁移的调用点。
 * 新代码请直接使用 import { toast } from '@/services/toastManager'。
 */
export const useToast = () => ({
    showToast: toast.show,
});
