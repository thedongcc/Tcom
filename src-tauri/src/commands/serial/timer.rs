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
        let mut tick_count: u64 = 0;

        // 统一时钟源
        let base_instant = Instant::now();
        let base_system_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        // 诊断变量
        let mut last_tick_instant = Instant::now();
        let mut interval_sum_us: u64 = 0;
        let mut interval_max_us: u64 = 0;
        let mut interval_min_us: u64 = u64::MAX;
        let mut emit_sum_us: u64 = 0;
        let mut emit_max_us: u64 = 0;

        while !stop.load(Ordering::SeqCst) {
            let tick_start = Instant::now();
            let interval_us = tick_start.duration_since(last_tick_instant).as_micros() as u64;
            last_tick_instant = tick_start;

            let timestamp = base_system_ms + base_instant.elapsed().as_millis() as u64;

            // 异步发送写请求到 writer 线程
            let _ = write_tx.send(data.clone());

            // 通知前端
            let t_emit = Instant::now();
            let _ = tick_app.emit(
                "serial:timed-send-tick",
                TimedSendTickEvent {
                    connection_id: tick_id.clone(),
                    data: data.clone(),
                    timestamp,
                },
            );
            let emit_us = t_emit.elapsed().as_micros() as u64;

            // 高精度等待
            let now = Instant::now();
            if next_tick > now {
                let remaining = next_tick - now;
                if remaining > Duration::from_millis(2) {
                    thread::sleep(remaining - Duration::from_millis(2));
                }
                while Instant::now() < next_tick {
                    std::hint::spin_loop();
                }
            }
            next_tick += interval;
            tick_count += 1;

            // 统计（跳过第 1 次）
            if tick_count > 1 {
                interval_sum_us += interval_us;
                if interval_us > interval_max_us { interval_max_us = interval_us; }
                if interval_us < interval_min_us { interval_min_us = interval_us; }
                emit_sum_us += emit_us;
                if emit_us > emit_max_us { emit_max_us = emit_us; }
            }

            // 每 20 次输出诊断
            if tick_count > 1 && (tick_count - 1) % 20 == 0 {
                let n = 20u64;
                let ideal_us = interval_ms * 1000;
                let avg_interval = interval_sum_us / n;
                let drift_us = if avg_interval > ideal_us { avg_interval - ideal_us } else { ideal_us - avg_interval };
                println!(
                    "[TimedSend DIAG] tick#{} | interval(us): avg={} min={} max={} ideal={} drift={}us | emit(us): avg={} max={}",
                    tick_count, avg_interval, interval_min_us, interval_max_us, ideal_us, drift_us,
                    emit_sum_us / n, emit_max_us,
                );
                interval_sum_us = 0;
                interval_max_us = 0;
                interval_min_us = u64::MAX;
                emit_sum_us = 0;
                emit_max_us = 0;
            }
        }
        println!("[TimedSend] Stopped after {} ticks", tick_count);
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
