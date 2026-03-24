/**
 * serial/mod.rs
 * 串口管理 Commands 门面层 — 端口扫描、连接生命周期、数据读写、定时发送。
 *
 * 子模块：
 * - state.rs — 核心状态和数据结构
 * - scanner.rs — 硬件扫描 + Windows 注册表
 * - connection.rs — 打开/关闭/读取线程
 * - io.rs — 数据写入
 * - timer.rs — 定时发送（高精度）
 */
pub mod state;
mod scanner;
mod connection;
mod io;
mod timer;

// 重新导出 SerialState 供 lib.rs 使用
pub use state::SerialState;

use serde_json::Value;

// ─── Tauri Command 入口（签名不变、仅委托子模块） ──────────────────────

#[tauri::command]
pub fn serial_list_ports(app: tauri::AppHandle, _options: Value) -> Result<Value, String> {
    scanner::scan_ports(&app)
}

#[tauri::command]
pub fn serial_open(
    app: tauri::AppHandle,
    connection_id: String,
    options: state::SerialOpenOptions,
) -> Result<Value, String> {
    connection::open_port(&app, connection_id, options)
}

#[tauri::command]
pub fn serial_close(app: tauri::AppHandle, connection_id: String) -> Result<Value, String> {
    connection::close_port(&app, connection_id)
}

#[tauri::command]
pub async fn serial_write(
    app: tauri::AppHandle,
    connection_id: String,
    data: Value,
) -> Result<Value, String> {
    // 在异步上下文中，将阻塞的串口写入移到 blocking 线程
    tokio::task::spawn_blocking(move || {
        io::write_data(&app, connection_id, data)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn serial_timed_send_start(
    app: tauri::AppHandle,
    connection_id: String,
    data: Vec<u8>,
    interval_ms: u64,
) -> Result<Value, String> {
    timer::start_timed_send(&app, connection_id, data, interval_ms)
}

#[tauri::command]
pub fn serial_timed_send_stop(
    app: tauri::AppHandle,
    connection_id: String,
) -> Result<Value, String> {
    timer::stop_timed_send(&app, connection_id)
}

#[tauri::command]
pub fn serial_timed_send_start_dynamic(
    app: tauri::AppHandle,
    connection_id: String,
    frames: Vec<Vec<u8>>,
    interval_ms: u64,
    timestamp_slots: Vec<timer::TimestampSlot>,
) -> Result<Value, String> {
    timer::start_dynamic_timed_send(&app, connection_id, frames, interval_ms, timestamp_slots)
}
