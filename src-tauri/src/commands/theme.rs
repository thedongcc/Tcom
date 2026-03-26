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
fn theme_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(crate::commands::fs_utils::get_app_data_dir(app)?.join("themes"))
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
    let dir = theme_dir(&app)?;
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

// ─── 迷你窗口取色器：无截图，实时采样 ──────────────────────────────

/// 从屏幕抓取光标周围 size×size 像素，返回 BGR→RGB 转换后的原始字节。
/// 使用 GDI BitBlt + GetDIBits，仅访问极小区域，延迟 < 1ms。
#[cfg(target_os = "windows")]
fn capture_cursor_area(size: i32) -> Option<(i32, i32, Vec<u8>)> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) == 0 {
            return None;
        }
        let cx = pt.x;
        let cy = pt.y;

        let screen_dc = GetDC(std::ptr::null_mut());
        if screen_dc.is_null() {
            return None;
        }
        let mem_dc = CreateCompatibleDC(screen_dc);
        if mem_dc.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return None;
        }
        let bmp = CreateCompatibleBitmap(screen_dc, size, size);
        if bmp.is_null() {
            DeleteDC(mem_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return None;
        }
        SelectObject(mem_dc, bmp as _);

        let left = cx - size / 2;
        let top  = cy - size / 2;
        BitBlt(mem_dc, 0, 0, size, size, screen_dc, left, top, SRCCOPY);

        // 每行 4 字节对齐（BGR24）
        let stride = ((size * 3 + 3) & !3) as usize;
        let mut raw = vec![0u8; stride * size as usize];

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: size,
                biHeight: -size, // top-down
                biPlanes: 1,
                biBitCount: 24,
                biCompression: BI_RGB,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [std::mem::zeroed()],
        };
        GetDIBits(mem_dc, bmp, 0, size as u32, raw.as_mut_ptr() as _, &mut bmi, DIB_RGB_COLORS);

        DeleteObject(bmp as _);
        DeleteDC(mem_dc);
        ReleaseDC(std::ptr::null_mut(), screen_dc);

        // BGR24 → RGB 并去除行末填充
        let mut rgb = Vec::with_capacity((size * size * 3) as usize);
        for row in 0..size as usize {
            let row_start = row * stride;
            for col in 0..size as usize {
                let px = row_start + col * 3;
                rgb.push(raw[px + 2]); // R
                rgb.push(raw[px + 1]); // G
                rgb.push(raw[px]);     // B
            }
        }
        Some((cx, cy, rgb))
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_cursor_area(_size: i32) -> Option<(i32, i32, Vec<u8>)> {
    None
}

/// 移动系统光标（相对偏移，单位：逻辑像素）
#[tauri::command]
pub fn cursor_move(dx: i32, dy: i32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, SetCursorPos};
        let mut pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut pt);
        SetCursorPos(pt.x + dx, pt.y + dy);
    }
    Ok(())
}

/// 开启原生独立悬浮颜色选择器
/// build() 需要主线程事件循环可用。使用 async 命令避免阻塞 IPC。
#[tauri::command]
pub async fn color_picker_open(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
) -> Result<(), String> {
    use tauri::{Manager, WebviewUrl, Position, LogicalPosition};

    // 检查是否已有窗口
    if let Some(win) = app.get_webview_window("color-picker-popover") {
        let _ = win.set_position(Position::Logical(LogicalPosition::new(x, y)));
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }


    let win = tauri::WebviewWindowBuilder::new(
        &app,
        "color-picker-popover",
        WebviewUrl::App("index.html".into()),
    )
    .inner_size(248.0, 284.0)
    .min_inner_size(248.0, 284.0)
    .max_inner_size(500.0, 284.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false)
    .position(x, y)
    .build()
    .map_err(|e| { log::error!("[color_picker_open] 创建失败: {e}"); e.to_string() })?;


    let _ = win.set_position(Position::Logical(LogicalPosition::new(x, y)));
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

/// 关闭颜色选择器并销毁窗口实例（不 hide，确保 WebView2 实例被释放）
#[tauri::command]
pub fn color_picker_close(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    // 通知主题编辑器清理 change/closed 监听器（防止多次 open/close 后监听器积累）
    let _ = app.emit("color_picker:closed", serde_json::Value::Null);
    if let Some(win) = app.get_webview_window("color-picker-popover") {
        let _ = win.close(); // 真正关闭销毁，而非仅隐藏
    }
    let _ = eyedropper_mini_close();
    Ok(())
}

/// 开启后台高频像素采样线程，由前端浮层处理渲染
#[tauri::command]
pub fn eyedropper_mini_open(app: tauri::AppHandle) -> Result<Value, String> {
    use std::sync::atomic::Ordering;

    // 防止重复开启
    if EYEDROPPER_ACTIVE.load(Ordering::SeqCst) {
        return Ok(serde_json::json!({ "success": true }));
    }
    EYEDROPPER_ACTIVE.store(true, Ordering::SeqCst);



    // 启动高频采样线程（32ms ≈ 30fps）
    let app_clone = app.clone();
    std::thread::spawn(move || {
        use base64::Engine;
        let mut last_hex = String::new();

        while EYEDROPPER_ACTIVE.load(Ordering::SeqCst) {
            if let Some((_, _, rgb)) = capture_cursor_area(20) {

                let center = (10 * 20 + 10) * 3;
                if center + 2 < rgb.len() {
                    let hex = format!("#{:02X}{:02X}{:02X}", rgb[center], rgb[center + 1], rgb[center + 2]);
                    if hex != last_hex {
                        last_hex = hex.clone();
                        let _ = app_clone.emit("eyedropper:color", &hex);
                    }
                }
                // 将 20×20 原始 RGB 发给悬浮窗（base64 编码）
                let b64 = base64::engine::general_purpose::STANDARD.encode(&rgb);
                let _ = app_clone.emit("eyedropper:pixels", &b64);
            }
            std::thread::sleep(std::time::Duration::from_millis(32));
        }
    });

    Ok(serde_json::json!({ "success": true }))
}

/// 关闭拾色器状态
#[tauri::command]
pub fn eyedropper_mini_close() -> Result<(), String> {
    use std::sync::atomic::Ordering;
    EYEDROPPER_ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}

/// 确认取色
#[tauri::command]
pub fn eyedropper_confirm(app: tauri::AppHandle, color: String) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    EYEDROPPER_ACTIVE.store(false, Ordering::SeqCst);
    // 全部窗口发通知
    let _ = app.emit("eyedropper:picked", &color);
    Ok(())
}

/// 取消取色
#[tauri::command]
pub fn eyedropper_cancel(app: tauri::AppHandle) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    EYEDROPPER_ACTIVE.store(false, Ordering::SeqCst);
    let _ = app.emit("eyedropper:canceled", serde_json::Value::Null);
    Ok(())
}

/// 停止所有后台线程，供 APP 退出时调用
#[allow(dead_code)]
pub fn stop_threads() {
    use std::sync::atomic::Ordering;
    EYEDROPPER_ACTIVE.store(false, Ordering::SeqCst);
}
