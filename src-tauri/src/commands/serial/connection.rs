/**
 * connection.rs
 * 串口连接生命周期管理 — 打开、关闭、读取线程启动。
 */
use serde_json::Value;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::state::*;
use crate::commands::parser::api::ParserState;

#[derive(Clone, serde::Serialize)]
struct ParsedDataPayload {
    session_id: String,
    batch: Vec<std::collections::HashMap<String, f64>>,
}
/// 打开串口连接并启动读取线程
pub fn open_port(
    app: &tauri::AppHandle,
    connection_id: String,
    options: SerialOpenOptions,
    parser_scheme_id: Option<String>,
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

    // 启动读取线程
    spawn_reader_thread(app.clone(), connection_id.clone(), reader_port, parser_scheme_id, Arc::clone(&alive));

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

/// 关闭串口连接
pub fn close_port(app: &tauri::AppHandle, connection_id: String) -> Result<Value, String> {
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

/// 启动后台读取线程（使用独立的 reader_port，不需要获取 writer 锁）
fn spawn_reader_thread(
    app: AppHandle,
    connection_id: String,
    reader_port: Box<dyn serialport::SerialPort>,
    parser_scheme_id: Option<String>,
    alive: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let mut reader = reader_port;
        let mut buf = [0u8; 4096];

        // ── 协议解析引擎初始化（克隆指定 ID 的配置方案，不再跟踪 active_scheme_snapshot）──
        let mut framer = crate::commands::parser::framer::Framer::new();
        let mut current_scheme: Option<crate::commands::parser::schema::ParserScheme> = None;
        if let (Some(id), Some(state)) = (&parser_scheme_id, app.try_state::<ParserState>()) {
            let config = state.config.lock().unwrap();
            current_scheme = config.schemes.iter().find(|s| s.id == *id).cloned();
        }
        
        // 批量聚合池：收集单次节流窗口内所有解析成功的帧
        let mut parsed_batch: Vec<std::collections::HashMap<String, f64>> =
            Vec::with_capacity(100);
        // 节流锚点：60Hz = 约 16ms 发一次，防止 IPC 桥梁被洪流打爆
        let mut last_emit = std::time::Instant::now();
        // 方案切换检测：记录上一次使用的方案 ID，切换时清空 Framer 缓冲区防止脏包
        let mut last_scheme_id: Option<String> = None;

        while alive.load(Ordering::SeqCst) {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    // ── 轨道 A：原有 Raw Hex 数据流向前端（不动！）──
                    let _ = app.emit(
                        "serial:data",
                        SerialDataEvent {
                            connection_id: connection_id.clone(),
                            data: buf[..n].to_vec(),
                            timestamp,
                        },
                    );

                    // 热更新：如果前端通过 UI 修改了同一个 ID 的方案，这里也能拿到最新！
                    if let (Some(id), Some(state)) = (&parser_scheme_id, app.try_state::<ParserState>()) {
                        let config = state.config.lock().unwrap();
                        current_scheme = config.schemes.iter().find(|s| s.id == *id).cloned();
                    }

                    // 方案切换检测：清空 Framer 缓冲区防止脏包污染新方案
                    let current_id = current_scheme.as_ref().map(|s| s.id.clone());
                    if current_id != last_scheme_id {
                        framer.clear();
                        parsed_batch.clear();
                        last_scheme_id = current_id;
                    }

                    // 无激活方案则跳过解析
                    let Some(ref scheme) = current_scheme else {
                        continue;
                    };


                    framer.append(&buf[..n]);
                    let complete_frames = framer.extract_frames(scheme);

                    for frame in complete_frames {
                        let parsed = crate::commands::parser::decoder::decode_frame(&frame, scheme);
                        if !parsed.is_empty() {
                            parsed_batch.push(parsed);
                        }
                    }

                    // ── 节流发报（16ms 窗口，~60Hz）──
                    if !parsed_batch.is_empty()
                        && last_emit.elapsed().as_millis() >= 16
                    {
                        let payload = ParsedDataPayload {
                            session_id: connection_id.clone(),
                            batch: parsed_batch.clone(),
                        };
                        let _ = app.emit("tcom-parsed-data", &payload);
                        parsed_batch.clear();
                        last_emit = std::time::Instant::now();
                    }
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
                    let _ = app.emit(
                        "serial:error",
                        SerialErrorEvent {
                            connection_id: connection_id.clone(),
                            error: e.to_string(),
                        },
                    );
                    let _ = app.emit(
                        "serial:closed",
                        SerialClosedEvent {
                            connection_id: connection_id.clone(),
                        },
                    );
                    break;
                }
            }
        }
    });
}
