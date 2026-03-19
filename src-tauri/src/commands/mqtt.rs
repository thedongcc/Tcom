/**
 * mqtt.rs
 * MQTT 客户端 Commands — 连接、断开、发布、订阅。
 * 从 Electron 的 mqtt.ipc.ts 转写，使用 rumqttc 异步客户端。
 *
 * 核心架构：
 * - MqttState：全局状态，HashMap 管理多个 MQTT 连接
 * - 每个连接启动一个 tokio 任务处理事件循环（消息接收 → Tauri emit）
 */
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS, Transport};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;

// ─── 全局状态 ─────────────────────────────────────────────────────────

/// Mutex 锁获取辅助
fn lock_err<T>(_: PoisonError<T>) -> String {
    "Lock poisoned".into()
}

struct MqttConnection {
    client: AsyncClient,
    /// tokio 运行时句柄（用于跨线程 spawn）
    _runtime: Arc<tokio::runtime::Runtime>,
}

use std::sync::Arc;

/// 全局 MQTT 状态
pub struct MqttState {
    connections: Mutex<HashMap<String, MqttConnection>>,
}

impl Default for MqttState {
    fn default() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }
}

// ─── 数据结构 ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct MqttConfig {
    host: String,
    port: u16,
    #[serde(default = "default_protocol")]
    protocol: String,
    #[serde(default)]
    path: Option<String>,
    #[serde(rename = "clientId", default)]
    client_id: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(rename = "keepAlive", default = "default_keepalive")]
    keep_alive: u64,
    #[serde(rename = "connectTimeout", default = "default_timeout")]
    connect_timeout: u64,
    #[serde(rename = "cleanSession", default = "default_true")]
    clean_session: bool,
    #[serde(rename = "autoReconnect", default)]
    auto_reconnect: bool,
    #[serde(default)]
    topics: Option<Vec<MqttTopic>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum MqttTopic {
    Simple(String),
    Detailed { path: String, subscribed: Option<bool> },
}

fn default_protocol() -> String { "tcp".into() }
fn default_keepalive() -> u64 { 60 }
fn default_timeout() -> u64 { 30 }
fn default_true() -> bool { true }

#[derive(serde::Serialize, Clone)]
struct MqttMessageEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    topic: String,
    payload: Vec<u8>,
}

#[derive(serde::Serialize, Clone)]
struct MqttStatusEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    status: String,
}

#[derive(serde::Serialize, Clone)]
struct MqttErrorEvent {
    #[serde(rename = "connectionId")]
    connection_id: String,
    error: String,
}

