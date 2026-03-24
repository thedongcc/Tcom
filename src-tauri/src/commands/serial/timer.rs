/**
 * timer.rs
 * 定时发送逻辑 — 高精度定时器 + 双线程架构。
 */
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri::Manager;

use super::state::*;

/// 时间戳槽位定义（由 JS 端传入，供 Rust 端原位填充）
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampSlot {
    /// 帧内字节偏移
    pub byte_offset: usize,
    /// 字节长度（4 = 秒，8 = 毫秒）
    pub byte_size: usize,
    /// 字节序：big / little
    pub byte_order: String,
    /// 精度：seconds / milliseconds
    pub format: String,
}

/// 将时间戳按指定格式原位写入帧的指定偏移
fn apply_timestamp_slot(frame: &mut [u8], slot: &TimestampSlot) {
    let ts: u64 = if slot.format == "milliseconds" {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    } else {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    };

    let size = slot.byte_size.min(8).min(frame.len().saturating_sub(slot.byte_offset));
    if size == 0 { return; }

    let end = slot.byte_offset + size;
    if slot.byte_order == "little" {
        let bytes = ts.to_le_bytes();
        frame[slot.byte_offset..end].copy_from_slice(&bytes[..size]);
    } else {
        let bytes = ts.to_be_bytes();
        // 取大端整体 8 字节的末尾 size 字节（低位对齐）
        frame[slot.byte_offset..end].copy_from_slice(&bytes[8 - size..]);
    }
}

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

/// 启动动态帧定时发送（Ring Buffer + 时间戳 Slot 原位填充 + 高精度双线程）
pub fn start_dynamic_timed_send(
    app: &tauri::AppHandle,
    connection_id: String,
    frames: Vec<Vec<u8>>,
    interval_ms: u64,
    timestamp_slots: Vec<TimestampSlot>,
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

    // ── 双线程架构（与固定帧路径对齐）──

    // Writer 线程：接收帧数据并写入串口（异步，不阻塞 Timer 线程计时）
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

    // Timer 线程：Ring Buffer 轮播 + 时间戳原位填充 + 高精度睡眠 + 批处理 emit
    thread::spawn(move || {
        // Windows 高精度定时器
        #[cfg(target_os = "windows")]
        let _timer_guard = HighResTimerGuard::new();

        // Windows TIME_CRITICAL 线程优先级
        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL};
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        }

        let interval = Duration::from_millis(interval_ms);
        let mut next_tick = Instant::now() + interval;
        let pool_size = frames.len();
        let mut cursor: usize = 0;

        // 统一时钟基准
        let base_instant = Instant::now();
        let base_system_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let mut batch: Vec<TimedSendTickEvent> = Vec::new();
        let mut last_emit = Instant::now();
        let batch_interval = Duration::from_millis(16);

        while !stop.load(Ordering::SeqCst) {
            // 取当前帧（深拷贝，不修改原始 pool）
            let mut current_frame = frames[cursor % pool_size].clone();

            // 时间戳原位填充（纳秒级，不影响定时精度）
            for slot in &timestamp_slots {
                apply_timestamp_slot(&mut current_frame, slot);
            }

            let timestamp = base_system_ms + base_instant.elapsed().as_millis() as u64;

            // 异步发送到 Writer 线程（Timer 线程完全不阻塞）
            let _ = write_tx.send(current_frame.clone());

            // 每 16ms 批量通知前端（降低 IPC 频率，不影响发送精度）
            batch.push(TimedSendTickEvent {
                connection_id: tick_id.clone(),
                data: current_frame,
                timestamp,
            });

            let now = Instant::now();
            if now.duration_since(last_emit) >= batch_interval {
                let _ = tick_app.emit("serial:timed-send-tick-batch", batch.clone());
                batch.clear();
                last_emit = now;
            }

            cursor = cursor.wrapping_add(1);

            // 高精度等待（粗粒度 sleep + 精细 spin-loop，精度 ±0.5ms）
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

        // 发送剩余批次
        if !batch.is_empty() {
            let _ = tick_app.emit("serial:timed-send-tick-batch", batch);
        }
    });

    Ok(serde_json::json!({ "success": true }))
}
