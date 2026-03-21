/**
 * monitor.rs
 * 虚拟串口监控服务 — 在内部虚拟端口与外部物理端口之间双向转发数据。
 * 从 Electron 的 MonitorService.ts 转写。
 *
 * 状态机：Probing（等待外部连接）↔ Forwarding（双向转发）
 */
use serde::Serialize;
use serde_json::Value;
use serialport;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;

fn lock_err<T>(_: PoisonError<T>) -> String {
    "Lock poisoned".into()
}

// ─── 状态 ─────────────────────────────────────────────────────────

const STATE_PROBING: u8 = 0;
const STATE_FORWARDING: u8 = 1;
const STATE_STOPPING: u8 = 2;

struct MonitorSession {
    /// 内部端口写入端 (保留引用于备用需要)
    internal_writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 物理端口写入端 (保留引用于备用需要)
    physical_writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 发往内部虚拟口的信道发送端
    tx_to_internal: std::sync::mpsc::Sender<Vec<u8>>,
    /// 发往外部物理口的信道发送端
    tx_to_physical: std::sync::mpsc::Sender<Vec<u8>>,
    /// 状态机
    state: Arc<AtomicU8>,
    /// 停止信号
    alive: Arc<AtomicBool>,
    /// 高精度定时器中断标志
    timed_send_stop: Option<Arc<AtomicBool>>,
}

pub struct MonitorState {
    sessions: Mutex<HashMap<String, MonitorSession>>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// ─── 事件结构 ─────────────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorDataEvent {
    pub session_id: String,
    #[serde(rename = "type")]
    pub direction: String,
    pub target: Option<String>,
    pub data: Vec<u8>,
    pub timestamp: u64,
}

#[derive(Serialize, Clone)]
struct MonitorErrorEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    error: String,
}

#[derive(Serialize, Clone)]
struct MonitorPartnerEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    connected: bool,
}

#[derive(Serialize, Clone)]
struct MonitorClosedEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
}

