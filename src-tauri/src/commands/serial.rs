/**
 * serial.rs
 * 串口管理 Commands — 端口扫描、连接生命周期管理、数据读写、定时发送。
 * 从 Electron 的 SerialService.ts + PortScanner.ts + serial.ipc.ts 转写。
 *
 * 核心架构：
 * - SerialState：全局状态，使用 Mutex<HashMap> 管理多连接
 * - 读取线程：每个连接开一个 std::thread，通过 Tauri emit 推送数据
 * - 定时发送：独立线程 + AtomicBool 控制启停
 */
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serialport::{self, SerialPortType};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri::Manager;

/// Mutex 锁获取辅助：统一错误转换
fn lock_err<T>(_: PoisonError<T>) -> String {
    "Lock poisoned".into()
}

// ─── 全局状态 ─────────────────────────────────────────────────────────

/// 单个串口连接的句柄
struct PortHandle {
    /// 线程安全的串口写入端（独立于读取端，无锁竞争）
    writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 控制读取线程退出的信号
    alive: Arc<AtomicBool>,
    /// 定时发送的停止信号（None = 未运行）
    timed_send_stop: Option<Arc<AtomicBool>>,
}

/// Windows 高精度定时器 RAII 守卫
#[cfg(target_os = "windows")]
struct HighResTimerGuard;

#[cfg(target_os = "windows")]
impl HighResTimerGuard {
    fn new() -> Self {
        unsafe { windows_sys::Win32::Media::timeBeginPeriod(1); }
        Self
    }
}

#[cfg(target_os = "windows")]
impl Drop for HighResTimerGuard {
    fn drop(&mut self) {
        unsafe { windows_sys::Win32::Media::timeEndPeriod(1); }
    }
}

/// 全局串口状态，通过 tauri::State 管理
pub struct SerialState {
    ports: Mutex<HashMap<String, PortHandle>>,
}

impl Default for SerialState {
    fn default() -> Self {
        Self {
            ports: Mutex::new(HashMap::new()),
        }
    }
}

// ─── 数据结构 ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SerialOpenOptions {
    path: String,
    #[serde(rename = "baudRate")]
    baud_rate: u32,
    #[serde(rename = "dataBits", default = "default_data_bits")]
    data_bits: u8,
    #[serde(rename = "stopBits", default = "default_stop_bits")]
    stop_bits: u8,
    #[serde(default = "default_parity")]
    parity: String,
}

fn default_data_bits() -> u8 { 8 }
fn default_stop_bits() -> u8 { 1 }
fn default_parity() -> String { "none".into() }

#[derive(Serialize, Clone)]
struct SerialDataEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    data: Vec<u8>,
    timestamp: u64,
}

#[derive(Serialize, Clone)]
struct SerialClosedEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
}

#[derive(Serialize, Clone)]
struct SerialErrorEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    error: String,
}

#[derive(Serialize, Clone)]
struct TimedSendTickEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    data: Vec<u8>,
    timestamp: u64,
}

// ─── 端口信息 ─────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct PortInfo {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    manufacturer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "friendlyName")]
    friendly_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "pnpId")]
    pnp_id: Option<String>,
    busy: bool,
    status: String,
}

