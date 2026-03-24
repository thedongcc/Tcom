/**
 * profile.rs
 * Profile（配置档案）管理 Commands — CRUD + 命令菜单/自动回复读写 + Session 管理。
 * 替代旧的 workspace.rs 概念，所有数据存储在 AppData/profiles/<name>/ 下。
 */
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use super::fs_utils::atomic_write_str;

// ─── 路径工具 ────────────────────────────────────────────────────────

/// 获取 profiles 根目录
fn profiles_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("profiles")
}

/// 获取指定 Profile 目录
fn profile_dir(app: &tauri::AppHandle, name: &str) -> PathBuf {
    profiles_dir(app).join(sanitize_name(name))
}

/// 获取 Profile 的 sessions 子目录
fn sessions_dir(app: &tauri::AppHandle, name: &str) -> PathBuf {
    profile_dir(app, name).join("sessions")
}

/// 清理名称中的非法字符
fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect()
}

// ─── Profile CRUD ────────────────────────────────────────────────────

/// 列出所有 Profile
#[tauri::command]
pub fn profile_list(app: tauri::AppHandle) -> Result<Value, String> {
    let dir = profiles_dir(&app);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(serde_json::json!({ "success": true, "profiles": [] }));
    }

    let mut profiles = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            // 读取 profile.json 元数据
            let meta_file = path.join("profile.json");
            let meta: Value = if meta_file.exists() {
                fs::read_to_string(&meta_file)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or(serde_json::json!({ "name": name }))
            } else {
                serde_json::json!({ "name": name })
            };
            profiles.push(meta);
        }
    }

    Ok(serde_json::json!({ "success": true, "profiles": profiles }))
}

/// 创建新 Profile
#[tauri::command]
pub fn profile_create(app: tauri::AppHandle, name: String) -> Result<Value, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Profile 名称不能为空".into());
    }

    let dir = profile_dir(&app, trimmed);
    if dir.exists() {
        return Err(format!("Profile \"{}\" 已存在", trimmed));
    }

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("sessions")).map_err(|e| e.to_string())?;

    // 创建 profile.json 元数据
    let meta = serde_json::json!({
        "name": trimmed,
        "createdAt": chrono_now_iso(),
    });
    atomic_write_str(
        &dir.join("profile.json"),
        &serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    )?;

    Ok(serde_json::json!({ "success": true, "profile": meta }))
}

/// 删除 Profile
#[tauri::command]
pub fn profile_delete(app: tauri::AppHandle, name: String) -> Result<Value, String> {
    let dir = profile_dir(&app, &name);
    if !dir.exists() {
        return Err(format!("Profile \"{}\" 不存在", name));
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

/// 重命名 Profile
#[tauri::command]
pub fn profile_rename(app: tauri::AppHandle, old_name: String, new_name: String) -> Result<Value, String> {
    let old_dir = profile_dir(&app, &old_name);
    let new_dir = profile_dir(&app, &new_name);

    if !old_dir.exists() {
        return Err(format!("Profile \"{}\" 不存在", old_name));
    }
    if new_dir.exists() {
        return Err(format!("Profile \"{}\" 已存在", new_name));
    }

    fs::rename(&old_dir, &new_dir).map_err(|e| e.to_string())?;

    // 更新 profile.json 中的 name
    let meta_file = new_dir.join("profile.json");
    if meta_file.exists() {
        if let Ok(content) = fs::read_to_string(&meta_file) {
            if let Ok(mut meta) = serde_json::from_str::<Value>(&content) {
                meta["name"] = Value::String(new_name.trim().to_string());
                let _ = atomic_write_str(&meta_file, &serde_json::to_string_pretty(&meta).unwrap_or_default());
            }
        }
    }

    Ok(serde_json::json!({ "success": true }))
}

/// 复制目录（递归）
fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let entry_path = entry.path();
        let target_path = dst.as_ref().join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir_all(&entry_path, &target_path)?;
        } else {
            fs::copy(&entry_path, &target_path)?;
        }
    }
    Ok(())
}

