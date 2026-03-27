/**
 * theme_editor.rs
 * 主题编辑器 Commands — pending 编辑缓存管理 + 编辑器窗口控制。
 * 从 theme.rs 拆分。ThemeEditorState 仍定义在 theme.rs 中。
 */
use serde_json::Value;
use tauri::{Emitter, Manager};

use super::theme::ThemeEditorState;

#[tauri::command]
pub fn theme_editor_open(app: tauri::AppHandle) -> Result<(), String> {
    // 如果窗口已存在，聚焦
    if let Some(win) = app.get_webview_window("theme-editor") {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    // 创建独立主题编辑器窗口（加载主应用，前端通过窗口标签判断渲染内容）
    let url = tauri::WebviewUrl::App("index.html".into());
    tauri::WebviewWindowBuilder::new(&app, "theme-editor", url)
        .title("主题颜色编辑器")
        .inner_size(360.0, 700.0)
        .min_inner_size(300.0, 400.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn theme_editor_close(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("theme-editor") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn theme_editor_is_open(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(app.get_webview_window("theme-editor").is_some())
}

#[tauri::command]
pub fn theme_editor_save(app: tauri::AppHandle, id: String, theme_def: Value) -> Result<Value, String> {
    use std::fs;

    let dir = super::theme::theme_dir_pub(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let file_path = dir.join(format!("{id}.json"));
    let json = serde_json::to_string_pretty(&theme_def).map_err(|e| e.to_string())?;
    fs::write(&file_path, json).map_err(|e| e.to_string())?;

    // 清除该主题的 pending edits
    if let Some(state) = app.try_state::<ThemeEditorState>() {
        if let Ok(mut edits) = state.pending_edits.lock() {
            edits.remove(&id);
        }
    }

    // 通知前端刷新主题
    let _ = app.emit("theme:reload", ());

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn theme_editor_preview(_edits: Value) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub fn theme_editor_get_pending(app: tauri::AppHandle, theme_id: String) -> Result<Value, String> {
    let state = app.state::<ThemeEditorState>();
    let edits = state.pending_edits.lock().map_err(|e| e.to_string())?;
    Ok(edits.get(&theme_id).cloned().unwrap_or(Value::Null))
}

#[tauri::command]
pub fn theme_editor_get_all_pending(app: tauri::AppHandle) -> Result<Value, String> {
    let state = app.state::<ThemeEditorState>();
    let edits = state.pending_edits.lock().map_err(|e| e.to_string())?;
    Ok(Value::Object(edits.clone()))
}

#[tauri::command]
pub fn theme_editor_clear_all_pending(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<ThemeEditorState>();
    let mut edits = state.pending_edits.lock().map_err(|e| e.to_string())?;
    edits.clear();
    Ok(())
}

#[tauri::command]
pub fn theme_editor_set_pending(
    app: tauri::AppHandle,
    theme_id: String,
    edits: Value,
) -> Result<(), String> {
    let state = app.state::<ThemeEditorState>();
    let mut map = state.pending_edits.lock().map_err(|e| e.to_string())?;
    if edits.is_null() {
        map.remove(&theme_id);
    } else {
        map.insert(theme_id, edits);
    }
    Ok(())
}

#[tauri::command]
pub fn theme_editor_start_inspector() -> Result<(), String> { Ok(()) }

#[tauri::command]
pub fn theme_editor_stop_inspector() -> Result<(), String> { Ok(()) }

#[tauri::command]
pub fn theme_editor_component_picked(_data: Value) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub fn theme_editor_get_expanded_groups(app: tauri::AppHandle) -> Result<Value, String> {
    let state = app.state::<ThemeEditorState>();
    let groups = state.expanded_groups.lock().map_err(|e| e.to_string())?;
    Ok(Value::Object(groups.clone()))
}

#[tauri::command]
pub fn theme_editor_set_expanded_groups(
    app: tauri::AppHandle,
    groups: Value,
) -> Result<(), String> {
    let state = app.state::<ThemeEditorState>();
    let mut map = state.expanded_groups.lock().map_err(|e| e.to_string())?;
    if let Value::Object(obj) = groups {
        *map = obj;
    }
    Ok(())
}

#[tauri::command]
pub fn theme_editor_init_data(app: tauri::AppHandle) -> Result<Value, String> {
    let state = app.state::<ThemeEditorState>();
    let edits = state.pending_edits.lock().map_err(|e| e.to_string())?;
    let groups = state.expanded_groups.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "pendingEdits": Value::Object(edits.clone()),
        "expandedGroups": Value::Object(groups.clone()),
    }))
}
