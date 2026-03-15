/**
 * serialport.types.ts
 * SerialPort 实例的接口类型定义，替代主进程 Service 层中的 any 类型。
 * 基于 serialport 库的运行时行为抽象，兼容 Electron 主进程环境。
 */

/** 串口控制信号 */
export interface ControlSignals {
    carrierDetect: boolean;
    dsr: boolean;
    cts: boolean;
}

/**
 * 串口实例接口。
 * 抽象了 serialport 库的核心方法，供 SerialService / MonitorService / TimedSendManager 使用。
 */
export interface SerialPortInstance {
    /** 串口路径（如 "COM3" / "/dev/ttyUSB0"） */
    readonly path: string;
    /** 串口当前是否处于打开状态 */
    readonly isOpen: boolean;

    /** 写入数据到串口 */
    write(data: Buffer | string, cb: (err?: Error | null) => void): boolean;
    /** 打开串口连接 */
    open(cb?: (err?: Error | null) => void): void;
    /** 关闭串口连接 */
    close(cb?: (err?: Error | null) => void): void;
    /** 监听数据 */
    on(event: 'data', listener: (data: Buffer) => void): this;
    /** 监听关闭事件 */
    on(event: 'close', listener: () => void): this;
    /** 监听错误事件 */
    on(event: 'error', listener: (err: Error) => void): this;
    /** 移除事件监听器 */
    removeAllListeners(event?: string): this;
    /** 获取控制信号（用于检测对端 DTR/DSR/CTS） */
    getControlSignals(): Promise<ControlSignals>;
    /** 设置控制信号（RTS/DTR 等，用于唤醒对端） */
    set(options: Partial<{ rts: boolean; dtr: boolean; brk: boolean }>): Promise<void>;
    /** 清除接收/发送缓冲区残留数据 */
    flush(cb?: (err?: Error | null) => void): void;
}
