import { SerialPortInfo } from '../vite-env';

export const formatPortInfo = (port: SerialPortInfo) => {
    let name = port.friendlyName || '';
    // Remove (COMx) repetition
    name = name.replace(/\(COM\d+\)/gi, '').trim();
    // Remove path repetition if friendlyName starts with it
    if (name.startsWith(port.path)) {
        name = name.substring(port.path.length).trim();
    }

    // Add manufacturer if not already in name
    if (port.manufacturer && !name.includes(port.manufacturer)) {
        name = `${name} (${port.manufacturer})`;
    }

    return `${port.path} ${name}`.trim();
};
export const formatTimestamp = (ts: number, fmt: string) => {
    const date = new Date(ts);
    const pad = (n: number, w: number = 2) => n.toString().padStart(w, '0');

    // Simple Replacer
    return fmt
        .replace('HH', pad(date.getHours()))
        .replace('mm', pad(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()))
        .replace('SSS', pad(date.getMilliseconds(), 3));
};