/// 复制 Profile
#[tauri::command]
pub fn profile_duplicate(app: tauri::AppHandle, old_name: String, new_name: String) -> Result<Value, String> {
    let old_dir = profile_dir(&app, &old_name);
    let new_dir = profile_dir(&app, &new_name);

    if !old_dir.exists() {
        return Err(format!("Profile \"{}\" 不存在", old_name));
    }
    if new_dir.exists() {
        return Err(format!("Profile \"{}\" 已存在", new_name));
    }

    copy_dir_all(&old_dir, &new_dir).map_err(|e| e.to_string())?;

    // 更新 profile.json 的名称和时间戳
    let meta_file = new_dir.join("profile.json");
    if meta_file.exists() {
        if let Ok(content) = fs::read_to_string(&meta_file) {
            if let Ok(mut meta) = serde_json::from_str::<Value>(&content) {
                meta["name"] = Value::String(new_name.trim().to_string());
                meta["createdAt"] = Value::String(chrono_now_iso());
                let _ = atomic_write_str(&meta_file, &serde_json::to_string_pretty(&meta).unwrap_or_default());
            }
        }
    }

    Ok(serde_json::json!({ "success": true }))
}

// ─── Session 管理（Profile 内） ─────────────────────────────────────

/// 列出 Profile 内的所有 Session
#[tauri::command]
pub fn profile_list_sessions(app: tauri::AppHandle, profile_name: String) -> Result<Value, String> {
    let dir = sessions_dir(&app, &profile_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<Value>(&content) {
                    if config.get("id").is_some() && config.get("type").is_some() {
                        sessions.push(config);
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "data": sessions }))
}

/// 保存 Session 到 Profile
#[tauri::command]
pub fn profile_save_session(app: tauri::AppHandle, profile_name: String, config: Value) -> Result<Value, String> {
    let dir = sessions_dir(&app, &profile_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let name = config
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("Session config 缺少 name 字段")?;

    let safe_name = sanitize_name(name);
    let file_path = dir.join(format!("{safe_name}.json"));
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;

    atomic_write_str(&file_path, &json)?;
    Ok(serde_json::json!({ "success": true, "filePath": file_path.to_string_lossy() }))
}

/// 删除 Session
#[tauri::command]
pub fn profile_delete_session(app: tauri::AppHandle, profile_name: String, config: Value) -> Result<Value, String> {
    let dir = sessions_dir(&app, &profile_name);
    let name = config
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("Session config 缺少 name 字段")?;

    let safe_name = sanitize_name(name);
    let file_path = dir.join(format!("{safe_name}.json"));
    fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

/// 重命名 Session
#[tauri::command]
pub fn profile_rename_session(
    app: tauri::AppHandle,
    profile_name: String,
    old_name: String,
    new_name: String,
) -> Result<Value, String> {
    let dir = sessions_dir(&app, &profile_name);
    let old_path = dir.join(format!("{}.json", sanitize_name(&old_name)));
    let new_path = dir.join(format!("{}.json", sanitize_name(&new_name)));
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

// ─── 命令菜单 ────────────────────────────────────────────────────────

/// 读取 Profile 的命令菜单数据
#[tauri::command]
pub fn profile_get_commands(app: tauri::AppHandle, profile_name: String) -> Result<Value, String> {
    let file = profile_dir(&app, &profile_name).join("commands.json");
    if !file.exists() {
        return Ok(serde_json::json!({ "success": true, "data": [] }));
    }
    let content = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

/// 保存 Profile 的命令菜单数据
#[tauri::command]
pub fn profile_save_commands(app: tauri::AppHandle, profile_name: String, data: Value) -> Result<Value, String> {
    let dir = profile_dir(&app, &profile_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    atomic_write_str(&dir.join("commands.json"), &json)?;
    Ok(serde_json::json!({ "success": true }))
}

// ─── 自动回复 ────────────────────────────────────────────────────────

/// 读取 Profile 的自动回复规则
#[tauri::command]
pub fn profile_get_auto_reply(app: tauri::AppHandle, profile_name: String) -> Result<Value, String> {
    let file = profile_dir(&app, &profile_name).join("auto-reply.json");
    if !file.exists() {
        return Ok(serde_json::json!({
            "success": true,
            "data": { "enabled": false, "rules": [], "targetSessionIds": [] }
        }));
    }
    let content = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

/// 保存 Profile 的自动回复规则
#[tauri::command]
pub fn profile_save_auto_reply(app: tauri::AppHandle, profile_name: String, data: Value) -> Result<Value, String> {
    let dir = profile_dir(&app, &profile_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    atomic_write_str(&dir.join("auto-reply.json"), &json)?;
    Ok(serde_json::json!({ "success": true }))
}

// ─── 工具函数 ────────────────────────────────────────────────────────

/// 简易 ISO 时间戳（不依赖 chrono crate）
fn chrono_now_iso() -> String {
    use std::time::SystemTime;
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // 返回 Unix 时间戳作为创建时间（前端可自行格式化）
    format!("{}", secs)
}
