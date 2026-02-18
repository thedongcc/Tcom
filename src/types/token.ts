export type CRCAlgorithm = 'modbus-crc16' | 'ccitt-crc16' | 'crc32';

export interface CRCConfig {
    algorithm: CRCAlgorithm;
    // range: 'start_to_token' | 'last_n_bytes' | 'custom';
    // For now simple: start index relative to message start, length? 
    // Or simpler: "Check all data before this token" is the most common use case.
    // Let's support: "All previous data" (default) or "Custom Range" later.
    // Actually user asked for "manually select which data to check".
    // So:
    startIndex: number; // 0-based index from start of message
    endIndex: number; // -1 = End, -2 = End-1, etc.
}

export interface AutoIncConfig {
    bytes: number; // 字节数 (1-8)
    defaultValue: string; // 默认值 (Hex 字符串)
    currentValue: string; // 当前值 (Hex 字符串)
    step: number; // 偏移量 (可正可负)
}

export interface FlagConfig {
    hex: string; // e.g. "AA BB"
    name?: string; // Optional custom name
}

export interface HexConfig {
    byteWidth: number; // e.g. 1, 3, 5
}

export interface TimestampConfig {
    format: 'milliseconds' | 'seconds';
    byteOrder: 'little' | 'big';
}

export interface Token {
    id: string; // Unique ID
    type: 'crc' | 'auto_inc' | 'flag' | 'hex' | 'timestamp';
    config: CRCConfig | AutoIncConfig | FlagConfig | HexConfig | TimestampConfig;
}

// A segment represents a chunk of the input: either static text/hex or a dynamic token
export interface Segment {
    id: string;
    type: 'text' | 'token';
    content: string | Token; // if text, raw string. if token, the Token object
    children?: Segment[]; // For container tokens like 'hex'
}
