/**
 * window.rs
 * 窗口管理 Command — 置顶控制 + 背景色同步 + 开发者工具。
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

/// 设置窗口背景色（匹配当前主题，避免 resize 时闪烁）
#[tauri::command]
pub fn window_set_bg_color(window: tauri::Window, color: String) -> Result<Value, String> {
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::Graphics::Gdi::CreateSolidBrush;

        extern "system" {
            fn SetClassLongPtrW(hwnd: HWND, index: i32, new_long: isize) -> isize;
            fn DeleteObject(obj: *mut c_void) -> i32;
        }
        const GCLP_HBRBACKGROUND: i32 = -10;

        // 解析 hex 色值（支持 #RRGGBB 和 RRGGBB）
        let hex = color.trim_start_matches('#');
        if hex.len() != 6 {
            return Err("color 格式错误，需要 #RRGGBB".into());
        }
        let r = u8::from_str_radix(&hex[0..2], 16).map_err(|e| e.to_string())?;
        let g = u8::from_str_radix(&hex[2..4], 16).map_err(|e| e.to_string())?;
        let b = u8::from_str_radix(&hex[4..6], 16).map_err(|e| e.to_string())?;

        // Win32 COLORREF 是 BGR 格式
        let colorref = (b as u32) << 16 | (g as u32) << 8 | (r as u32);

        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as HWND;
        unsafe {
            let new_brush = CreateSolidBrush(colorref);
            let old_brush = SetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND, new_brush as isize);
            if old_brush != 0 {
                DeleteObject(old_brush as *mut c_void);
            }
        }
    }
    Ok(serde_json::json!({ "success": true }))
}

/// 打开 WebView2 开发者工具（在 devtools feature 启用时生效，release 版本同样可用）
#[tauri::command]
pub fn window_open_devtools(window: tauri::WebviewWindow) -> Result<Value, String> {
    window.open_devtools();
    Ok(serde_json::json!({ "success": true }))
}
