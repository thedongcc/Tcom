/**
 * workspace.rs
 * 工作区管理 Commands — JSON 会话文件 CRUD + 路径安全校验。
 * 从 Electron 的 workspace.ipc.ts 转写。
 */
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// 获取工作区状态文件路径
fn workspace_state_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("workspace.json")
}

/// 获取默认工作区路径
fn default_workspace_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("DefaultWorkspace")
}

/// 获取旧版 sessions 文件路径
fn old_sessions_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("sessions.json")
}

/// 路径安全校验：防止路径遍历攻击
fn validate_path(input: &str) -> Result<PathBuf, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Invalid workspace path: must be a non-empty string".into());
    }

    // 拦截包含路径遍历序列的输入
    let normalized = trimmed.replace('\\', "/");
    if normalized.split('/').any(|part| part == "..") {
        return Err("Access denied: path traversal sequences are not allowed".into());
    }

    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("Invalid workspace path: must be an absolute path".into());
    }

    Ok(path)
}

/// 清理文件名中的非法字符
fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect()
}

/// 读取工作区状态 JSON
fn read_workspace_state(state_file: &Path) -> Value {
    fs::read_to_string(state_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({ "lastWorkspace": null, "recentWorkspaces": [] }))
}

#[tauri::command]
pub fn workspace_get_last(app: tauri::AppHandle) -> Result<Value, String> {
    let state = read_workspace_state(&workspace_state_path(&app));
    let path = state.get("lastWorkspace").cloned().unwrap_or(Value::Null);
    Ok(serde_json::json!({ "success": true, "path": path }))
}

#[tauri::command]
pub fn workspace_get_recent(app: tauri::AppHandle) -> Result<Value, String> {
    let state = read_workspace_state(&workspace_state_path(&app));
    let workspaces = state.get("recentWorkspaces").cloned().unwrap_or(serde_json::json!([]));
    Ok(serde_json::json!({ "success": true, "workspaces": workspaces }))
}

#[tauri::command]
pub fn workspace_set_last(app: tauri::AppHandle, ws_path: Value) -> Result<Value, String> {
    let state_file = workspace_state_path(&app);

    // 确保父目录存在
    if let Some(parent) = state_file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut state = read_workspace_state(&state_file);

    match ws_path {
        Value::String(ref p) if !p.is_empty() => {
            state["lastWorkspace"] = ws_path.clone();
            // 更新最近列表
            let mut recent: Vec<String> = state
                .get("recentWorkspaces")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            recent.retain(|x| x != p);
            recent.insert(0, p.clone());
            recent.truncate(10);
            state["recentWorkspaces"] = serde_json::json!(recent);
        }
        _ => {
            state["lastWorkspace"] = Value::Null;
        }
    }

    fs::write(&state_file, serde_json::to_string_pretty(&state).unwrap())
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn workspace_open_folder(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    // 使用阻塞式目录选择对话框
    let result = app.dialog().file().blocking_pick_folder();
    match result {
        Some(path) => Ok(serde_json::json!({
            "success": true,
            "path": path.to_string()
        })),
        None => Ok(serde_json::json!({ "success": false, "canceled": true })),
    }
}

#[tauri::command]
pub fn workspace_list_sessions(ws_path: String) -> Result<Value, String> {
    let dir = validate_path(&ws_path)?;

    // 确保目录存在
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<Value>(&content) {
                    // 只返回包含 id 和 type 的合法会话配置
                    if config.get("id").is_some() && config.get("type").is_some() {
                        sessions.push(config);
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "data": sessions }))
}

#[tauri::command]
pub fn workspace_save_session(ws_path: String, config: Value) -> Result<Value, String> {
    let dir = validate_path(&ws_path)?;

    let name = config
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("Invalid session config: missing or invalid name field")?;

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_name(name);
    let file_path = dir.join(format!("{safe_name}.json"));
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;

    fs::write(&file_path, json).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "filePath": file_path.to_string_lossy() }))
}

#[tauri::command]
pub fn workspace_delete_session(ws_path: String, config: Value) -> Result<Value, String> {
    let dir = validate_path(&ws_path)?;

    let name = config
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("Invalid session config: missing or invalid name field")?;

    let safe_name = sanitize_name(name);
    let file_path = dir.join(format!("{safe_name}.json"));
    fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn workspace_rename_session(ws_path: String, old_name: String, new_name: String) -> Result<Value, String> {
    let dir = validate_path(&ws_path)?;

    if old_name.trim().is_empty() || new_name.trim().is_empty() {
        return Err("Invalid parameter: names must be non-empty strings".into());
    }

    let safe_old = sanitize_name(old_name.trim());
    let safe_new = sanitize_name(new_name.trim());

    let old_path = dir.join(format!("{safe_old}.json"));
    let new_path = dir.join(format!("{safe_new}.json"));

    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn workspace_migrate_old(app: tauri::AppHandle) -> Result<Value, String> {
    let old_file = old_sessions_path(&app);
    let default_ws = default_workspace_path(&app);

    let data = match fs::read_to_string(&old_file) {
        Ok(d) => d,
        Err(_) => return Ok(serde_json::json!({ "success": false, "migrated": 0 })),
    };

    let sessions: Vec<Value> = match serde_json::from_str(&data) {
        Ok(s) => s,
        Err(_) => return Ok(serde_json::json!({ "success": false, "migrated": 0 })),
    };

    if sessions.is_empty() {
        return Ok(serde_json::json!({ "success": false, "migrated": 0 }));
    }

    fs::create_dir_all(&default_ws).map_err(|e| e.to_string())?;

    let mut migrated = 0;
    for config in &sessions {
        if let Some(name) = config.get("name").and_then(|v| v.as_str()) {
            let safe_name = sanitize_name(name);
            let file_path = default_ws.join(format!("{safe_name}.json"));
            if let Ok(json) = serde_json::to_string_pretty(config) {
                if fs::write(&file_path, json).is_ok() {
                    migrated += 1;
                }
            }
        }
    }

    // 备份旧文件
    let backup = format!("{}.bak", old_file.display());
    let _ = fs::rename(&old_file, &backup);

    Ok(serde_json::json!({
        "success": true,
        "migrated": migrated,
        "path": default_ws.to_string_lossy()
    }))
}

#[tauri::command]
pub fn workspace_save_session_order(ws_path: String, _order: Vec<String>) -> Result<Value, String> {
    let _dir = validate_path(&ws_path)?;
    // 会话顺序目前仅在前端管理，这里只做校验
    Ok(serde_json::json!({ "success": true }))
}

// ─── 旧版会话 API（兼容占位） ──────────────────────────────────────────────

#[tauri::command]
pub fn session_save(_sessions: Value) -> Result<Value, String> {
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn session_load() -> Result<Value, String> {
    Ok(serde_json::json!({ "success": true, "data": [] }))
}