// ─── Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub fn monitor_start(
    app: tauri::AppHandle,
    session_id: String,
    config: Value,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();

    // 解析配置
    let internal_path = config.get("pairedPort")
        .or_else(|| config.get("internalPort"))
        .and_then(|v| v.as_str())
        .ok_or("Missing internal port")?
        .to_string();

    let physical_path = config.get("physicalSerialPort")
        .or_else(|| config.get("physicalPort"))
        .and_then(|v| v.as_str())
        .ok_or("Missing physical port")?
        .to_string();

    let external_path = config.get("virtualSerialPort")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let baud_rate = config.get("connection")
        .and_then(|c| c.get("baudRate"))
        .or_else(|| config.get("baudRate"))
        .and_then(|v| v.as_u64())
        .unwrap_or(9600) as u32;

    let nagle_timeout_ms = config.get("nagleTimeout")
        .and_then(|v| v.as_u64())
        .unwrap_or(15);

    // 如果已有会话，先停止
    {
        let mut sessions = state.sessions.lock().map_err(lock_err)?;
        if let Some(old) = sessions.remove(&session_id) {
            old.alive.store(false, Ordering::SeqCst);
        }
    }

    // 打开物理端口
    let physical = serialport::new(&physical_path, baud_rate)
        .timeout(Duration::from_millis(5))
        .open()
        .map_err(|e| format!("Physical port: {}", e))?;

    // 打开内部端口
    let internal = serialport::new(&internal_path, baud_rate)
        .timeout(Duration::from_millis(5))
        .open()
        .map_err(|e| format!("Internal port: {}", e))?;

    // 分开读写端，以免 Mutex 锁竞争
    let mut physical_reader = physical.try_clone().map_err(|e| format!("Physical clone: {}", e))?;
    let mut internal_reader = internal.try_clone().map_err(|e| format!("Internal clone: {}", e))?;

    let internal_writer = Arc::new(Mutex::new(internal));
    let physical_writer = Arc::new(Mutex::new(physical));
    let alive = Arc::new(AtomicBool::new(true));
    let monitor_state = Arc::new(AtomicU8::new(STATE_PROBING));

    // 使用 MPSC 通道将物理层读取的数据发送到写入端，彻底消除 flush() 卡顿带来的链式锁阻塞
    let (tx_phys_to_int, rx_phys_to_int) = std::sync::mpsc::channel::<Vec<u8>>();
    let (tx_int_to_phys, rx_int_to_phys) = std::sync::mpsc::channel::<Vec<u8>>();

    // 1. 物理端口读取线程（推送 RX 数据 -> 异步发送到通道）
    {
        let alive_r = Arc::clone(&alive);
        let state_r = Arc::clone(&monitor_state);
        let app_r = app.clone();
        let sid = session_id.clone();
        let tx = tx_phys_to_int.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while alive_r.load(Ordering::SeqCst) {
                match physical_reader.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        let current = state_r.load(Ordering::SeqCst);
                        if current == STATE_FORWARDING {
                            let _ = tx.send(buf[..n].to_vec());
                            let timestamp = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;
                            let _ = app_r.emit("monitor:data", MonitorDataEvent {
                                session_id: sid.clone(),
                                direction: "RX".into(),
                                target: None,
                                data: buf[..n].to_vec(),
                                timestamp,
                            });
                        }
                    }
                    Ok(_) => {}
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                    Err(e) => {
                        let _ = app_r.emit("monitor:error", MonitorErrorEvent {
                            session_id: sid.clone(),
                            error: format!("Physical: {}", e),
                        });
                        break;
                    }
                }
            }
        });
    }

    // 2. 内部端口读取线程（推送 TX 数据 -> 异步发送到通道）
    {
        let alive_r = Arc::clone(&alive);
        let state_r = Arc::clone(&monitor_state);
        let app_r = app.clone();
        let sid = session_id.clone();
        let tx = tx_int_to_phys.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while alive_r.load(Ordering::SeqCst) {
                match internal_reader.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        let current = state_r.load(Ordering::SeqCst);
                        if current == STATE_FORWARDING {
                            let _ = tx.send(buf[..n].to_vec());
                            let timestamp = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;
                            let _ = app_r.emit("monitor:data", MonitorDataEvent {
                                session_id: sid.clone(),
                                direction: "TX".into(),
                                target: None,
                                data: buf[..n].to_vec(),
                                timestamp,
                            });
                        }
                    }
                    Ok(_) => {}
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                    Err(e) => {
                        let _ = app_r.emit("monitor:error", MonitorErrorEvent {
                            session_id: sid.clone(),
                            error: format!("Internal: {}", e),
                        });
                        break;
                    }
                }
            }
        });
    }

    // 3. 物理 -> 内部 的专职写入线程（安全承受 flush 卡顿）
    {
        let int_w = Arc::clone(&internal_writer);
        let alive_w = Arc::clone(&alive);
        let rx = rx_phys_to_int;
        thread::spawn(move || {
            while alive_w.load(Ordering::SeqCst) {
                if let Ok(data) = rx.recv_timeout(Duration::from_millis(100)) {
                    let mut batched_data = data;
                    // 动态防抖粘包算法
                    if nagle_timeout_ms > 0 {
                        while let Ok(more) = rx.recv_timeout(Duration::from_millis(nagle_timeout_ms)) {
                            batched_data.extend(more);
                        }
                    }
                    if let Ok(mut int) = int_w.lock() {
                        let _ = int.write_all(&batched_data);
                    }
                }
            }
        });
    }

    // 4. 内部 -> 物理 的专职写入线程（安全承受 flush 卡顿）
    {
        let phys_w = Arc::clone(&physical_writer);
        let alive_w = Arc::clone(&alive);
        let rx = rx_int_to_phys;
        thread::spawn(move || {
            while alive_w.load(Ordering::SeqCst) {
                if let Ok(data) = rx.recv_timeout(Duration::from_millis(100)) {
                    let mut batched_data = data;
                    // 同理动态粘包
                    if nagle_timeout_ms > 0 {
                        while let Ok(more) = rx.recv_timeout(Duration::from_millis(nagle_timeout_ms)) {
                            batched_data.extend(more);
                        }
                    }
                    if let Ok(mut phys) = phys_w.lock() {
                        let _ = phys.write_all(&batched_data);
                    }
                }
            }
        });
    }

    // 轮询线程：检测外部端口占用状态以切换 probing ↔ forwarding
    if !external_path.is_empty() {
        let alive_p = Arc::clone(&alive);
        let state_p = Arc::clone(&monitor_state);
        let app_p = app.clone();
        let sid = session_id.clone();
        let ext = external_path.clone();

        thread::spawn(move || {
            while alive_p.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(500));
                if !alive_p.load(Ordering::SeqCst) { break; }

                let busy = is_port_busy(&ext);
                let current = state_p.load(Ordering::SeqCst);

                if current == STATE_PROBING && busy {
                    // 外部软件连接 → 开始转发
                    state_p.store(STATE_FORWARDING, Ordering::SeqCst);
                    let _ = app_p.emit("monitor:partner-status", MonitorPartnerEvent {
                        session_id: sid.clone(),
                        connected: true,
                    });
                } else if current == STATE_FORWARDING && !busy {
                    // 外部软件断开 → 停止转发
                    state_p.store(STATE_PROBING, Ordering::SeqCst);
                    let _ = app_p.emit("monitor:partner-status", MonitorPartnerEvent {
                        session_id: sid.clone(),
                        connected: false,
                    });
                }
            }
        });
    }

    // 保存会话
    let mut sessions = state.sessions.lock().map_err(lock_err)?;
    sessions.insert(session_id, MonitorSession {
        internal_writer,
        physical_writer,
        tx_to_internal: tx_phys_to_int.clone(),
        tx_to_physical: tx_int_to_phys.clone(),
        state: monitor_state,
        alive,
        timed_send_stop: None,
    });

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn monitor_stop(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();
    let mut sessions = state.sessions.lock().map_err(lock_err)?;

    if let Some(mut session) = sessions.remove(&session_id) {
        session.state.store(STATE_STOPPING, Ordering::SeqCst);
        session.alive.store(false, Ordering::SeqCst);
        if let Some(stop) = session.timed_send_stop.take() {
            stop.store(true, Ordering::SeqCst);
        }

        let _ = app.emit("monitor:closed", MonitorClosedEvent {
            session_id: session_id.clone(),
        });
    }

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn monitor_write(
    app: tauri::AppHandle,
    session_id: String,
    target: String,
    data: Value,
) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        let state = app.state::<MonitorState>();
        let sessions = state.sessions.lock().map_err(lock_err)?;

        let session = sessions.get(&session_id).ok_or("Session not found")?;

        let bytes: Vec<u8> = match &data {
            Value::String(s) => s.as_bytes().to_vec(),
            Value::Array(arr) => arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect(),
            _ => return Err("Invalid data format".into()),
        };

        let tx = if target == "virtual" {
            &session.tx_to_internal
        } else {
            &session.tx_to_physical
        };

        if let Err(e) = tx.send(bytes) {
            println!("[DEBUG: monitor_write] channel send error: {:?}", e);
            return Err("Failed to enqueue write".to_string());
        }

        Ok(serde_json::json!({ "success": true }))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ========================
// 专配虚拟环境的高精度自旋定时器
// ========================

#[tauri::command]
pub fn monitor_start_timed_send(
    app: tauri::AppHandle,
    session_id: String,
    target: String,
    data: Value,
    interval_ms: u64,
) -> Result<Value, String> {
    let bytes: Vec<u8> = match &data {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Array(arr) => arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect(),
        _ => return Err("Invalid data format".into()),
    };

    let state = app.state::<MonitorState>();
    let mut sessions = state.sessions.lock().map_err(lock_err)?;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    // 如果已有定时发送在运行，先停止
    if let Some(old_stop) = session.timed_send_stop.take() {
        old_stop.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    session.timed_send_stop = Some(std::sync::Arc::clone(&stop));

    let tx = if target == "virtual" {
        session.tx_to_internal.clone()
    } else {
        session.tx_to_physical.clone()
    };

    let tick_app = app.clone();
    let tick_id = session_id.clone();
    let tick_target = target.clone();

    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        let _timer_guard = crate::commands::serial::state::HighResTimerGuard::new();

        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL};
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        }

        let interval = std::time::Duration::from_millis(interval_ms);
        let mut next_tick = std::time::Instant::now() + interval;

        let mut batch = Vec::new();
        let mut last_emit = std::time::Instant::now();
        let batch_interval = std::time::Duration::from_millis(16);

        while !stop.load(std::sync::atomic::Ordering::SeqCst) {
            let _ = tx.send(bytes.clone());

            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            batch.push(MonitorDataEvent {
                session_id: tick_id.clone(),
                direction: "TX".into(),
                target: Some(tick_target.clone()),
                data: bytes.clone(),
                timestamp,
            });

            let now = std::time::Instant::now();
            if now.duration_since(last_emit) >= batch_interval {
                let _ = tick_app.emit("monitor:timed-send-tick-batch", batch.clone());
                batch.clear();
                last_emit = now;
            }

            let now = std::time::Instant::now();
            if next_tick > now {
                let remaining = next_tick - now;
                if remaining > std::time::Duration::from_millis(2) {
                    std::thread::sleep(remaining - std::time::Duration::from_millis(2));
                }
                while std::time::Instant::now() < next_tick {
                    std::hint::spin_loop();
                }
            }
            next_tick += interval;
        }

        if !batch.is_empty() {
            let _ = tick_app.emit("monitor:timed-send-tick-batch", batch);
        }
    });

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn monitor_stop_timed_send(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();
    let mut sessions = state.sessions.lock().map_err(lock_err)?;

    if let Some(session) = sessions.get_mut(&session_id) {
        if let Some(stop) = session.timed_send_stop.take() {
            stop.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }

    Ok(serde_json::json!({ "success": true }))
}

/// 检测端口是否被占用（尝试以低波特率打开）
fn is_port_busy(path: &str) -> bool {
    match serialport::new(path, 9600)
        .timeout(Duration::from_millis(50))
        .open()
    {
        Ok(_) => false, // 打开成功 = 未被占用，端口自动关闭（drop）
        Err(_) => true, // 打开失败 = 被占用
    }
}
