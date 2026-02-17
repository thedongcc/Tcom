import React, { createContext, useContext, useState, useCallback } from 'react';
import { ConfirmDialog, ConfirmType } from '../components/common/ConfirmDialog';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: ConfirmType;
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [confirmState, setConfirmState] = useState<{
        options: ConfirmOptions;
        resolve: (value: boolean) => void;
    } | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setConfirmState({ options, resolve });
        });
    }, []);

    const handleResolve = useCallback((value: boolean) => {
        if (confirmState) {
            confirmState.resolve(value);
            setConfirmState(null);
        }
    }, [confirmState]);

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {confirmState && (
                <ConfirmDialog
                    {...confirmState.options}
                    onResolve={handleResolve}
                />
            )}
        </ConfirmContext.Provider>
    );
};

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context;
};
