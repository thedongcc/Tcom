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
