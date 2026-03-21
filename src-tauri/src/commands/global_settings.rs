/**
 * global_settings.rs
 * 全局设置管理 Commands — 主题/字体/语言/快捷键等用户偏好读写。
 * 数据存储在 AppData/settings.json。
 */
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use super::fs_utils::atomic_write_str;

/// 全局设置文件路径
fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("settings.json")
}

/// 运行时状态文件路径（窗口位置、最近 Profile 等）
fn state_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("state.json")
}

/// 读取全局设置
#[tauri::command]
pub fn global_settings_load(app: tauri::AppHandle) -> Result<Value, String> {
    let file = settings_path(&app);
    if !file.exists() {
        return Ok(serde_json::json!({ "success": true, "data": null }));
    }
    let content = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

/// 保存全局设置
#[tauri::command]
pub fn global_settings_save(app: tauri::AppHandle, data: Value) -> Result<Value, String> {
    let file = settings_path(&app);
    // 确保父目录存在
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    atomic_write_str(&file, &json)?;
    Ok(serde_json::json!({ "success": true }))
}

/// 读取运行时状态（窗口位置、最近 Profile 等）
#[tauri::command]
pub fn app_state_load(app: tauri::AppHandle) -> Result<Value, String> {
    let file = state_path(&app);
    if !file.exists() {
        return Ok(serde_json::json!({
            "success": true,
            "data": {
                "lastProfile": "default",
                "recentProfiles": [],
                "migrated": false,
                "windowState": null
            }
        }));
    }
    let content = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

/// 保存运行时状态
#[tauri::command]
pub fn app_state_save(app: tauri::AppHandle, data: Value) -> Result<Value, String> {
    let file = state_path(&app);
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    atomic_write_str(&file, &json)?;
    Ok(serde_json::json!({ "success": true }))
}
