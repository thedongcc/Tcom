export interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    pnpId?: string;
    locationId?: string;
    friendlyName?: string;
    vendorId?: string;
    productId?: string;
    busy?: boolean;
    status?: 'available' | 'busy' | 'error';
    error?: string;
}

export interface SerialOpenOptions {
    path: string;
    baudRate: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 1.5 | 2;
    parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
}

export interface SerialAPI {
    listPorts: () => Promise<{ success: boolean; ports: SerialPortInfo[]; error?: string }>;
    open: (connectionId: string, options: SerialOpenOptions) => Promise<{ success: boolean; error?: string }>;
    close: (connectionId: string) => Promise<{ success: boolean; error?: string }>;
    write: (connectionId: string, data: string | number[] | Uint8Array) => Promise<{ success: boolean; error?: string }>;
    onData: (connectionId: string, callback: (data: Uint8Array) => void) => () => void;
    onClosed: (connectionId: string, callback: () => void) => () => void;
    onError: (connectionId: string, callback: (err: string) => void) => () => void;
}

export interface MqttAPI {
    connect: (connectionId: string, config: any) => Promise<{ success: boolean; error?: string }>;
    disconnect: (connectionId: string) => Promise<{ success: boolean; error?: string }>;
    publish: (connectionId: string, topic: string, payload: any, options: any) => Promise<{ success: boolean; error?: string }>;
    subscribe: (connectionId: string, topic: string) => Promise<{ success: boolean; error?: string }>;
    unsubscribe: (connectionId: string, topic: string) => Promise<{ success: boolean; error?: string }>;
    onMessage: (connectionId: string, callback: (topic: string, payload: Uint8Array) => void) => () => void;
    onStatus: (connectionId: string, callback: (status: string) => void) => () => void;
    onError: (connectionId: string, callback: (err: string) => void) => () => void;
}

declare global {
    interface Window {
        ipcRenderer: import('electron').IpcRenderer
        serialAPI: SerialAPI
        mqttAPI: MqttAPI
        sessionAPI: {
            save: (sessions: any[]) => Promise<{ success: boolean; error?: string }>;
            load: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        }
        com0comAPI: {
            exec: (command: string) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>;
            installDriver: () => Promise<{ success: boolean; path?: string; error?: string }>;
            setFriendlyName: (port: string, name: string) => Promise<{ success: boolean; error?: string }>;
            isAdmin: () => Promise<boolean>;
            checkPath: (path: string) => Promise<{ success: boolean; version?: string | null }>;
            launchInstaller: () => Promise<{ success: boolean; error?: string }>;
        }
        monitorAPI: {
            start: (sessionId: string, config: any) => Promise<{ success: boolean; error?: string }>;
            stop: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
            write: (sessionId: string, target: 'virtual' | 'physical', data: any) => Promise<{ success: boolean; error?: string }>;
            onData: (sessionId: string, callback: (type: 'RX' | 'TX', data: Uint8Array) => void) => () => void;
            onError: (sessionId: string, callback: (err: string) => void) => () => void;
            onClosed: (sessionId: string, callback: (origin: string) => void) => () => void;
        }
        tcpAPI: {
            start: (port: number) => Promise<{ success: boolean; error?: string }>;
            stop: (port: number) => Promise<boolean>;
            write: (port: number, data: any) => Promise<boolean>;
            onData: (callback: (port: number, data: Uint8Array) => void) => () => void;
        }
        updateAPI: {
            getVersion: () => Promise<string>;
            getStats: () => Promise<{ cpu: number; memUsed: number }>;
            check: () => Promise<any>;
            download: () => Promise<any>;
            install: () => void;
            onStatus: (callback: (data: any) => void) => () => void;
            onProgress: (callback: (progress: any) => void) => () => void;
        }
        shellAPI: {
            openExternal: (url: string) => Promise<void>;
            showOpenDialog: (options: any) => Promise<any>;
        }
        workspaceAPI: {
            getLastWorkspace: () => Promise<{ success: boolean; path: string | null }>;
            setLastWorkspace: (wsPath: string | null) => Promise<{ success: boolean }>;
            openFolder: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
            listSessions: (wsPath: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
            saveSession: (wsPath: string, config: any) => Promise<{ success: boolean; filePath?: string; error?: string }>;
            deleteSession: (wsPath: string, config: any) => Promise<{ success: boolean; error?: string }>;
            renameSession: (wsPath: string, oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
            getRecentWorkspaces: () => Promise<{ success: boolean; workspaces: string[] }>;
            migrateOldSessions: () => Promise<{ success: boolean; migrated: number; path?: string }>;
        }
        windowAPI: {
            setAlwaysOnTop: (flag: boolean) => Promise<{ success: boolean; alwaysOnTop: boolean }>;
            isAlwaysOnTop: () => Promise<{ success: boolean; alwaysOnTop: boolean }>;
        }
    }
}

