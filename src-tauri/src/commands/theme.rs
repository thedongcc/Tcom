/**
 * theme.rs
 * 主题管理 Commands — 主题文件加载/保存/打开 + ThemeEditorState 状态定义。
 *
 * 子模块：
 * - theme_editor.rs — 主题编辑器 pending/expanded 缓存 + 窗口控制 Commands
 * - eyedropper.rs   — 取色器、迷你取色器、color_picker 窗口 Commands
 */
use serde_json::Value;
use std::fs;
use std::sync::Mutex;

/// 主题编辑器的内存状态（跨 Command 共享，由 theme_editor.rs 使用）
pub struct ThemeEditorState {
    pub pending_edits: Mutex<serde_json::Map<String, Value>>,
    pub expanded_groups: Mutex<serde_json::Map<String, Value>>,
}

impl Default for ThemeEditorState {
    fn default() -> Self {
        Self {
            pending_edits: Mutex::new(serde_json::Map::new()),
            expanded_groups: Mutex::new(serde_json::Map::new()),
        }
    }
}

/// 获取主题目录路径（内部使用）
fn theme_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(crate::commands::fs_utils::get_app_data_dir(app)?.join("themes"))
}

/// 获取主题目录路径（对子模块公开）
pub fn theme_dir_pub(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    theme_dir(app)
}

/// 确保默认主题文件存在（首次启动时创建）
fn ensure_theme_files(dir: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    // 嵌入完整配色 JSON（编译时从文件读取）
    static DEFAULT_DARK: &str = include_str!("../../default-dark.json");
    static DEFAULT_LIGHT: &str = include_str!("../../default-light.json");
    static DEFAULT_MONO: &str = include_str!("../../default-mono.json");
    static DEFAULT_PIC: &str = include_str!("../../default-pic.json");

    let defaults = [
        ("dark.json", DEFAULT_DARK),
        ("light.json", DEFAULT_LIGHT),
        ("mono.json", DEFAULT_MONO),
        ("pic.json", DEFAULT_PIC),
    ];

    for (filename, content) in defaults {
        let path = dir.join(filename);
        // 强制覆盖内置主题（尤其是 pic.json），以确保新增的透明度变量能应用到用户本地配置
        fs::write(&path, content).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn theme_load_all(app: tauri::AppHandle) -> Result<Value, String> {
    let dir = theme_dir(&app)?;
    ensure_theme_files(&dir)?;

    let mut themes = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                // 移除注释后解析
                let cleaned = content
                    .lines()
                    .map(|line| {
                        if let Some(pos) = line.find("//") {
                            &line[..pos]
                        } else {
                            line
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n");

                if let Ok(parsed) = serde_json::from_str::<Value>(&cleaned) {
                    if parsed.get("colors").is_some() {
                        let base_name = path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown");
                        // name: JSON 内有则使用，否则 fallback 到文件名
                        let display_name = parsed.get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or(base_name);
                        // 图片主题判断：字段 image:true 或旧格式 type:"image"
                        let is_image = parsed.get("image")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                            || parsed.get("type")
                            .and_then(|v| v.as_str())
                            .map(|t| t == "image")
                            .unwrap_or(false);
                        let mut obj = serde_json::json!({
                            "id": base_name,
                            "name": display_name,
                            "colors": parsed["colors"]
                        });
                        if is_image {
                            obj["image"] = serde_json::Value::Bool(true);
                        }
                        themes.push(obj);
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "themes": themes }))
}

#[tauri::command]
pub fn theme_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = theme_dir(&app)?;
    ensure_theme_files(&dir)?;
    // 使用系统文件管理器打开目录
    open::that(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn theme_open_file(app: tauri::AppHandle, theme_id: String) -> Result<(), String> {
    let dir = theme_dir(&app)?;
    let file_path = dir.join(format!("{theme_id}.json"));
    if file_path.exists() {
        open::that(&file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
