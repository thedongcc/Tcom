/**
 * updater.rs
 * 应用更新 Command — 检查/下载/安装（占位实现）。
 */
use serde_json::Value;

#[tauri::command]
pub fn update_check() -> Result<Value, String> {
    Ok(serde_json::json!({ "updateAvailable": false }))
}

#[tauri::command]
pub fn update_download() -> Result<Value, String> {
    Err("更新功能尚未实现".into())
}

#[tauri::command]
pub fn update_install() -> Result<(), String> {
    Err("更新功能尚未实现".into())
}
