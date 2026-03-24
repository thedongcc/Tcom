/**
 * monitor/timer.rs
 * 虚拟串口监控定时发送 — 高精度自旋定时器。
 */
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::Emitter;

use super::state::*;

/// 启动高精度定时发送线程
pub fn start_timed_send(
    app: &tauri::AppHandle,
    state: &MonitorState,
    session_id: String,
    target: String,
    data: Value,
    interval_ms: u64,
) -> Result<Value, String> {
    let bytes: Vec<u8> = match &data {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Array(arr) => arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect(),
        _ => return Err("Invalid data format".into()),
    };

    let mut sessions = state.sessions.lock().map_err(lock_err)?;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    // 如果已有定时发送在运行，先停止
    if let Some(old_stop) = session.timed_send_stop.take() {
        old_stop.store(true, Ordering::SeqCst);
    }

    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    session.timed_send_stop = Some(Arc::clone(&stop));

    let tx = if target == "virtual" {
        session.tx_to_internal.clone()
    } else {
        session.tx_to_physical.clone()
    };

    let tick_app = app.clone();
    let tick_id = session_id.clone();
    let tick_target = target.clone();

    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        let _timer_guard = crate::commands::serial::state::HighResTimerGuard::new();

        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL};
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        }

        let interval = std::time::Duration::from_millis(interval_ms);
        let mut next_tick = std::time::Instant::now() + interval;

        let mut batch = Vec::new();
        let mut last_emit = std::time::Instant::now();
        let batch_interval = std::time::Duration::from_millis(16);

        while !stop.load(Ordering::SeqCst) {
            let _ = tx.send(bytes.clone());

            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            batch.push(MonitorDataEvent {
                session_id: tick_id.clone(),
                direction: "TX".into(),
                target: Some(tick_target.clone()),
                data: bytes.clone(),
                timestamp,
            });

            let now = std::time::Instant::now();
            if now.duration_since(last_emit) >= batch_interval {
                let _ = tick_app.emit("monitor:timed-send-tick-batch", batch.clone());
                batch.clear();
                last_emit = now;
            }

            let now = std::time::Instant::now();
            if next_tick > now {
                let remaining = next_tick - now;
                if remaining > std::time::Duration::from_millis(2) {
                    std::thread::sleep(remaining - std::time::Duration::from_millis(2));
                }
                while std::time::Instant::now() < next_tick {
                    std::hint::spin_loop();
                }
            }
            next_tick += interval;
        }

        if !batch.is_empty() {
            let _ = tick_app.emit("monitor:timed-send-tick-batch", batch);
        }
    });

    Ok(serde_json::json!({ "success": true }))
}

/// 停止定时发送
pub fn stop_timed_send(
    state: &MonitorState,
    session_id: String,
) -> Result<Value, String> {
    let mut sessions = state.sessions.lock().map_err(lock_err)?;

    if let Some(session) = sessions.get_mut(&session_id) {
        if let Some(stop) = session.timed_send_stop.take() {
            stop.store(true, Ordering::SeqCst);
        }
    }

    Ok(serde_json::json!({ "success": true }))
}
