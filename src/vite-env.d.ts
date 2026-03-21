// WebkitAppRegion CSS 属性扩展（Tauri 自定义标题栏拖拽区域）
import 'react';
declare module 'react' {
    interface CSSProperties {
        WebkitAppRegion?: 'drag' | 'no-drag';
    }
}

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
    listPorts: (options?: { includeCom0ComNames?: boolean }) => Promise<{ success: boolean; ports: SerialPortInfo[]; error?: string }>;
    open: (connectionId: string, options: SerialOpenOptions) => Promise<{ success: boolean; error?: string }>;
    close: (connectionId: string) => Promise<{ success: boolean; error?: string }>;
    write: (connectionId: string, data: string | number[] | Uint8Array) => Promise<{ success: boolean; error?: string }>;
    onData: (connectionId: string, callback: (data: Uint8Array, timestamp?: number) => void) => () => void;
    onClosed: (connectionId: string, callback: () => void) => () => void;
    onError: (connectionId: string, callback: (err: string) => void) => () => void;
    // ⚡ 高精度主进程定时发送
    timedSendStart?: (connectionId: string, data: number[], intervalMs: number) => Promise<{ success: boolean; error?: string }>;
    timedSendStop?: (connectionId: string) => Promise<{ success: boolean }>;
    onTimedSendTickBatch?: (connectionId: string, callback: (events: { data: number[], timestamp: number }[]) => void) => () => void;
    // ⚡ 高精度动态定时发送（Worker 用模运算循环帧，无需 feed/replace/refill）
    timedSendStartDynamic?: (connectionId: string, frames: number[][], intervalMs: number, timestampSlots: Array<{ byteOffset: number; byteSize: number; byteOrder: string; format: string }>) => Promise<{ success: boolean; error?: string }>;
}

