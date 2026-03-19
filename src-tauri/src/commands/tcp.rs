/**
 * tcp.rs
 * TCP 服务器管理 — 监听端口、接受客户端连接、数据推流。
 * 从 Electron 的 TcpService.ts 转写。
 */
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use tauri::Emitter;
use tauri::Manager;

fn lock_err<T>(_: PoisonError<T>) -> String {
    "Lock poisoned".into()
}

// ─── 状态 ─────────────────────────────────────────────────────────

struct TcpSession {
    alive: Arc<AtomicBool>,
    /// 已连接的客户端写入端（用于 tcp_write）
    clients: Arc<Mutex<Vec<Arc<Mutex<std::net::TcpStream>>>>>,
}

pub struct TcpState {
    servers: Mutex<HashMap<u16, TcpSession>>,
}

impl Default for TcpState {
    fn default() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
        }
    }
}

// ─── 事件 ─────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct TcpDataEvent {
    port: u16,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
struct TcpErrorEvent {
    port: u16,
    error: String,
}

#[derive(Serialize, Clone)]
struct TcpPortEvent {
    port: u16,
}

// ─── Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub fn tcp_start(app: tauri::AppHandle, port: u16) -> Result<Value, String> {
    let state = app.state::<TcpState>();
    let mut servers = state.servers.lock().map_err(lock_err)?;

    if servers.contains_key(&port) {
        return Err("Server already running".into());
    }

    let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
        .map_err(|e| format!("Bind failed: {}", e))?;

    // 设置非阻塞以便优雅退出
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let alive = Arc::new(AtomicBool::new(true));
    let clients: Arc<Mutex<Vec<Arc<Mutex<std::net::TcpStream>>>>> =
        Arc::new(Mutex::new(Vec::new()));

    let t_alive = Arc::clone(&alive);
    let t_clients = Arc::clone(&clients);
    let t_app = app.clone();

    thread::spawn(move || {
        // 通知前端服务器已启动
        let _ = t_app.emit("tcp:server-started", TcpPortEvent { port });

        while t_alive.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _addr)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(200)));

                    let client = Arc::new(Mutex::new(stream));
                    if let Ok(mut cl) = t_clients.lock() {
                        cl.push(Arc::clone(&client));
                    }

                    // 客户端读取线程
                    let c_alive = Arc::clone(&t_alive);
                    let c_app = t_app.clone();
                    let c_clients = Arc::clone(&t_clients);

                    thread::spawn(move || {
                        let mut buf = [0u8; 4096];
                        while c_alive.load(Ordering::SeqCst) {
                            let result = {
                                let mut s = match client.lock() {
                                    Ok(s) => s,
                                    Err(_) => break,
                                };
                                s.read(&mut buf)
                            };

                            match result {
                                Ok(0) => break, // 连接关闭
                                Ok(n) => {
                                    let _ = c_app.emit("tcp:data", TcpDataEvent {
                                        port,
                                        data: buf[..n].to_vec(),
                                    });
                                }
                                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut
                                    || e.kind() == std::io::ErrorKind::WouldBlock => {}
                                Err(_) => break,
                            }
                        }

                        // 清理：从客户端列表移除
                        if let Ok(mut cl) = c_clients.lock() {
                            cl.retain(|c| !Arc::ptr_eq(c, &client));
                        }
                        let _ = c_app.emit("tcp:client-disconnected", TcpPortEvent { port });
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    let _ = t_app.emit("tcp:error", TcpErrorEvent {
                        port,
                        error: e.to_string(),
                    });
                    break;
                }
            }
        }
    });

    servers.insert(port, TcpSession { alive, clients });

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn tcp_stop(app: tauri::AppHandle, port: u16) -> Result<bool, String> {
    let state = app.state::<TcpState>();
    let mut servers = state.servers.lock().map_err(lock_err)?;

    if let Some(session) = servers.remove(&port) {
        session.alive.store(false, Ordering::SeqCst);
        let _ = app.emit("tcp:server-stopped", TcpPortEvent { port });
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn tcp_write(app: tauri::AppHandle, port: u16, data: Value) -> Result<bool, String> {
    let state = app.state::<TcpState>();
    let servers = state.servers.lock().map_err(lock_err)?;

    let session = servers.get(&port).ok_or("Server not running")?;

    let bytes: Vec<u8> = match &data {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Array(arr) => arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect(),
        _ => return Err("Invalid data format".into()),
    };

    let clients = session.clients.lock().map_err(lock_err)?;
    for client in clients.iter() {
        if let Ok(mut stream) = client.lock() {
            let _ = stream.write_all(&bytes);
            let _ = stream.flush();
        }
    }

    Ok(true)
}
