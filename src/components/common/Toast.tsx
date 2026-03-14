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
                borderColor: 'var(--st-status-success)',
                shadow: '0 0 15px var(--st-status-success-bg)',
                icon: <Check size={18} className="text-[var(--st-status-success)]" />
            };
            case 'error': return {
                borderColor: 'var(--st-status-error)',
                shadow: '0 0 15px var(--st-status-error-bg)',
                icon: <X size={18} className="text-[var(--st-status-error)]" />
            };
            case 'warning': return {
                borderColor: 'var(--st-status-warning)',
                shadow: '0 0 15px var(--st-status-warning-bg)',
                icon: <AlertTriangle size={18} className="text-[var(--st-status-warning)]" />
            };
            case 'info': return {
                borderColor: 'var(--st-status-info)',
                shadow: '0 0 15px var(--st-status-info-bg)',
                icon: <Info size={18} className="text-[var(--st-status-info)]" />
            };
        }
    };

    const styles = getStyles();

    return (
        <div
            className={`
                relative flex items-center gap-3 px-4 py-3 
                bg-[var(--st-toast-bg)] border-2
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
            <span className="text-sm font-medium text-[var(--st-toast-text)] flex-1 break-words leading-tight">
                {message}
            </span>
            <X size={14} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-toast-icon-hover)] shrink-0" />
        </div>
    );
};
