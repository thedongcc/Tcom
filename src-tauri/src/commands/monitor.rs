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
    /// 内部端口写入端
    internal_writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 物理端口写入端
    physical_writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 状态机
    state: Arc<AtomicU8>,
    /// 停止信号
    alive: Arc<AtomicBool>,
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

#[derive(Serialize, Clone)]
struct MonitorDataEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "type")]
    direction: String, // "TX" | "RX"
    data: Vec<u8>,
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

    // 如果已有会话，先停止
    {
        let mut sessions = state.sessions.lock().map_err(lock_err)?;
        if let Some(old) = sessions.remove(&session_id) {
            old.alive.store(false, Ordering::SeqCst);
        }
    }

    // 打开物理端口
    let physical = serialport::new(&physical_path, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Physical port: {}", e))?;

    // 打开内部端口
    let internal = serialport::new(&internal_path, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Internal port: {}", e))?;

    let internal_writer = Arc::new(Mutex::new(internal));
    let physical_writer = Arc::new(Mutex::new(physical));
    let alive = Arc::new(AtomicBool::new(true));
    let monitor_state = Arc::new(AtomicU8::new(STATE_PROBING));

    // 物理端口读取线程（Physical → Internal 转发 + 推送 RX 数据）
    {
        let phys_r = Arc::clone(&physical_writer);
        let int_w = Arc::clone(&internal_writer);
        let alive_r = Arc::clone(&alive);
        let state_r = Arc::clone(&monitor_state);
        let app_r = app.clone();
        let sid = session_id.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while alive_r.load(Ordering::SeqCst) {
                let result = {
                    let mut port = match phys_r.lock() {
                        Ok(p) => p,
                        Err(_) => break,
                    };
                    port.read(&mut buf)
                };

                match result {
                    Ok(n) if n > 0 => {
                        let current = state_r.load(Ordering::SeqCst);
                        if current == STATE_FORWARDING {
                            // 转发到内部端口
                            if let Ok(mut int) = int_w.lock() {
                                let _ = int.write_all(&buf[..n]);
                                let _ = int.flush();
                            }
                            // 推送 RX 数据
                            let _ = app_r.emit("monitor:data", MonitorDataEvent {
                                session_id: sid.clone(),
                                direction: "RX".into(),
                                data: buf[..n].to_vec(),
                            });
                        }
                        // probing 模式下丢弃数据
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

    // 内部端口读取线程（Internal → Physical 转发 + 推送 TX 数据）
    {
        let int_r = Arc::clone(&internal_writer);
        let phys_w = Arc::clone(&physical_writer);
        let alive_r = Arc::clone(&alive);
        let state_r = Arc::clone(&monitor_state);
        let app_r = app.clone();
        let sid = session_id.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while alive_r.load(Ordering::SeqCst) {
                let result = {
                    let mut port = match int_r.lock() {
                        Ok(p) => p,
                        Err(_) => break,
                    };
                    port.read(&mut buf)
                };

                match result {
                    Ok(n) if n > 0 => {
                        let current = state_r.load(Ordering::SeqCst);
                        if current == STATE_FORWARDING {
                            // 转发到物理端口
                            if let Ok(mut phys) = phys_w.lock() {
                                let _ = phys.write_all(&buf[..n]);
                                let _ = phys.flush();
                            }
                            // 推送 TX 数据
                            let _ = app_r.emit("monitor:data", MonitorDataEvent {
                                session_id: sid.clone(),
                                direction: "TX".into(),
                                data: buf[..n].to_vec(),
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
        state: monitor_state,
        alive,
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

    if let Some(session) = sessions.remove(&session_id) {
        session.state.store(STATE_STOPPING, Ordering::SeqCst);
        session.alive.store(false, Ordering::SeqCst);

        let _ = app.emit("monitor:closed", MonitorClosedEvent {
            session_id: session_id.clone(),
        });
    }

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn monitor_write(
    app: tauri::AppHandle,
    session_id: String,
    target: String,
    data: Value,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();
    let sessions = state.sessions.lock().map_err(lock_err)?;

    let session = sessions.get(&session_id).ok_or("Session not found")?;

    let bytes: Vec<u8> = match &data {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Array(arr) => arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect(),
        _ => return Err("Invalid data format".into()),
    };

    let writer = if target == "virtual" {
        &session.internal_writer
    } else {
        &session.physical_writer
    };

    let mut port = writer.lock().map_err(lock_err)?;
    port.write_all(&bytes).map_err(|e: std::io::Error| e.to_string())?;
    port.flush().map_err(|e: std::io::Error| e.to_string())?;

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
