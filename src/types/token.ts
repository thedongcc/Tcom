export type CRCAlgorithm = 'modbus-crc16' | 'ccitt-crc16' | 'crc32';

export interface CRCConfig {
    algorithm: CRCAlgorithm;
    startIndex: number;
    endIndex: number;
    [key: string]: any;
}

export interface AutoIncConfig {
    bytes: number;        // 字节数 (1-8)
    defaultValue: string; // 默认值 (Hex 字符串)
    currentValue: string; // 当前值 (Hex 字符串)
    step: number;         // 偏移量 (可正可负)
    [key: string]: any;
}

export interface FlagConfig {
    hex: string;          // e.g. "AA BB"
    name?: string;        // Optional custom name
    [key: string]: any;
}

export interface HexConfig {
    byteWidth: number;    // e.g. 1, 3, 5
    [key: string]: any;
}

export interface TimestampConfig {
    format: 'milliseconds' | 'seconds';
    byteOrder: 'little' | 'big';
    [key: string]: any;
}

export interface RandomBytesConfig {
    bytes: number;        // 字节数 (1-8)
    min: number;          // 最小值 (按字节，0-255)
    max: number;          // 最大值 (按字节，0-255)
    [key: string]: any;
}

export interface Token {
    id: string;
    type: string;
    config: Record<string, any>;
}

// A segment represents a chunk of the input: either static text/hex or a dynamic token
export interface Segment {
    id: string;
    type: 'text' | 'token';
    content: string | Token;
    children?: Segment[];
}
