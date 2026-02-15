export interface CRCConfig {
    enabled: boolean;
    algorithm: 'modbus-crc16' | 'ccitt-crc16' | 'crc32' | 'none';
    startIndex: number;
    endIndex: number;
}

// ... (algorithms unchanged)

export const sliceData = (data: Uint8Array, start: number, end: number): Uint8Array => {
    const actualStart = start < 0 ? data.length + start : start;
    if (actualStart < 0 || actualStart >= data.length) return new Uint8Array(0);

    let actualEnd = data.length;

    // 0 means "To the end" (Include everything)
    if (end === 0) {
        actualEnd = data.length;
    } else if (end < 0) {
        // Negative: Offset from end (e.g. -1 excludes last byte)
        actualEnd = data.length + end;
    } else {
        // Positive: Treat as Length (Legacy/Standard)
        actualEnd = start + end;
    }

    // Safety clamp (Ensure we don't go beyond buffer)
    if (actualEnd > data.length) actualEnd = data.length;

    // Ensure End >= Start
    if (actualEnd <= actualStart) return new Uint8Array(0);

    return data.slice(actualStart, actualEnd);
};

/**
 * CRC16 Modbus (Polynomial: 0x8005, Seed: 0xFFFF, Little Endian)
 */
function crc16modbus(data: Uint8Array): number {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc & 0xFFFF;
}

/**
 * CRC16 CCITT (Polynomial: 0x1021, Seed: 0xFFFF, Big Endian)
 */
function crc16ccitt(data: Uint8Array): number {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= (data[i] << 8);
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return crc & 0xFFFF;
}

/**
 * CRC32 (Standard IEEE 802.3 polynomial: 0xEDB88320)
 */
let crc32Table: Uint32Array | null = null;
function makeCRC32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[i] = c;
    }
    return table;
}

function crc32(data: Uint8Array): number {
    if (!crc32Table) crc32Table = makeCRC32Table();
    let crc = 0 ^ (-1);
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

export const calculateCRC = (data: Uint8Array, algorithm: CRCConfig['algorithm']): Uint8Array => {
    switch (algorithm) {
        case 'modbus-crc16': {
            const val = crc16modbus(data);
            const buf = new Uint8Array(2);
            // Modbus is LSB first
            buf[0] = val & 0xFF;
            buf[1] = (val >> 8) & 0xFF;
            return buf;
        }
        case 'ccitt-crc16': {
            const val = crc16ccitt(data);
            const buf = new Uint8Array(2);
            // CCITT is MSB first
            buf[0] = (val >> 8) & 0xFF;
            buf[1] = val & 0xFF;
            return buf;
        }
        case 'crc32': {
            const val = crc32(data);
            const buf = new Uint8Array(4);
            // CRC32 is usually MSB first
            buf[0] = (val >> 24) & 0xFF;
            buf[1] = (val >> 16) & 0xFF;
            buf[2] = (val >> 8) & 0xFF;
            buf[3] = val & 0xFF;
            return buf;
        }
        default:
            return new Uint8Array(0);
    }
};



export const applyTXCRC = (data: Uint8Array, config: CRCConfig): Uint8Array => {
    if (!config.enabled || config.algorithm === 'none') return data;

    // For TX, usually length 0 means "Everything before this token". 
    // But since this function receives the *whole* data (without tokens separatively processed here usually, wait),
    // Actually applyTXCRC is called with `rawData`. 
    // If we assume manual "startIndex" and "length", we checksum that part and append CRC at END.

    const targetData = sliceData(data, config.startIndex, config.endIndex);
    if (targetData.length === 0) return data;

    const crcValue = calculateCRC(targetData, config.algorithm);
    const result = new Uint8Array(data.length + crcValue.length);
    result.set(data);
    result.set(crcValue, data.length);
    return result;
};

export const validateRXCRC = (data: Uint8Array, config: CRCConfig): boolean => {
    if (!config.enabled || config.algorithm === 'none') return true;

    let crcLen = 0;
    if (config.algorithm.includes('crc16')) crcLen = 2;
    else if (config.algorithm === 'crc32') crcLen = 4;

    if (data.length <= crcLen) return false;

    // Determine expected CRC position mirroring TX logic
    // TX Logic: Head(0..Split) + CRC + Tail(Split..)
    // Split point determined by config.endIndex.
    // If endIndex=0, Tail=0. If endIndex=-1, Tail=1 byte.

    let tailLen = 0;
    const offset = config.endIndex || 0;

    if (offset < 0) {
        tailLen = Math.abs(offset);
    }

    // Ensure packet is large enough for CRC + Tail
    if (data.length < crcLen + tailLen) return false;

    // Extract CRC
    const crcStart = data.length - tailLen - crcLen;
    const receivedCRC = data.slice(crcStart, crcStart + crcLen);

    // The "Head" (Subject of Checksum) is everything before the CRC
    // TX Logic verifies checks on `sliceData(head, ...)`
    const head = data.slice(0, crcStart);

    // Apply startIndex on the Head content
    const dataToCheck = sliceData(head, config.startIndex || 0, 0);

    if (dataToCheck.length === 0) return false;

    const expectedCRC = calculateCRC(dataToCheck, config.algorithm);

    if (expectedCRC.length !== receivedCRC.length) return false;
    for (let i = 0; i < expectedCRC.length; i++) {
        if (expectedCRC[i] !== receivedCRC[i]) return false;
    }

    return true;
};
