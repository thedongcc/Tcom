/**
 * theme.rs
 * 主题管理 Commands — 主题文件加载/保存 + 编辑器状态管理。
 * 从 Electron 的 theme.ipc.ts 转写。
 */
use serde_json::Value;
use std::fs;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;

/// 主题编辑器的内存状态（跨 Command 共享）
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

/// 获取主题目录路径
fn theme_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap().join("themes")
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
    let dir = theme_dir(&app);
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
                        themes.push(serde_json::json!({
                            "id": base_name,
                            "name": base_name,
                            "type": parsed.get("type").and_then(|v| v.as_str()).unwrap_or("dark"),
                            "colors": parsed["colors"]
                        }));
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "themes": themes }))
}

#[tauri::command]
pub fn theme_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = theme_dir(&app);
    ensure_theme_files(&dir)?;
    // 使用系统文件管理器打开目录
    open::that(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn theme_open_file(app: tauri::AppHandle, theme_id: String) -> Result<(), String> {
    let dir = theme_dir(&app);
    let file_path = dir.join(format!("{theme_id}.json"));
    if file_path.exists() {
        open::that(&file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn theme_editor_open(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
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
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("theme-editor") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn theme_editor_is_open(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    Ok(app.get_webview_window("theme-editor").is_some())
}

#[tauri::command]
pub fn theme_editor_save(app: tauri::AppHandle, id: String, theme_def: Value) -> Result<Value, String> {
    let dir = theme_dir(&app);
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
pub fn theme_editor_set_pending(app: tauri::AppHandle, theme_id: String, edits: Value) -> Result<(), String> {
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
pub fn theme_editor_set_expanded_groups(app: tauri::AppHandle, groups: Value) -> Result<(), String> {
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

// ─── 取色器 Commands ──────────────────────────────────────────────────

/// 取色器全局状态
static EYEDROPPER_ACTIVE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// 获取光标位置处的像素颜色（返回 #RRGGBB）
#[cfg(target_os = "windows")]
fn get_pixel_at_cursor() -> Option<String> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) == 0 {
            return None;
        }
        // 传 null 表示获取整个屏幕的 DC
        let hdc = GetDC(std::ptr::null_mut());
        if hdc.is_null() {
            return None;
        }
        let color = GetPixel(hdc, pt.x, pt.y);
        ReleaseDC(std::ptr::null_mut(), hdc);

        if color == 0xFFFFFFFF {
            return None; // CLR_INVALID
        }

        // GetPixel 返回 0x00BBGGRR 格式
        let r = color & 0xFF;
        let g = (color >> 8) & 0xFF;
        let b = (color >> 16) & 0xFF;
        Some(format!("#{:02x}{:02x}{:02x}", r, g, b))
    }
}

#[tauri::command]
pub fn eyedropper_pick() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        match get_pixel_at_cursor() {
            Some(color) => Ok(serde_json::json!({ "success": true, "color": color })),
            None => Err("Failed to pick color".into()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Eyedropper is only available on Windows".into())
    }
}

#[tauri::command]
pub fn eyedropper_watch_start(app: tauri::AppHandle) -> Result<Value, String> {
    use std::sync::atomic::Ordering;

    // 如果已在运行，直接返回
    if EYEDROPPER_ACTIVE.load(Ordering::SeqCst) {
        return Ok(serde_json::json!({ "success": true }));
    }

    EYEDROPPER_ACTIVE.store(true, Ordering::SeqCst);

    #[cfg(target_os = "windows")]
    {
        std::thread::spawn(move || {
            let mut last_color = String::new();
            while EYEDROPPER_ACTIVE.load(Ordering::SeqCst) {
                if let Some(color) = get_pixel_at_cursor() {
                    if color != last_color {
                        last_color = color.clone();
                        let _ = app.emit("eyedropper:color", color);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        EYEDROPPER_ACTIVE.store(false, Ordering::SeqCst);
        return Err("Eyedropper is only available on Windows".into());
    }

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn eyedropper_watch_stop() -> Result<Value, String> {
    EYEDROPPER_ACTIVE.store(false, std::sync::atomic::Ordering::SeqCst);
    Ok(serde_json::json!({ "success": true }))
}
