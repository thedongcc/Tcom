import { SerialOpenOptions } from '../vite-env';
import { CRCConfig } from '../utils/crc';

export const COMMON_BAUD_RATES = [
    110, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200,
    230400, 460800, 500000, 576000, 921600, 1000000, 1152000, 1500000, 2000000, 2500000, 3000000, 3500000, 4000000
];

export interface LogEntry {
    id: string;
    type: 'RX' | 'TX' | 'INFO' | 'ERROR';
    data: string | Uint8Array;
    timestamp: number;
    crcStatus?: 'ok' | 'error' | 'none';
    topic?: string;
    repeatCount?: number;
    commandName?: string;
    sender?: string;
}

export type SessionType = 'serial' | 'mqtt' | 'tcp' | 'udp' | 'vnc' | 'rdp' | 'ssh' | 'file' | 'ftp' | 'sftp' | 'settings' | 'graph' | 'monitor';

export interface BaseSessionConfig {
    id: string;
    name: string;
    type: SessionType;
    autoConnect: boolean;
    // 通用连接配置（SerialOpenOptions 或其他类型的连接参数）
    uiState?: Record<string, unknown>;
    connection?: SerialOpenOptions | Record<string, unknown>;
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
        inputTokens?: Record<string, unknown>; // 持久化 Token 配置
        inputMode?: 'text' | 'hex';
        lineEnding?: '' | '\n' | '\r' | '\r\n';
        inputTimerInterval?: number;
        // Display area
        viewMode?: 'text' | 'hex';
        filterMode?: 'all' | 'rx' | 'tx';
        encoding?: 'utf-8' | 'gbk' | 'ascii';
        fontSize?: number;
        fontFamily?: 'mono' | 'consolas' | 'courier';
        showAllFonts?: boolean;
        showTimestamp?: boolean;
        autoScroll?: boolean;
        chunkTimeout?: number; // ms to merge consecutive RX chunks (legacy, use rxPacketMode instead)
        rxPacketMode?: 'none' | 'timeout' | 'delimiter' | 'fixedLength' | 'delimiterWithTimeout';
        rxDelimiter?: string; // 分隔符字符串，支持 \r\n、\n 等转义或 HEX 字符串如 0D0A
        rxFixedLength?: number; // 定长模式每帧字节数
        rxTimeoutMs?: number; // 超时/组合模式的超时毫秒数
        mergeRepeats?: boolean; // Merge identical consecutive logs
        smoothScroll?: boolean;
        flashNewMessage?: boolean;
        // Search State
        searchOpen?: boolean;
        searchQuery?: string;
        searchRegex?: boolean;
        searchMatchCase?: boolean;
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
    uiState?: {
        autoScroll?: boolean;
        showTimestamp?: boolean;
        viewMode?: 'text' | 'hex' | 'json' | 'base64';
        fontSize?: number;
        fontFamily?: string;
        mergeRepeats?: boolean;
        showDataLength?: boolean;
        showAllFonts?: boolean;
        filterMode?: 'all' | 'rx' | 'tx';
        smoothScroll?: boolean;
        flashNewMessage?: boolean;
        encoding?: 'utf-8' | 'gbk' | 'ascii';
        showControlChars?: boolean;
        showPacketType?: boolean;
        connectionExpanded?: boolean;
        publishTopic?: string;
        publishPayload?: string;
        publishFormat?: 'text' | 'hex' | 'json' | 'base64';
        // Search State
        searchOpen?: boolean;
        searchQuery?: string;
        searchRegex?: boolean;
        searchMatchCase?: boolean;
    };
}

export interface GraphSessionConfig extends BaseSessionConfig {
    type: 'graph';
    graphData?: {
        nodes: Record<string, unknown>[];
        edges: Record<string, unknown>[];
        // visual metadata?
    };
}

export interface MonitorSessionConfig extends BaseSessionConfig {
    type: 'monitor';
    virtualSerialPort?: string;
    physicalSerialPort?: string;
    connection: SerialOpenOptions; // Use this to store parameters for the physical port
    linked?: boolean;
    // Pairing Logic
    pairedPort?: string; // The internal port (e.g. COM101) automatically paired with virtualSerialPort
    autoDestroyPair?: boolean; // Whether to destroy the pair on session close/delete
    nagleTimeout?: number; // Nagle debounce window in milliseconds. 0 means pure streaming.
    uiState?: {
        viewMode?: 'text' | 'hex' | 'both';
        showTimestamp?: boolean;
        showPacketType?: boolean;
        showDataLength?: boolean;
        autoScroll?: boolean;
        smoothScroll?: boolean;
        flashNewMessage?: boolean;
        mergeRepeats?: boolean;
        showControlChars?: boolean;
        filterMode?: 'all' | 'rx' | 'tx';
        inputContent?: string;
        inputHTML?: string;
        inputTokens?: Record<string, unknown>;
        inputMode?: 'text' | 'hex';
        encoding?: 'utf-8' | 'gbk' | 'ascii';
        fontSize?: number;
        fontFamily?: string;
        sendTarget?: 'virtual' | 'physical';
        lineEnding?: string;
        inputTimerInterval?: number;
        searchOpen?: boolean;
        searchQuery?: string;
        searchRegex?: boolean;
        searchMatchCase?: boolean;
    };
}

export type SessionConfig = SerialSessionConfig | MqttSessionConfig | SettingsSessionConfig | GraphSessionConfig | MonitorSessionConfig;

export interface SessionState {
    id: string; // Same as config.id
    config: SessionConfig;
    isConnected: boolean;
    isConnecting: boolean;
    txBytes: number;
    rxBytes: number;
    logs: LogEntry[];
    // We can add more runtime state here
}
