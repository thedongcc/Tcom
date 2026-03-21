/**
 * timer.rs
 * 定时发送逻辑 — 高精度定时器 + 双线程架构。
 */
use serde_json::Value;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri::Manager;

use super::state::*;

/// 启动定时发送（固定帧）
pub fn start_timed_send(
    app: &tauri::AppHandle,
    connection_id: String,
    data: Vec<u8>,
    interval_ms: u64,
) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let mut ports = state.ports.lock().map_err(lock_err)?;

    let handle = ports
        .get_mut(&connection_id)
        .ok_or("Port not open")?;

    // 如果已有定时发送在运行，先停止
    if let Some(old_stop) = handle.timed_send_stop.take() {
        old_stop.store(true, Ordering::SeqCst);
    }

    let stop = Arc::new(AtomicBool::new(false));
    handle.timed_send_stop = Some(Arc::clone(&stop));
    let writer = Arc::clone(&handle.writer);
    let tick_app = app.clone();
    let tick_id = connection_id.clone();

    // ── 双线程架构：timer 线程精确计时，writer 线程异步写入 ──

    // Writer 线程：从 channel 接收数据并写入串口
    let (write_tx, write_rx) = std::sync::mpsc::channel::<Vec<u8>>();
    let writer_stop = Arc::clone(&stop);
    thread::spawn(move || {
        while !writer_stop.load(Ordering::SeqCst) {
            match write_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(buf) => {
                    if let Ok(mut port) = writer.lock() {
                        let _ = port.write_all(&buf);
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            }
        }
    });

    // Timer 线程：精确计时 + emit（不接触串口，零阻塞）
    thread::spawn(move || {
        // Windows 高精度定时器：将系统分辨率从 15.6ms → 1ms
        #[cfg(target_os = "windows")]
        let _timer_guard = HighResTimerGuard::new();

        // Windows：提升线程优先级为 TIME_CRITICAL
        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL};
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        }

        let interval = Duration::from_millis(interval_ms);
        let mut next_tick = Instant::now() + interval;

        // 统一时钟源
        let base_instant = Instant::now();
        let base_system_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let mut batch = Vec::new();
        let mut last_emit = Instant::now();
        let batch_interval = Duration::from_millis(16);

        while !stop.load(Ordering::SeqCst) {

            let timestamp = base_system_ms + base_instant.elapsed().as_millis() as u64;

            // 异步发送写请求到 writer 线程
            let _ = write_tx.send(data.clone());

            // 压入批处理队列
            batch.push(TimedSendTickEvent {
                connection_id: tick_id.clone(),
                data: data.clone(),
                timestamp,
            });

            let now = Instant::now();
            if now.duration_since(last_emit) >= batch_interval {
                let _ = tick_app.emit("serial:timed-send-tick-batch", batch.clone());
                batch.clear();
                last_emit = now;
            }

            // 高精度等待
            let current = Instant::now();
            if next_tick > current {
                let remaining = next_tick - current;
                if remaining > Duration::from_millis(2) {
                    thread::sleep(remaining - Duration::from_millis(2));
                }
                while Instant::now() < next_tick {
                    std::hint::spin_loop();
                }
            }
            next_tick += interval;
        }

        if !batch.is_empty() {
            let _ = tick_app.emit("serial:timed-send-tick-batch", batch);
        }
    });

    Ok(serde_json::json!({ "success": true }))
}

/// 停止定时发送
pub fn stop_timed_send(
    app: &tauri::AppHandle,
    connection_id: String,
) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let mut ports = state.ports.lock().map_err(lock_err)?;

    if let Some(handle) = ports.get_mut(&connection_id) {
        if let Some(stop) = handle.timed_send_stop.take() {
            stop.store(true, Ordering::SeqCst);
        }
    }

    Ok(serde_json::json!({ "success": true }))
}

/// 启动动态帧定时发送
pub fn start_dynamic_timed_send(
    app: &tauri::AppHandle,
    connection_id: String,
    frames: Vec<Vec<u8>>,
    interval_ms: u64,
) -> Result<Value, String> {
    if frames.is_empty() {
        return Err("frames must not be empty".into());
    }

    let state = app.state::<SerialState>();
    let mut ports = state.ports.lock().map_err(lock_err)?;

    let handle = ports
        .get_mut(&connection_id)
        .ok_or("Port not open")?;

    // 停止旧的定时发送
    if let Some(old_stop) = handle.timed_send_stop.take() {
        old_stop.store(true, Ordering::SeqCst);
    }

    let stop = Arc::new(AtomicBool::new(false));
    handle.timed_send_stop = Some(Arc::clone(&stop));
    let writer = Arc::clone(&handle.writer);
    let tick_app = app.clone();
    let tick_id = connection_id.clone();

    thread::spawn(move || {
        let interval = Duration::from_millis(interval_ms);
        let mut next_tick = Instant::now() + interval;
        let mut frame_idx = 0usize;

        while !stop.load(Ordering::SeqCst) {
            let frame = &frames[frame_idx % frames.len()];

            // 写入数据
            if let Ok(mut port) = writer.lock() {
                if port.write_all(frame).is_err() {
                    break;
                }
                let _ = port.flush();
            } else {
                break;
            }

            // 通知前端
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            let _ = tick_app.emit(
                "serial:timed-send-tick",
                TimedSendTickEvent {
                    connection_id: tick_id.clone(),
                    data: frame.clone(),
                    timestamp,
                },
            );

            frame_idx += 1;

            // 高精度等待
            let now = Instant::now();
            if next_tick > now {
                thread::sleep(next_tick - now);
            }
            next_tick += interval;
        }
    });

    Ok(serde_json::json!({ "success": true }))
}
