/**
 * monitor/state.rs
 * 虚拟串口监控状态管理 — 会话结构体、事件类型、状态常量。
 */
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU8};
use std::sync::{Arc, Mutex, PoisonError};

// ─── 锁错误转换 ──────────────────────────────────────────────────

pub fn lock_err<T>(_: PoisonError<T>) -> String {
    "Lock poisoned".into()
}

// ─── 状态机常量 ──────────────────────────────────────────────────

pub const STATE_PROBING: u8 = 0;
pub const STATE_FORWARDING: u8 = 1;
pub const STATE_STOPPING: u8 = 2;

// ─── 会话结构 ────────────────────────────────────────────────────

pub struct MonitorSession {
    /// 内部端口写入端（保留引用于备用需要）
    #[allow(dead_code)]
    pub internal_writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 物理端口写入端（保留引用于备用需要）
    #[allow(dead_code)]
    pub physical_writer: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 发往内部虚拟口的信道发送端
    pub tx_to_internal: std::sync::mpsc::Sender<Vec<u8>>,
    /// 发往外部物理口的信道发送端
    pub tx_to_physical: std::sync::mpsc::Sender<Vec<u8>>,
    /// 状态机
    pub state: Arc<AtomicU8>,
    /// 停止信号
    pub alive: Arc<AtomicBool>,
    /// 高精度定时器中断标志
    pub timed_send_stop: Option<Arc<AtomicBool>>,
}

pub struct MonitorState {
    pub sessions: Mutex<HashMap<String, MonitorSession>>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// ─── 事件结构 ────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorDataEvent {
    pub session_id: String,
    #[serde(rename = "type")]
    pub direction: String,
    pub target: Option<String>,
    pub data: Vec<u8>,
    pub timestamp: u64,
}

#[derive(Serialize, Clone)]
pub struct MonitorErrorEvent {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub error: String,
}

#[derive(Serialize, Clone)]
pub struct MonitorPartnerEvent {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub connected: bool,
}

#[derive(Serialize, Clone)]
pub struct MonitorClosedEvent {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}
