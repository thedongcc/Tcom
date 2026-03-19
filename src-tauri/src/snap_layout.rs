/**
 * snap_layout.rs
 * Windows 11 Aero Snap Layout 支持 + 悬浮高亮 + 拖拽优化。
 *
 * 功能：
 * 1. 最大化按钮覆盖窗口 (46×30px) → HTMAXBUTTON 触发 Snap Layout
 * 2. WM_ENTERSIZEMOVE/WM_EXITSIZEMOVE → 拖拽期间减少 WebView2 渲染开销
 */

#[cfg(windows)]
mod inner {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
    use std::sync::Mutex;
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Graphics::Gdi::CreateSolidBrush;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    // DWM API
    extern "system" {
        fn DwmSetWindowAttribute(hwnd: HWND, attr: u32, val: *const c_void, sz: u32) -> i32;
    }
    const DWMWA_TRANSITIONS_FORCEDISABLED: u32 = 3;

    // SetClassLongPtrW 未在 windows-sys feature 中启用，手动声明
    extern "system" {
        fn SetClassLongPtrW(hwnd: HWND, index: i32, new_long: isize) -> isize;
    }
    const GCLP_HBRBACKGROUND: i32 = -10;

    static PARENT_ORIG: AtomicPtr<c_void> = AtomicPtr::new(core::ptr::null_mut());
    static OVERLAY_HWND: AtomicPtr<c_void> = AtomicPtr::new(core::ptr::null_mut());
    static IS_HOVERING: AtomicBool = AtomicBool::new(false);
    static APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);

    const TITLEBAR_H: i32 = 30;
    const BTN_W: i32 = 46;
    const HOVER_TIMER_ID: usize = 1001;

    // 自定义消息
    const WM_MAXBTN_HOVER: u32 = WM_APP + 1;
    const WM_MAXBTN_LEAVE: u32 = WM_APP + 2;

    // ─── 微型覆盖窗口过程（最大化按钮）─────────────────────

    unsafe extern "system" fn overlay_wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_NCHITTEST {
            return HTMAXBUTTON as LRESULT;
        }

        // 悬浮检测
        if msg == WM_NCMOUSEMOVE {
            if !IS_HOVERING.swap(true, Ordering::Relaxed) {
                let parent = GetParent(hwnd);
                PostMessageW(parent, WM_MAXBTN_HOVER, 0, 0);
                SetTimer(hwnd, HOVER_TIMER_ID, 50, None);
            }
            return 0;
        }

        // 定时器：检测鼠标离开
        if msg == WM_TIMER && wparam == HOVER_TIMER_ID {
            let mut pt: POINT = core::mem::zeroed();
            GetCursorPos(&mut pt);
            let mut rect: RECT = core::mem::zeroed();
            GetWindowRect(hwnd, &mut rect);

            if pt.x < rect.left || pt.x >= rect.right
                || pt.y < rect.top || pt.y >= rect.bottom
            {
                IS_HOVERING.store(false, Ordering::Relaxed);
                let parent = GetParent(hwnd);
                PostMessageW(parent, WM_MAXBTN_LEAVE, 0, 0);
                KillTimer(hwnd, HOVER_TIMER_ID);
            }
            return 0;
        }

        // 点击最大化按钮
        if msg == WM_NCLBUTTONDOWN {
            let parent = GetParent(hwnd);
            if !parent.is_null() {
                if IsZoomed(parent) != 0 {
                    ShowWindow(parent, SW_RESTORE);
                } else {
                    ShowWindow(parent, SW_MAXIMIZE);
                }
            }
            return 0;
        }

        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    // ─── 父窗口过程 ──────────────────────────────────────────

    unsafe extern "system" fn parent_wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_SIZE && wparam != SIZE_MINIMIZED as WPARAM {
            update_overlay_pos(hwnd);
        }

        // 阻止系统擦除背景（减少 resize 时白色闪烁）
        if msg == WM_ERASEBKGND {
            return 1;
        }

        // 拖拽/resize 开始 → 禁用 DWM 动画过渡，减少渲染开销
        if msg == WM_ENTERSIZEMOVE {
            let val: BOOL = 1;
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &val as *const _ as *const c_void,
                core::mem::size_of::<BOOL>() as u32,
            );
        }

        // 拖拽/resize 结束 → 恢复 DWM 动画过渡
        if msg == WM_EXITSIZEMOVE {
            let val: BOOL = 0;
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &val as *const _ as *const c_void,
                core::mem::size_of::<BOOL>() as u32,
            );
        }

        // 最大化按钮悬浮 → emit 到前端
        if msg == WM_MAXBTN_HOVER {
            if let Ok(guard) = APP_HANDLE.lock() {
                if let Some(handle) = guard.as_ref() {
                    use tauri::Emitter;
                    let _ = handle.emit("snap-maximize-hover", true);
                }
            }
            return 0;
        }

        // 最大化按钮离开 → emit 到前端
        if msg == WM_MAXBTN_LEAVE {
            if let Ok(guard) = APP_HANDLE.lock() {
                if let Some(handle) = guard.as_ref() {
                    use tauri::Emitter;
                    let _ = handle.emit("snap-maximize-hover", false);
                }
            }
            return 0;
        }

        if msg == WM_DESTROY {
            let overlay = OVERLAY_HWND.load(Ordering::Relaxed) as HWND;
            if !overlay.is_null() { DestroyWindow(overlay); }
        }

        let orig = PARENT_ORIG.load(Ordering::Relaxed);
        let proc: WNDPROC = core::mem::transmute(orig);
        CallWindowProcW(proc, hwnd, msg, wparam, lparam)
    }

    // ─── 覆盖窗口位置同步 ────────────────────────────────────

    unsafe fn update_overlay_pos(parent: HWND) {
        let overlay = OVERLAY_HWND.load(Ordering::Relaxed) as HWND;
        if overlay.is_null() { return; }

        let mut rect: RECT = core::mem::zeroed();
        GetClientRect(parent, &mut rect);
        let s = GetDpiForWindow(parent) as f64 / 96.0;
        let bw = (BTN_W as f64 * s) as i32;
        let th = (TITLEBAR_H as f64 * s) as i32;

        SetWindowPos(
            overlay,
            HWND_TOP as HWND,
            rect.right - bw * 2, 0, bw, th,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }

    // ─── 入口 ────────────────────────────────────────────────

    pub fn setup(hwnd: *mut c_void, app_handle: tauri::AppHandle) {
        let parent = hwnd as HWND;

        // 保存 AppHandle 供 wndproc 使用
        if let Ok(mut guard) = APP_HANDLE.lock() {
            *guard = Some(app_handle);
        }

        unsafe {
            // 确保 WS_MAXIMIZEBOX 样式（Snap Layout 需要）
            let style = GetWindowLongPtrW(parent, GWL_STYLE) as u32;
            if style & WS_MAXIMIZEBOX == 0 {
                SetWindowLongPtrW(parent, GWL_STYLE, (style | WS_MAXIMIZEBOX) as isize);
            }

            // 将窗口背景改为深色，避免 resize 时露出白色
            let dark_brush = CreateSolidBrush(0x001e1e1e); // #1e1e1e (BGR)
            SetClassLongPtrW(parent, GCLP_HBRBACKGROUND, dark_brush as isize);

            let hinstance = GetModuleHandleW(core::ptr::null());

            // 注册最大化按钮覆盖窗口类
            let class_name: Vec<u16> = "TcomMaxBtnOverlay\0".encode_utf16().collect();
            let wc = WNDCLASSEXW {
                cbSize: core::mem::size_of::<WNDCLASSEXW>() as u32,
                style: 0,
                lpfnWndProc: Some(overlay_wndproc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: hinstance,
                hIcon: core::ptr::null_mut(),
                hCursor: core::ptr::null_mut(),
                hbrBackground: CreateSolidBrush(0x00FFFFFF),
                lpszMenuName: core::ptr::null(),
                lpszClassName: class_name.as_ptr(),
                hIconSm: core::ptr::null_mut(),
            };
            RegisterClassExW(&wc);

            // 创建最大化按钮覆盖窗口
            let overlay = CreateWindowExW(
                WS_EX_NOACTIVATE,
                class_name.as_ptr(),
                core::ptr::null(),
                WS_CHILD | WS_VISIBLE,
                0, 0, 1, 1,
                parent,
                core::ptr::null_mut(),
                hinstance,
                core::ptr::null(),
            );

            if overlay.is_null() {
                let err = GetLastError();
                log::warn!("[snap_layout] 覆盖窗口创建失败, err={}", err);
                return;
            }

            // WS_EX_LAYERED + alpha=1 → 视觉几乎不可见
            let ex = GetWindowLongPtrW(overlay, GWL_EXSTYLE) as u32;
            SetWindowLongPtrW(overlay, GWL_EXSTYLE, (ex | WS_EX_LAYERED) as isize);
            SetLayeredWindowAttributes(overlay, 0, 1, LWA_ALPHA);

            OVERLAY_HWND.store(overlay as *mut c_void, Ordering::Relaxed);
            update_overlay_pos(parent);
            log::info!("[snap_layout] 最大化按钮覆盖窗口创建成功, overlay={:?}", overlay);

            // 子类化父窗口
            let prev = SetWindowLongPtrW(parent, GWLP_WNDPROC, parent_wndproc as isize);
            PARENT_ORIG.store(prev as *mut c_void, Ordering::Relaxed);

            log::info!("[snap_layout] 初始化完成");
        }
    }
}

#[cfg(windows)]
pub use inner::setup;
