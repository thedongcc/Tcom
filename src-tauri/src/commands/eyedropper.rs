/**
 * eyedropper.rs
 * 取色器 Commands — 屏幕像素采样、迷你悬浮取色器、ColorPicker 窗口管理。
 * 从 theme.rs 拆分。
 */
use serde_json::Value;
use tauri::Emitter;

/// 取色器后台线程运行标志（全局单例）
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
