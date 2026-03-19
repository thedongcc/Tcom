/**
 * window.rs
 * 窗口管理 Command — 置顶控制。
 */
use serde_json::Value;

#[tauri::command]
pub fn window_set_always_on_top(window: tauri::Window, flag: bool) -> Result<Value, String> {
    window.set_always_on_top(flag).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "alwaysOnTop": flag }))
}

#[tauri::command]
pub fn window_is_always_on_top(window: tauri::Window) -> Result<Value, String> {
    let on_top = window.is_always_on_top().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "alwaysOnTop": on_top }))
}