// ─── Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn mqtt_connect(
    app: tauri::AppHandle,
    connection_id: String,
    config: MqttConfig,
) -> Result<Value, String> {
    let state = app.state::<MqttState>();

    // 清理已有连接
    {
        let mut conns = state.connections.lock().map_err(lock_err)?;
        if let Some(old) = conns.remove(&connection_id) {
            let _ = old.client.try_disconnect();
        }
    }

    // 构建 MQTT 选项
    let client_id = config
        .client_id
        .unwrap_or_else(|| format!("tcom-{}", uuid_simple()));

    // 清理 host 中可能包含的协议前缀
    let raw_host = if config.host.contains("://") {
        config.host.split("://").nth(1).unwrap_or(&config.host).to_string()
    } else {
        config.host.clone()
    };

    // 根据协议类型决定 host 格式和传输层
    let protocol = config.protocol.to_lowercase();
    let ws_path = config.path.as_deref().unwrap_or("/mqtt");

    let (mqtt_host, transport) = match protocol.as_str() {
        "ws" => {
            // rumqttc WebSocket 模式需要完整 URL 作为 host
            let url = format!("ws://{}:{}{}", raw_host, config.port, ws_path);
            log::info!("MQTT WebSocket 连接: {}", url);
            (url, Some(Transport::Ws))
        }
        "wss" => {
            let url = format!("wss://{}:{}{}", raw_host, config.port, ws_path);
            log::info!("MQTT WebSocket TLS 连接: {}", url);
            (url, Some(Transport::wss_with_default_config()))
        }
        _ => {
            (raw_host, None)
        }
    };

    let mut mqtt_opts = MqttOptions::new(&client_id, &mqtt_host, config.port);
    mqtt_opts.set_keep_alive(Duration::from_secs(config.keep_alive));
    mqtt_opts.set_clean_session(config.clean_session);

    if let (Some(user), Some(pass)) = (&config.username, &config.password) {
        mqtt_opts.set_credentials(user, pass);
    }

    // 设置传输层
    if let Some(t) = transport {
        mqtt_opts.set_transport(t);
    }

    // 创建异步客户端
    let (client, mut event_loop) = AsyncClient::new(mqtt_opts, 256);

    // 创建 tokio 运行时
    let rt = Arc::new(
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?,
    );

    // 自动订阅主题
    if let Some(topics) = &config.topics {
        let sub_client = client.clone();
        let sub_rt = Arc::clone(&rt);
        let topics_clone: Vec<String> = topics
            .iter()
            .filter_map(|t| match t {
                MqttTopic::Simple(s) => Some(s.clone()),
                MqttTopic::Detailed { path, subscribed } => {
                    if subscribed.unwrap_or(false) { Some(path.clone()) } else { None }
                }
            })
            .collect();

        sub_rt.spawn(async move {
            for topic in topics_clone {
                let _ = sub_client.subscribe(&topic, QoS::AtMostOnce).await;
            }
        });
    }

    // 启动事件循环线程
    let ev_app = app.clone();
    let ev_id = connection_id.clone();
    let ev_rt = Arc::clone(&rt);
    let ev_reconnect = config.auto_reconnect;
    // 用于事件循环退出时清理连接
    let ev_app_for_cleanup = app.clone();
    let ev_id_for_cleanup = connection_id.clone();

    std::thread::spawn(move || {
        ev_rt.block_on(async move {
            loop {
                match event_loop.poll().await {
                    Ok(event) => match event {
                        Event::Incoming(Packet::ConnAck(_)) => {
                            let _ = ev_app.emit(
                                "mqtt:status",
                                MqttStatusEvent {
                                    connection_id: ev_id.clone(),
                                    status: "connected".into(),
                                },
                            );
                        }
                        Event::Incoming(Packet::Publish(msg)) => {
                            let _ = ev_app.emit(
                                "mqtt:message",
                                MqttMessageEvent {
                                    connection_id: ev_id.clone(),
                                    topic: msg.topic.clone(),
                                    payload: msg.payload.to_vec(),
                                },
                            );
                        }
                        Event::Incoming(Packet::Disconnect) => {
                            let _ = ev_app.emit(
                                "mqtt:status",
                                MqttStatusEvent {
                                    connection_id: ev_id.clone(),
                                    status: "disconnected".into(),
                                },
                            );
                            if !ev_reconnect {
                                break;
                            }
                        }
                        _ => {}
                    },
                    Err(e) => {
                        let _ = ev_app.emit(
                            "mqtt:error",
                            MqttErrorEvent {
                                connection_id: ev_id.clone(),
                                error: e.to_string(),
                            },
                        );
                        let _ = ev_app.emit(
                            "mqtt:status",
                            MqttStatusEvent {
                                connection_id: ev_id.clone(),
                                status: "disconnected".into(),
                            },
                        );
                        if !ev_reconnect {
                            break;
                        }
                        // 重连等待
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });

        // 事件循环退出后清理连接，防止后续 publish 在已关闭的 channel 上操作
        let cleanup_state = ev_app_for_cleanup.state::<MqttState>();
        if let Ok(mut conns) = cleanup_state.connections.lock() {
            conns.remove(&ev_id_for_cleanup);
            log::info!("MQTT 事件循环退出，已清理连接: {}", ev_id_for_cleanup);
        };
    });

    // 保存连接
    let mut conns = state.connections.lock().map_err(lock_err)?;
    conns.insert(
        connection_id,
        MqttConnection {
            client,
            _runtime: rt,
        },
    );

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn mqtt_disconnect(app: tauri::AppHandle, connection_id: String) -> Result<Value, String> {
    let state = app.state::<MqttState>();
    let mut conns = state.connections.lock().map_err(lock_err)?;

    if let Some(conn) = conns.remove(&connection_id) {
        let _ = conn.client.try_disconnect();
        Ok(serde_json::json!({ "success": true }))
    } else {
        Err("Client not found".into())
    }
}

#[tauri::command]
pub fn mqtt_publish(
    app: tauri::AppHandle,
    connection_id: String,
    topic: String,
    payload: Value,
    _options: Value,
) -> Result<Value, String> {
    let state = app.state::<MqttState>();
    let conns = state.connections.lock().map_err(lock_err)?;

    let conn = conns.get(&connection_id).ok_or("Client not connected")?;

    // 将 payload 转为 bytes
    let bytes: Vec<u8> = match &payload {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Array(arr) => arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect(),
        _ => serde_json::to_vec(&payload).unwrap_or_default(),
    };

    let qos = _options
        .get("qos")
        .and_then(|v| v.as_u64())
        .map(|q| match q {
            1 => QoS::AtLeastOnce,
            2 => QoS::ExactlyOnce,
            _ => QoS::AtMostOnce,
        })
        .unwrap_or(QoS::AtMostOnce);

    let retain = _options
        .get("retain")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    conn.client
        .try_publish(&topic, qos, retain, bytes)
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn mqtt_subscribe(
    app: tauri::AppHandle,
    connection_id: String,
    topic: String,
) -> Result<Value, String> {
    let state = app.state::<MqttState>();
    let conns = state.connections.lock().map_err(lock_err)?;

    let conn = conns.get(&connection_id).ok_or("Client not connected")?;
    conn.client
        .try_subscribe(&topic, QoS::AtMostOnce)
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn mqtt_unsubscribe(
    app: tauri::AppHandle,
    connection_id: String,
    topic: String,
) -> Result<Value, String> {
    let state = app.state::<MqttState>();
    let conns = state.connections.lock().map_err(lock_err)?;

    let conn = conns.get(&connection_id).ok_or("Client not connected")?;
    conn.client
        .try_unsubscribe(&topic)
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "success": true }))
}

/// 简单 UUID 生成（无外部依赖）
fn uuid_simple() -> String {
    use std::time::SystemTime;
    let t = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", t)
}
