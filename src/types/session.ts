import { SerialOpenOptions } from '../vite-env';
import { CRCConfig } from '../utils/crc';

export interface LogEntry {
    type: 'RX' | 'TX' | 'INFO' | 'ERROR';
    data: string | Uint8Array;
    timestamp: number;
    crcStatus?: 'ok' | 'error' | 'none';
    topic?: string;
    repeatCount?: number;
}

export type SessionType = 'serial' | 'mqtt' | 'tcp' | 'udp' | 'vnc' | 'rdp' | 'ssh' | 'file' | 'ftp' | 'sftp' | 'settings' | 'graph';

export interface BaseSessionConfig {
    id: string;
    name: string;
    type: SessionType;
    autoConnect: boolean;
    // Optional properties that might be accessed generically (careful with this)
    uiState?: any;
    connection?: any;
    txCRC?: CRCConfig;
    rxCRC?: CRCConfig;
}

export interface SettingsSessionConfig extends BaseSessionConfig {
    type: 'settings';
}

export interface SerialSessionConfig extends BaseSessionConfig {
    type: 'serial';
    connection: SerialOpenOptions;
    txCRC: CRCConfig;
    rxCRC: CRCConfig;
    // Persisted port description
    lastDescription?: string;
    // UI State (persistent)
    uiState?: {
        // Input area
        inputContent?: string;
        inputHTML?: string; // Persist HTML to keep tokens
        inputTokens?: Record<string, any>; // Persist token configurations. Type 'any' to avoid circular dependency if possible, or import Token
        inputMode?: 'text' | 'hex';
        lineEnding?: '' | '\n' | '\r' | '\r\n';
        // Display area
        viewMode?: 'text' | 'hex';
        filterMode?: 'all' | 'rx' | 'tx';
        encoding?: 'utf-8' | 'gbk' | 'ascii';
        fontSize?: number;
        fontFamily?: 'mono' | 'consolas' | 'courier';
        showAllFonts?: boolean;
        showTimestamp?: boolean;
        autoScroll?: boolean;
        chunkTimeout?: number; // ms to merge consecutive RX chunks
        mergeRepeats?: boolean; // Merge identical consecutive logs
    };
}

export interface MqttTopicConfig {
    id: string;
    path: string;
    color: string;
    subscribed: boolean;
}

export interface MqttSessionConfig extends BaseSessionConfig {
    type: 'mqtt';
    protocol: 'tcp' | 'ws' | 'wss' | 'ssl';
    host: string;
    port: number;
    path?: string;
    clientId: string;
    username?: string;
    password?: string;
    keepAlive: number;
    cleanSession: boolean;
    autoReconnect: boolean;
    connectTimeout: number; // seconds
    topics: MqttTopicConfig[];
}

export interface GraphSessionConfig extends BaseSessionConfig {
    type: 'graph';
    graphData?: {
        nodes: any[];
        edges: any[];
        // visual metadata?
    };
}

export type SessionConfig = SerialSessionConfig | MqttSessionConfig | SettingsSessionConfig | GraphSessionConfig;

export interface SessionState {
    id: string; // Same as config.id
    config: SessionConfig;
    isConnected: boolean;
    isConnecting: boolean;
    logs: LogEntry[];
    // We can add more runtime state here
}
