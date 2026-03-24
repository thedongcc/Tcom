/**
 * monitor/mod.rs
 * 虚拟串口监控 Commands 门面层 — 端口桥接、数据转发、高精度定时发送。
 *
 * 子模块：
 * - state.rs — 核心状态、会话结构体和事件类型
 * - bridge.rs — 双向数据桥接（四线程读写 + 轮询检测）
 * - timer.rs — 高精度自旋定时器
 */
pub mod state;
mod bridge;
mod timer;

// 重新导出 MonitorState 供 lib.rs 使用
pub use state::MonitorState;

use serde_json::Value;
use tauri::Manager;

// ─── Tauri Command 入口（签名不变、仅委托子模块） ──────────────────────

#[tauri::command]
pub fn monitor_start(
    app: tauri::AppHandle,
    session_id: String,
    config: Value,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();
    bridge::start_monitor(&app, &state, session_id, config)
}

#[tauri::command]
pub fn monitor_stop(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();
    bridge::stop_monitor(&app, &state, session_id)
}

#[tauri::command]
pub async fn monitor_write(
    app: tauri::AppHandle,
    session_id: String,
    target: String,
    data: Value,
) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        bridge::write_data(&app, session_id, target, data)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn monitor_start_timed_send(
    app: tauri::AppHandle,
    session_id: String,
    target: String,
    data: Value,
    interval_ms: u64,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();
    timer::start_timed_send(&app, &state, session_id, target, data, interval_ms)
}

#[tauri::command]
pub fn monitor_stop_timed_send(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<Value, String> {
    let state = app.state::<MonitorState>();
    timer::stop_timed_send(&state, session_id)
}