// ─── Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn serial_list_ports(app: tauri::AppHandle, _options: Value) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let ports_map = state.ports.lock().map_err(lock_err)?;
    let opened_paths: std::collections::HashSet<String> = ports_map
        .values()
        .map(|_| String::new()) // 占位，实际路径在 writer 内部
        .collect();
    drop(ports_map);

    // 获取系统串口列表
    let sys_ports = serialport::available_ports().unwrap_or_default();
    let mut result: Vec<PortInfo> = sys_ports
        .iter()
        .map(|p| {
            let (manufacturer, friendly, pnp_id) = match &p.port_type {
                SerialPortType::UsbPort(usb) => (
                    usb.manufacturer.clone(),
                    Some(format!(
                        "{} ({})",
                        usb.product.as_deref().unwrap_or("Serial Port"),
                        &p.port_name
                    )),
                    Some(format!("USB\\VID_{:04X}&PID_{:04X}", usb.vid, usb.pid)),
                ),
                SerialPortType::PciPort => (
                    Some("PCI".into()),
                    Some(format!("PCI Serial Port ({})", &p.port_name)),
                    None,
                ),
                _ => (None, None, None),
            };
            PortInfo {
                path: p.port_name.clone(),
                manufacturer,
                friendly_name: friendly,
                pnp_id: pnp_id,
                busy: false,
                status: "available".into(),
            }
        })
        .collect();

    // Windows 注册表兜底：发现 serialport crate 漏掉的端口
    #[cfg(target_os = "windows")]
    {
        if let Ok(reg_ports) = get_registry_ports() {
            for (port_name, device) in &reg_ports {
                if !result.iter().any(|p| &p.path == port_name) {
                    let manufacturer = if device.to_lowercase().contains("com0com") {
                        Some("com0com".into())
                    } else if device.to_lowercase().contains("bthmodem") {
                        Some("Microsoft (Bluetooth)".into())
                    } else {
                        None
                    };
                    result.push(PortInfo {
                        path: port_name.clone(),
                        manufacturer: manufacturer.clone(),
                        friendly_name: Some(format!(
                            "{} Port ({})",
                            manufacturer.as_deref().unwrap_or("Serial"),
                            port_name
                        )),
                        pnp_id: Some(device.clone()),
                        busy: false,
                        status: "available".into(),
                    });
                }
            }
        }
    }
    let _ = opened_paths; // 消除未使用警告

    // Windows: 为缺少 friendlyName 的端口从注册表获取 FriendlyName
    #[cfg(target_os = "windows")]
    {
        let friendly_map = get_registry_friendly_names();
        for port in &mut result {
            if port.friendly_name.is_none() || port.friendly_name.as_ref().map_or(false, |n| n == &port.path) {
                if let Some(name) = friendly_map.get(&port.path) {
                    port.friendly_name = Some(name.clone());
                }
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "ports": result }))
}

/// 从 Windows 注册表获取活动串口列表
#[cfg(target_os = "windows")]
fn get_registry_ports() -> Result<Vec<(String, String)>, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm
        .open_subkey("HARDWARE\\DEVICEMAP\\SERIALCOMM")
        .map_err(|e| e.to_string())?;

    let mut ports = Vec::new();
    for (name, value) in key.enum_values().flatten() {
        let val = format!("{}", value);
        if val.starts_with("COM") {
            ports.push((val, name));
        }
    }
    Ok(ports)
}

