/**
 * state.rs
 * 串口模块的核心状态和数据结构。
 * 被 scanner / connection / io / timer 子模块共用。
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, PoisonError};

/// Mutex 锁获取辅助：统一错误转换
pub fn lock_err<T>(_: PoisonError<T>) -> String {
    "Lock poisoned".into()
}

// ─── 全局状态 ─────────────────────────────────────────────────────────

/// 单个串口连接的句柄
pub struct PortHandle {
    /// 线程安全的串口写入端（独立于读取端，无锁竞争）
    pub writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 控制读取线程退出的信号
    pub alive: Arc<AtomicBool>,
    /// 定时发送的停止信号（None = 未运行）
    pub timed_send_stop: Option<Arc<AtomicBool>>,
}

/// 全局串口状态，通过 tauri::State 管理
pub struct SerialState {
    pub ports: Mutex<HashMap<String, PortHandle>>,
}

impl Default for SerialState {
    fn default() -> Self {
        Self {
            ports: Mutex::new(HashMap::new()),
        }
    }
}

// ─── 数据结构 ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SerialOpenOptions {
    pub path: String,
    #[serde(rename = "baudRate")]
    pub baud_rate: u32,
    #[serde(rename = "dataBits", default = "default_data_bits")]
    pub data_bits: u8,
    #[serde(rename = "stopBits", default = "default_stop_bits")]
    pub stop_bits: u8,
    #[serde(default = "default_parity")]
    pub parity: String,
}

fn default_data_bits() -> u8 { 8 }
fn default_stop_bits() -> u8 { 1 }
fn default_parity() -> String { "none".into() }

#[derive(Serialize, Clone)]
pub struct SerialDataEvent {
    #[serde(rename = "connectionId")]
    pub connection_id: String,
    pub data: Vec<u8>,
    pub timestamp: u64,
}

#[derive(Serialize, Clone)]
pub struct SerialClosedEvent {
    #[serde(rename = "connectionId")]
    pub connection_id: String,
}

#[derive(Serialize, Clone)]
pub struct SerialErrorEvent {
    #[serde(rename = "connectionId")]
    pub connection_id: String,
    pub error: String,
}

#[derive(Serialize, Clone)]
pub struct TimedSendTickEvent {
    #[serde(rename = "connectionId")]
    pub connection_id: String,
    pub data: Vec<u8>,
    pub timestamp: u64,
}

// ─── 端口信息 ─────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct PortInfo {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manufacturer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "friendlyName")]
    pub friendly_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "pnpId")]
    pub pnp_id: Option<String>,
    pub busy: bool,
    pub status: String,
    /// 端口被占用时的具体错误信息（busy = true 时填充）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Windows 高精度定时器 RAII 守卫
#[cfg(target_os = "windows")]
pub struct HighResTimerGuard;

#[cfg(target_os = "windows")]
impl HighResTimerGuard {
    pub fn new() -> Self {
        unsafe { windows_sys::Win32::Media::timeBeginPeriod(1); }
        Self
    }
}

#[cfg(target_os = "windows")]
impl Drop for HighResTimerGuard {
    fn drop(&mut self) {
        unsafe { windows_sys::Win32::Media::timeEndPeriod(1); }
    }
}
