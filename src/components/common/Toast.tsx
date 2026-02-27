import React, { useEffect, useRef } from 'react';
import { Check, X, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    message: string;
    type?: ToastType;
    duration?: number;
    onClose: () => void;
    onExpire?: () => void;
    closing?: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', duration = 1000, onClose, onExpire, closing = false }) => {
    const [isClosing, setIsClosing] = React.useState(false);

    const handleClose = React.useCallback(() => {
        setIsClosing(true);
        // Fallback: Ensure it closes even if animation doesn't trigger
        setTimeout(() => {
            onClose();
        }, 350);
    }, [onClose]);

    useEffect(() => {
        if (closing) {
            handleClose();
        }
    }, [closing, handleClose]);

    const handleAnimationEnd = () => {
        if (isClosing) {
            onClose();
        }
    };

    // Use refs to access latest callbacks without resetting timer
    const onExpireRef = useRef(onExpire);
    const handleCloseRef = useRef(handleClose);

    useEffect(() => {
        onExpireRef.current = onExpire;
        handleCloseRef.current = handleClose;
    }, [onExpire, handleClose]);

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                if (onExpireRef.current) {
                    onExpireRef.current();
                } else {
                    handleCloseRef.current();
                }
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration]); // Only depend on duration, preventing resets on re-renders

    const getStyles = () => {
        switch (type) {
            case 'success': return {
                borderColor: '#22c55e', // green-500
                shadow: '0 0 15px rgba(34, 197, 94, 0.2)',
                icon: <Check size={18} className="text-green-500" />
            };
            case 'error': return {
                borderColor: '#ef4444', // red-500
                shadow: '0 0 15px rgba(239, 68, 68, 0.2)',
                icon: <X size={18} className="text-red-500" />
            };
            case 'warning': return {
                borderColor: '#eab308', // yellow-500
                shadow: '0 0 15px rgba(234, 179, 8, 0.2)',
                icon: <AlertTriangle size={18} className="text-yellow-500" />
            };
            case 'info': return {
                borderColor: '#3b82f6', // blue-500
                shadow: '0 0 15px rgba(59, 130, 246, 0.2)',
                icon: <Info size={18} className="text-blue-500" />
            };
        }
    };

    const styles = getStyles();

    return (
        <div
            className={`
                relative flex items-center gap-3 px-4 py-3 
                bg-[var(--widget-background)] border-2
                rounded-md min-w-[300px] max-w-[400px]
                cursor-pointer shadow-lg
                transition-all duration-300 ease-in-out
                hover:opacity-90 
            `}
            style={{
                borderColor: styles.borderColor,
                boxShadow: styles.shadow,
                opacity: isClosing ? 0 : 1,
                transform: isClosing ? 'translateY(-20px)' : 'translateY(0)',
            }}
            onClick={handleClose}
            onTransitionEnd={handleAnimationEnd}
        >
            <div className="shrink-0">
                {styles.icon}
            </div>
            <span className="text-sm font-medium text-[var(--app-foreground)] flex-1 break-words leading-tight">
                {message}
            </span>
            <X size={14} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--app-foreground)] shrink-0" />
        </div>
    );
};
