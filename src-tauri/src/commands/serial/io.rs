/**
 * io.rs
 * 串口数据写入逻辑。
 */
use serde_json::Value;
use std::io::Write;
use tauri::Manager;

use super::state::{lock_err, SerialState};

/// 向已打开的串口写入数据
pub fn write_data(
    app: &tauri::AppHandle,
    connection_id: String,
    data: Value,
) -> Result<Value, String> {
    let state = app.state::<SerialState>();

    // 将 data 转为 Vec<u8>（在获取锁之前处理，减少锁持有时间）
    let bytes: Vec<u8> = match &data {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.as_u64().map(|n| n as u8))
            .collect(),
        _ => return Err("Invalid data format".into()),
    };

    // 仅在查找 PortHandle 时短暂持有 ports 锁，
    // 克隆 writer Arc 后立即释放，避免阻塞其他端口操作。
    let writer = {
        let ports = state.ports.lock().map_err(lock_err)?;
        let handle = ports.get(&connection_id).ok_or("Port not open")?;
        handle.writer.clone()
    }; // ← ports 锁在此释放

    // 独立获取 writer 锁，仅与同端口的定时发送竞争
    let mut port = writer.lock().map_err(lock_err)?;
    port.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "success": true }))
}