export interface MqttAPI {
    connect: (connectionId: string, config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
    disconnect: (connectionId: string) => Promise<{ success: boolean; error?: string }>;
    publish: (connectionId: string, topic: string, payload: string | Uint8Array | Record<string, unknown>, options: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
    subscribe: (connectionId: string, topic: string) => Promise<{ success: boolean; error?: string }>;
    unsubscribe: (connectionId: string, topic: string) => Promise<{ success: boolean; error?: string }>;
    onMessage: (connectionId: string, callback: (topic: string, payload: Uint8Array) => void) => () => void;
    onStatus: (connectionId: string, callback: (status: string) => void) => () => void;
    onError: (connectionId: string, callback: (err: string) => void) => () => void;
}

declare global {
    interface Window {
        serialAPI: SerialAPI
        mqttAPI: MqttAPI
        sessionAPI: {
            save: (sessions: Record<string, unknown>[]) => Promise<{ success: boolean; error?: string }>;
            load: () => Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }>;
        }
        com0comAPI: {
            exec: (command: string, silent?: boolean) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>;
            installDriver: () => Promise<{ success: boolean; path?: string; error?: string }>;
            setFriendlyName: (port: string, name: string) => Promise<{ success: boolean; error?: string }>;
            isAdmin: () => Promise<boolean>;
            checkPath: (path: string) => Promise<{ success: boolean; version?: string | null }>;
            launchInstaller: () => Promise<{ success: boolean; error?: string }>;
            listPairs: () => Promise<{ success: boolean; pairs: Array<{ portA: string; portB: string; id: string }> }>;
        }
        monitorAPI: {
            start: (sessionId: string, config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
            stop: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
            write: (sessionId: string, target: 'virtual' | 'physical', data: string | number[]) => Promise<{ success: boolean; error?: string }>;
            onData: (sessionId: string, callback: (type: 'RX' | 'TX', data: Uint8Array, timestamp?: number) => void) => () => void;
            onError: (sessionId: string, callback: (err: string) => void) => () => void;
            onClosed: (sessionId: string, callback: (args: { origin: string, path: string }) => void) => () => void;
            onPartnerStatus: (sessionId: string, callback: (connected: boolean) => void) => () => void;
            // 高精度监视器专用发送
            startTimedSend: (sessionId: string, target: 'virtual' | 'physical', data: number[], intervalMs: number) => Promise<{ success: boolean; error?: string }>;
            stopTimedSend: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
            onTimedSendTickBatch?: (sessionId: string, callback: (events: { data: number[], timestamp: number }[]) => void) => () => void;
        }
        tcpAPI: {
            start: (port: number) => Promise<{ success: boolean; error?: string }>;
            stop: (port: number) => Promise<boolean>;
            write: (port: number, data: string | number[]) => Promise<boolean>;
            onData: (callback: (port: number, data: Uint8Array) => void) => () => void;
        }
        updateAPI: {
            getVersion: () => Promise<string>;
            getStats: () => Promise<{ cpu: number; memUsed: number }>;
            check: () => Promise<unknown>;
            download: () => Promise<unknown>;
            install: () => void;
            onStatus: (callback: (data: { status: string; version?: string; error?: string }) => void) => () => void;
            onProgress: (callback: (progress: { percent: number; bytesPerSecond?: number; total?: number; transferred?: number }) => void) => () => void;
            listFonts?: () => Promise<{ success: boolean; fonts?: string[] }>;
        }
        shellAPI: {
            openExternal: (url: string) => Promise<void>;
            showOpenDialog: (options: { title?: string; defaultPath?: string; buttonLabel?: string; filters?: Array<{ name: string; extensions: string[] }>; properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'> }) => Promise<{ canceled: boolean; filePaths: string[] }>;
        }
        windowAPI: {
            setAlwaysOnTop: (flag: boolean) => Promise<{ success: boolean; alwaysOnTop: boolean }>;
            isAlwaysOnTop: () => Promise<{ success: boolean; alwaysOnTop: boolean }>;
            minimize: () => Promise<void>;
            maximize: () => Promise<void>;
            unmaximize: () => Promise<void>;
            isMaximized: () => Promise<boolean>;
            close: () => Promise<void>;
            toggleMaximize: () => Promise<boolean>;
        }
        appAPI: {
            factoryReset: () => Promise<{ success: true } | { success: false; error: string }>;
        }
        themeAPI: {
            onStatusChanged: (callback: (isOpen: boolean) => void) => () => void;
            openThemeEditor: () => Promise<void>;
            closeThemeEditor: () => Promise<void>;
            isWindowOpen: () => Promise<boolean>;
            save?: (id: string, themeDef: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
            applyPreview?: (edits: Record<string, string>) => void;
            getPendingEdits?: (themeId: string) => Promise<Record<string, string> | null>;
            getAllPendingEdits?: () => Promise<Record<string, Record<string, string>>>;
            clearAllPendingEdits?: () => void;
            setPendingEdits?: (themeId: string, edits: Record<string, string> | null) => void;
            startInspectorMode?: () => void;
            stopInspectorMode?: () => void;
            stopInspector?: () => void;
            onComponentPicked?: (callback: (data: { compKey: string | null, className: string, outerHTML: string }) => void) => () => void;
            onInspectorStarted?: (callback: () => void) => () => void;
            onInspectorStopped?: (callback: () => void) => () => void;
            getExpandedGroups?: () => Promise<Record<string, boolean>>;
            setExpandedGroups?: (groups: Record<string, boolean>) => void;
            initData?: () => Promise<{ pendingEdits: Record<string, Record<string, string>>; expandedGroups: Record<string, boolean> }>;
            onApplyPreview?: (callback: (edits: Record<string, string>) => void) => () => void;
            onEditorClosed?: (callback: () => void) => () => void;
            onReload?: (callback: () => void) => () => void;
            updateTitleBar?: (config: { bgColor: string; symbolColor: string }) => void;
            openFolder?: () => void;
            openFile?: (themeId: string) => void;
            loadAll?: () => Promise<{ success: boolean; themes: Array<{ id: string; name: string; type: 'light' | 'dark'; colors: Record<string, string> }> }>;
            componentPicked?: (data: { className: string; outerHTML: string; tagName: string }) => void;
        }
        EyeDropper?: unknown;
        eyedropperAPI?: {
            pick: () => Promise<{ success: boolean; color?: string; error?: string }>;
            watchStart: () => Promise<{ success: boolean }>;
            watchStop: () => Promise<{ success: boolean }>;
            onColor: (cb: (color: string) => void) => () => void;
            onPicked: (cb: (color: string) => void) => () => void;
            onCanceled: (cb: () => void) => () => void;
        }
        queryLocalFonts?: () => Promise<Array<{ fullName: string; family: string }>>
        crashReportAPI: {
            send: (payload: string) => Promise<void>;
            check: () => Promise<string | null>;
            clear: () => Promise<void>;
        }
        profileAPI: {
            // Profile CRUD
            list: () => Promise<{ success: boolean; profiles: Array<{ name: string; createdAt?: string }> }>;
            create: (name: string) => Promise<{ success: boolean; profile?: { name: string; createdAt: string } }>;
            delete: (name: string) => Promise<{ success: boolean }>;
            rename: (oldName: string, newName: string) => Promise<{ success: boolean }>;
            duplicate: (oldName: string, newName: string) => Promise<{ success: boolean }>;
            // Session 管理
            listSessions: (profileName: string) => Promise<{ success: boolean; data?: Record<string, unknown>[] }>;
            saveSession: (profileName: string, config: Record<string, unknown>) => Promise<{ success: boolean; filePath?: string }>;
            deleteSession: (profileName: string, config: Record<string, unknown>) => Promise<{ success: boolean }>;
            renameSession: (profileName: string, oldName: string, newName: string) => Promise<{ success: boolean }>;
            // 命令菜单
            getCommands: (profileName: string) => Promise<{ success: boolean; data: unknown[] }>;
            saveCommands: (profileName: string, data: unknown) => Promise<{ success: boolean }>;
            // 自动回复
            getAutoReply: (profileName: string) => Promise<{ success: boolean; data: { enabled: boolean; rules: unknown[]; targetSessionIds: string[] } }>;
            saveAutoReply: (profileName: string, data: unknown) => Promise<{ success: boolean }>;
        }
        globalSettingsAPI: {
            // 全局设置
            load: () => Promise<{ success: boolean; data: Record<string, unknown> | null }>;
            save: (data: Record<string, unknown>) => Promise<{ success: boolean }>;
            // 运行时状态
            loadState: () => Promise<{ success: boolean; data: { lastProfile: string; recentProfiles: string[]; migrated: boolean; windowState: unknown; setupcPath?: string; monitorEnabled?: boolean; migratedAt?: number } }>;
            saveState: (data: Record<string, unknown>) => Promise<{ success: boolean }>;
            // 备份
            exportProfile: (profileName: string) => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
            importProfile: () => Promise<{ success: boolean; canceled?: boolean; profileName?: string }>;
            exportAll: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
            importAll: () => Promise<{ success: boolean; canceled?: boolean }>;
        }
    }
}

