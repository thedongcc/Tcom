/**
 * SerialPort Loader
 * 延迟加载 serialport 模块以加快主进程启动
 */
let SerialPortClass: any = null;

export function getSerialPort() {
    if (!SerialPortClass) {
        const { SerialPort } = require('serialport');
        SerialPortClass = SerialPort;
    }
    return SerialPortClass;
}
