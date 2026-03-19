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
