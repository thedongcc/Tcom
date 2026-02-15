import { createContext, useContext } from 'react';
import { useSessionManager } from '../hooks/useSessionManager';

// Define the context type based on the return type of the hook
type SessionManagerType = ReturnType<typeof useSessionManager>;

const SessionContext = createContext<SessionManagerType | null>(null);

export const SessionProvider = ({ manager, children }: { manager: SessionManagerType, children: React.ReactNode }) => {
    return (
        <SessionContext.Provider value={manager}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};
