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

#[derive(Clone, serde::Serialize, Debug)]
struct ParsedEntry {
    /// 产生该条数据的解析方案 ID
    scheme_id: String,
    /// 解析出的物理量字段键值对
    fields: std::collections::HashMap<String, f64>,
}

#[derive(Clone, serde::Serialize)]
struct ParsedDataPayload {
    session_id: String,
    batch: Vec<ParsedEntry>,
}
/// 打开串口连接并启动读取线程
pub fn open_port(
    app: &tauri::AppHandle,
    connection_id: String,
    options: SerialOpenOptions,
    parser_scheme_ids: Option<Vec<String>>,
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
    spawn_reader_thread(app.clone(), connection_id.clone(), reader_port, parser_scheme_ids, Arc::clone(&alive));

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
    parser_scheme_ids: Option<Vec<String>>,
    alive: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let mut reader = reader_port;
        let mut buf = [0u8; 4096];

        // ── 协议解析引擎组初始化 ──
        struct ActiveParser {
            scheme: crate::commands::parser::schema::ParserScheme,
            framer: crate::commands::parser::framer::Framer,
        }
        let mut active_parsers: Vec<ActiveParser> = Vec::new();

        // 首次初始化
        if let (Some(ids), Some(state)) = (&parser_scheme_ids, app.try_state::<ParserState>()) {
            if let Ok(config) = state.config.lock() {
                active_parsers = config.schemes.iter()
                    .filter(|s| ids.contains(&s.id))
                    .map(|s| ActiveParser { scheme: s.clone(), framer: crate::commands::parser::framer::Framer::new() })
                    .collect();
            }
        }
        
        let mut parsed_batch: Vec<ParsedEntry> = Vec::with_capacity(100);
        let mut last_emit = std::time::Instant::now();
        
        // 方案切换检测指纹：如果用户在面板中修改了规则，需要重置对应的引擎以防脏包串流
        let mut last_fingerprint = String::new();

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

                    // 热更新：支持获取面板对这批 scheme 随时做出的变更
                    if let (Some(ids), Some(state)) = (&parser_scheme_ids, app.try_state::<ParserState>()) {
                        // 安全地获取锁，避免因锁中毒导致读取线程 panic
                        if let Ok(config) = state.config.lock() {
                        let fresh_schemes: Vec<_> = config.schemes.iter().filter(|s| ids.contains(&s.id)).cloned().collect();
                        
                        // 快速指纹判断是否有变(包含内存地址或简单长计算，这里简单拼接 IDs + names)
                        // 指纹包含所有影响解码结果的字段：id、name、fields 数量及每个字段的 offset/data_type/multiplier
                        let new_fingerprint = fresh_schemes.iter().map(|s| {
                            let fields_fp = s.fields.iter().map(|f| {
                                format!("{},{:?},{}", f.offset, f.data_type, f.multiplier)
                            }).collect::<Vec<_>>().join(";");
                            format!("{}_{}_{}_[{}]", s.id, s.name, s.fields.len(), fields_fp)
                        }).collect::<Vec<_>>().join("|");
                        if new_fingerprint != last_fingerprint {
                            active_parsers.clear();
                            for scheme in fresh_schemes {
                                active_parsers.push(ActiveParser {
                                    scheme,
                                    framer: crate::commands::parser::framer::Framer::new(),
                                });
                            }
                            parsed_batch.clear();
                            last_fingerprint = new_fingerprint;
                        }
                        } // lock guard drop
                    }

                    if active_parsers.is_empty() {
                        continue;
                    }

                    // 批量喂数据进各个协议分光仪（每帧携带 scheme_id，前端按方案隔离存储）
                    for p in &mut active_parsers {
                        p.framer.append(&buf[..n]);
                        let complete_frames = p.framer.extract_frames(&p.scheme);
                        for frame in complete_frames {
                            let fields = crate::commands::parser::decoder::decode_frame(&frame, &p.scheme);
                            if !fields.is_empty() {
                                parsed_batch.push(ParsedEntry {
                                    scheme_id: p.scheme.id.clone(),
                                    fields,
                                });
                            }
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
