/**
 * SerialPort Loader
 * 延迟加载 serialport 模块以加快主进程启动
 */
let SerialPortClass: unknown = null;

export function getSerialPort(): any {
    if (!SerialPortClass) {
        const { SerialPort } = require('serialport');
        SerialPortClass = SerialPort;
    }
    return SerialPortClass;
}
