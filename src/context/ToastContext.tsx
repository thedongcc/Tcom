import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Toast, ToastType } from '../components/common/Toast';

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
}

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
    closing?: boolean;
    expired?: boolean;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const markAsExpired = useCallback((id: string) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, expired: true } : t));
    }, []);

    // Queue Manager: Handle serial exit of expired toasts
    useEffect(() => {
        setToasts(currentToasts => {
            // Find the oldest toast (index 0)
            if (currentToasts.length === 0) return currentToasts;

            const oldest = currentToasts[0];

            // If oldest is expired AND not already closing, trigger closing animation
            if (oldest.expired && !oldest.closing) {
                return currentToasts.map((t, index) =>
                    index === 0 ? { ...t, closing: true } : t
                );
            }

            return currentToasts;
        });
    }, [toasts]); // Re-run whenever toasts change (e.g. expired flag updates)
    // Note: The dependency on 'toasts' might cause loop if we are not careful.
    // setToasts updater function receives current state, but effect runs on dependency change.
    // If we update closing:true, effect runs again. oldest.closing is true -> no change. Loop breaks.
    // Optimal: precise dependency or use a separate effect for queue processing?
    // Actually, simply depending on `toasts` is fine as long as the condition `!oldest.closing` prevents cycle.

    const showToast = useCallback((message: string, type: ToastType = 'success', duration: number = 1000) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { id, message, type, duration, closing: false, expired: false };

        setToasts(prev => {
            // Limit to 3 active toasts (not counting closing ones?)
            // Actually, we should count all visible ones.
            // If we have > 3, we force expire the oldest active one.
            const activeToasts = prev.filter(t => !t.closing && !t.expired);
            // If we have too many, we expire the oldest immediately.

            let nextToasts = [...prev];

            if (activeToasts.length >= 3) {
                // Determine which one to expire. The oldest non-expired one.
                const oldestActive = activeToasts[0];
                if (oldestActive) {
                    nextToasts = nextToasts.map(t =>
                        t.id === oldestActive.id ? { ...t, expired: true } : t
                    );
                }
            }

            // Append new toast
            const updatedToasts = [...nextToasts, newToast];

            // Hard limit: Keep only the last 3 toasts
            // This ensures that if many messages are generated, we simply drop the old ones 
            // instead of queuing them up for removal animations.
            if (updatedToasts.length > 3) {
                return updatedToasts.slice(-3);
            }

            return updatedToasts;
        });
    }, []);

    // Global keyboard and clipboard event listeners
    useEffect(() => {
        const handleCopy = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) {
                showToast('已复制到剪贴板', 'success', 800);
            }
        };

        const handlePaste = (e: ClipboardEvent) => {
            // Check if paste actually happened (not just Ctrl+V on non-editable area)
            const target = e.target as HTMLElement;
            const isEditable = target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName);

            if (isEditable) {
                showToast('已粘贴', 'success', 800);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrMeta = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            // Paste Empty Check: Ctrl+V
            if (isCtrlOrMeta && key === 'v') {
                // We use a slight timeout to check if handlePaste was triggered
                // or check clipboard directly if possible (though limited in browsers)
                navigator.clipboard.readText().then(text => {
                    if (!text) {
                        showToast('无可粘贴的内容', 'warning', 800);
                    }
                }).catch(() => {
                    // Privacy settings might block readText
                });
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
    }, [showToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-26 left-1/2 -translate-x-1/2 z-[9999] w-[400px] pointer-events-none flex justify-center perspective-[2000px]">
                {toasts.map((toast, index) => {
                    // Calculate position relative to end of list (0 = newest, 1 = second newest...)
                    const reverseIndex = toasts.length - 1 - index;

                    // Balanced offset (55px)
                    const offset = reverseIndex * 50;
                    const scale = 1 - (reverseIndex * 0.03);
                    // Stronger fading to enhance contrast
                    const opacity = 1 - (reverseIndex * 0.1);
                    const brightness = 1 - (reverseIndex * 0.2);

                    return (
                        <div
                            key={toast.id}
                            className="absolute transition-all duration-500 cubic-bezier(0.25, 1, 0.5, 1) pointer-events-auto origin-top"
                            style={{
                                transform: `translateY(-${offset}px) scale(${scale})`,
                                zIndex: 100 - reverseIndex,
                                opacity: opacity,
                                filter: `brightness(${brightness})`
                            }}
                        >
                            <Toast
                                message={toast.message}
                                type={toast.type}
                                duration={toast.duration}
                                onClose={() => removeToast(toast.id)} // Called after animation ends or valid click
                                onExpire={() => markAsExpired(toast.id)} // Called when timer ends
                                closing={toast.closing}
                            />
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