/// 从 Windows 注册表获取所有串口设备的 FriendlyName
/// 遍历 HKLM\SYSTEM\CurrentControlSet\Enum\* 查找 Device Parameters\PortName 匹配的设备
#[cfg(target_os = "windows")]
fn get_registry_friendly_names() -> std::collections::HashMap<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let mut map = std::collections::HashMap::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    if let Ok(enum_key) = hklm.open_subkey_with_flags(
        r"SYSTEM\CurrentControlSet\Enum", KEY_READ
    ) {
        // 遍历设备类型 (USB, BTHENUM, com0com, FTDIBUS 等)
        for bus in enum_key.enum_keys().flatten() {
            if let Ok(bus_key) = enum_key.open_subkey_with_flags(&bus, KEY_READ) {
                for device in bus_key.enum_keys().flatten() {
                    if let Ok(device_key) = bus_key.open_subkey_with_flags(&device, KEY_READ) {
                        for instance in device_key.enum_keys().flatten() {
                            if let Ok(inst_key) = device_key.open_subkey_with_flags(&instance, KEY_READ) {
                                // 读取 Device Parameters\PortName
                                let dp_path = format!(r"{}\Device Parameters", instance);
                                if let Ok(dp_key) = device_key.open_subkey_with_flags(&dp_path, KEY_READ) {
                                    if let Ok(port_name) = dp_key.get_value::<String, _>("PortName") {
                                        if port_name.starts_with("COM") {
                                            // 读取 FriendlyName
                                            if let Ok(friendly) = inst_key.get_value::<String, _>("FriendlyName") {
                                                map.insert(port_name, friendly);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    map
}

#[tauri::command]
pub fn serial_open(
    app: tauri::AppHandle,
    connection_id: String,
    options: SerialOpenOptions,
) -> Result<Value, String> {
    let state = app.state::<SerialState>();

    // 如果已存在同名连接，先关闭
    {
        let mut ports = state.ports.lock().map_err(lock_err)?;
        if let Some(old) = ports.remove(&connection_id) {
            old.alive.store(false, Ordering::SeqCst);
        }
    }

    // 解析参数
    let data_bits = match options.data_bits {
        5 => serialport::DataBits::Five,
        6 => serialport::DataBits::Six,
        7 => serialport::DataBits::Seven,
        _ => serialport::DataBits::Eight,
    };
    let stop_bits = match options.stop_bits {
        2 => serialport::StopBits::Two,
        _ => serialport::StopBits::One,
    };
    let parity = match options.parity.as_str() {
        "even" => serialport::Parity::Even,
        "odd" => serialport::Parity::Odd,
        _ => serialport::Parity::None,
    };

    // 打开串口
    let port = serialport::new(&options.path, options.baud_rate)
        .data_bits(data_bits)
        .stop_bits(stop_bits)
        .parity(parity)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("{}", e))?;

    // 分离读写端口：try_clone 创建独立的读取端，消除 Mutex 锁竞争
    let reader_port = port.try_clone().map_err(|e| format!("Failed to clone port: {}", e))?;
    let writer = Arc::new(Mutex::new(port));
    let alive = Arc::new(AtomicBool::new(true));

    // 启动读取线程（使用独立的 reader_port，不需要获取 writer 锁）
    let reader_alive = Arc::clone(&alive);
    let reader_app = app.clone();
    let reader_id = connection_id.clone();

    thread::spawn(move || {
        let mut reader = reader_port;
        let mut buf = [0u8; 4096];
        while reader_alive.load(Ordering::SeqCst) {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let _ = reader_app.emit(
                        "serial:data",
                        SerialDataEvent {
                            connection_id: reader_id.clone(),
                            data: buf[..n].to_vec(),
                            timestamp,
                        },
                    );
                }
                Ok(_) => {
                    // 0 字节 = 超时，继续循环
                    thread::sleep(Duration::from_millis(1));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // 正常超时，继续
                }
                Err(e) => {
                    // 真实错误（端口断开等）
                    let _ = reader_app.emit(
                        "serial:error",
                        SerialErrorEvent {
                            connection_id: reader_id.clone(),
                            error: e.to_string(),
                        },
                    );
                    let _ = reader_app.emit(
                        "serial:closed",
                        SerialClosedEvent {
                            connection_id: reader_id.clone(),
                        },
                    );
                    break;
                }
            }
        }
    });

    // 保存句柄
    let mut ports = state.ports.lock().map_err(lock_err)?;
    ports.insert(
        connection_id,
        PortHandle {
            writer,
            alive,
            timed_send_stop: None,
        },
    );

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn serial_close(app: tauri::AppHandle, connection_id: String) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let mut ports = state.ports.lock().map_err(lock_err)?;

    if let Some(handle) = ports.remove(&connection_id) {
        // 停止定时发送
        if let Some(stop) = &handle.timed_send_stop {
            stop.store(true, Ordering::SeqCst);
        }
        // 停止读取线程
        handle.alive.store(false, Ordering::SeqCst);
        // 发送关闭事件
        let _ = app.emit(
            "serial:closed",
            SerialClosedEvent {
                connection_id: connection_id.clone(),
            },
        );
    }

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn serial_write(
    app: tauri::AppHandle,
    connection_id: String,
    data: Value,
) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let ports = state.ports.lock().map_err(lock_err)?;

    let handle = ports
        .get(&connection_id)
        .ok_or("Port not open")?;

    // 将 data 转为 Vec<u8>
    let bytes: Vec<u8> = match &data {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.as_u64().map(|n| n as u8))
            .collect(),
        _ => return Err("Invalid data format".into()),
    };

    let mut port = handle.writer.lock().map_err(lock_err)?;
    port.write_all(&bytes).map_err(|e| e.to_string())?;
    port.flush().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "success": true }))
}

// ─── 定时发送 ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn serial_timed_send_start(
    app: tauri::AppHandle,
    connection_id: String,
    data: Vec<u8>,
    interval_ms: u64,
) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let mut ports = state.ports.lock().map_err(lock_err)?;

    let handle = ports
        .get_mut(&connection_id)
        .ok_or("Port not open")?;

    // 如果已有定时发送在运行，先停止
    if let Some(old_stop) = handle.timed_send_stop.take() {
        old_stop.store(true, Ordering::SeqCst);
    }

    let stop = Arc::new(AtomicBool::new(false));
    handle.timed_send_stop = Some(Arc::clone(&stop));
    let writer = Arc::clone(&handle.writer);
    let tick_app = app.clone();
    let tick_id = connection_id.clone();

    // ── 双线程架构：timer 线程精确计时，writer 线程异步写入 ──

    // Writer 线程：从 channel 接收数据并写入串口（可以慢慢写，不阻塞 timer）
    let (write_tx, write_rx) = std::sync::mpsc::channel::<Vec<u8>>();
    let writer_stop = Arc::clone(&stop);
    thread::spawn(move || {
        while !writer_stop.load(Ordering::SeqCst) {
            match write_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(buf) => {
                    if let Ok(mut port) = writer.lock() {
                        let _ = port.write_all(&buf);
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            }
        }
    });

    // Timer 线程：精确计时 + emit（不接触串口，零阻塞）
    thread::spawn(move || {
        // Windows 高精度定时器：将系统分辨率从 15.6ms → 1ms
        #[cfg(target_os = "windows")]
        let _timer_guard = HighResTimerGuard::new();

        // Windows：提升线程优先级为 TIME_CRITICAL，减少 OS 调度抢占
        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL};
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        }

        let interval = Duration::from_millis(interval_ms);
        let mut next_tick = Instant::now() + interval;
        let mut tick_count: u64 = 0;

        // 统一时钟源：用 Instant（QPC）计算时间戳
        let base_instant = Instant::now();
        let base_system_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        // 诊断变量
        let mut last_tick_instant = Instant::now();
        let mut interval_sum_us: u64 = 0;
        let mut interval_max_us: u64 = 0;
        let mut interval_min_us: u64 = u64::MAX;
        let mut emit_sum_us: u64 = 0;
        let mut emit_max_us: u64 = 0;

        while !stop.load(Ordering::SeqCst) {
            let tick_start = Instant::now();

            // tick 间隔（微秒精度，基于 QPC）
            let interval_us = tick_start.duration_since(last_tick_instant).as_micros() as u64;
            last_tick_instant = tick_start;

            // 基于 Instant（QPC）计算时间戳
            let timestamp = base_system_ms + base_instant.elapsed().as_millis() as u64;

            // 异步发送写请求到 writer 线程（非阻塞，仅放入 channel）
            let _ = write_tx.send(data.clone());

            // 通知前端
            let t_emit = Instant::now();
            let _ = tick_app.emit(
                "serial:timed-send-tick",
                TimedSendTickEvent {
                    connection_id: tick_id.clone(),
                    data: data.clone(),
                    timestamp,
                },
            );
            let emit_us = t_emit.elapsed().as_micros() as u64;

            // 高精度等待
            let now = Instant::now();
            if next_tick > now {
                let remaining = next_tick - now;
                if remaining > Duration::from_millis(2) {
                    thread::sleep(remaining - Duration::from_millis(2));
                }
                while Instant::now() < next_tick {
                    std::hint::spin_loop();
                }
            }
            next_tick += interval;
            tick_count += 1;

            // 统计（跳过第 1 次）
            if tick_count > 1 {
                interval_sum_us += interval_us;
                if interval_us > interval_max_us { interval_max_us = interval_us; }
                if interval_us < interval_min_us { interval_min_us = interval_us; }
                emit_sum_us += emit_us;
                if emit_us > emit_max_us { emit_max_us = emit_us; }
            }

            // 每 20 次输出诊断
            if tick_count > 1 && (tick_count - 1) % 20 == 0 {
                let n = 20u64;
                let ideal_us = interval_ms * 1000;
                let avg_interval = interval_sum_us / n;
                let drift_us = if avg_interval > ideal_us { avg_interval - ideal_us } else { ideal_us - avg_interval };
                println!(
                    "[TimedSend DIAG] tick#{} | interval(us): avg={} min={} max={} ideal={} drift={}us | emit(us): avg={} max={}",
                    tick_count, avg_interval, interval_min_us, interval_max_us, ideal_us, drift_us,
                    emit_sum_us / n, emit_max_us,
                );
                interval_sum_us = 0;
                interval_max_us = 0;
                interval_min_us = u64::MAX;
                emit_sum_us = 0;
                emit_max_us = 0;
            }
        }
        println!("[TimedSend] Stopped after {} ticks", tick_count);
    });

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn serial_timed_send_stop(
    app: tauri::AppHandle,
    connection_id: String,
) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let mut ports = state.ports.lock().map_err(lock_err)?;

    if let Some(handle) = ports.get_mut(&connection_id) {
        if let Some(stop) = handle.timed_send_stop.take() {
            stop.store(true, Ordering::SeqCst);
        }
    }

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn serial_timed_send_start_dynamic(
    app: tauri::AppHandle,
    connection_id: String,
    frames: Vec<Vec<u8>>,
    interval_ms: u64,
    _timestamp_slots: Value,
) -> Result<Value, String> {
    if frames.is_empty() {
        return Err("frames must not be empty".into());
    }

    let state = app.state::<SerialState>();
    let mut ports = state.ports.lock().map_err(lock_err)?;

    let handle = ports
        .get_mut(&connection_id)
        .ok_or("Port not open")?;

    // 停止旧的定时发送
    if let Some(old_stop) = handle.timed_send_stop.take() {
        old_stop.store(true, Ordering::SeqCst);
    }

    let stop = Arc::new(AtomicBool::new(false));
    handle.timed_send_stop = Some(Arc::clone(&stop));
    let writer = Arc::clone(&handle.writer);
    let tick_app = app.clone();
    let tick_id = connection_id.clone();

    thread::spawn(move || {
        let interval = Duration::from_millis(interval_ms);
        let mut next_tick = Instant::now() + interval;
        let mut frame_idx = 0usize;

        while !stop.load(Ordering::SeqCst) {
            let frame = &frames[frame_idx % frames.len()];

            // 写入数据
            if let Ok(mut port) = writer.lock() {
                if port.write_all(frame).is_err() {
                    break;
                }
                let _ = port.flush();
            } else {
                break;
            }

            // 通知前端
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            let _ = tick_app.emit(
                "serial:timed-send-tick",
                TimedSendTickEvent {
                    connection_id: tick_id.clone(),
                    data: frame.clone(),
                    timestamp,
                },
            );

            frame_idx += 1;

            // 高精度等待
            let now = Instant::now();
            if next_tick > now {
                thread::sleep(next_tick - now);
            }
            next_tick += interval;
        }
    });

    Ok(serde_json::json!({ "success": true }))
}
