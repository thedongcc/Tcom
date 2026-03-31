/**
 * api.rs
 * Tauri 命令层 — 解析器配置的全局状态与 IPC 接口（多方案版）
 *
 * 变更（持久化版）：
 * - ParserState 新增 initialized: AtomicBool 标志位，区分"首次加载"和"后续操作"
 * - get_parser_config：首次调用时从磁盘加载配置，注入内存后返回
 * - update_parser_config：更新内存后立即调用 storage::save_config 落盘
 */
use crate::commands::parser::schema::{ParserConfig, ParserScheme};
use crate::commands::parser::storage;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;

/// Tauri 全局解析配置状态（方案集合 + 激活 ID + 磁盘初始化标志）
pub struct ParserState {
    pub config: std::sync::Mutex<ParserConfig>,
    /// false = 尚未从磁盘加载，true = 已完成首次磁盘读取
    pub initialized: AtomicBool,
}

impl ParserState {
    pub fn new() -> Self {
        Self {
            // 启动时先以内置默认配置占位，get_parser_config 首次调用时会被磁盘数据覆盖
            config: std::sync::Mutex::new(ParserConfig::default_config()),
            initialized: AtomicBool::new(false),
        }
    }

    /// 获取当前挂载的所有激活方案的快照（无锁热读）
    #[allow(dead_code)]
    pub fn active_schemes_snapshot(&self) -> Vec<ParserScheme> {
        self.config
            .lock()
            .map(|cfg| cfg.active_schemes().into_iter().cloned().collect())
            .unwrap_or_default()
    }
}

// ─── Tauri Commands ────────────────────────────────────────────────────────────

/// 获取完整的解析器配置（含所有方案列表 + 激活 ID）
///
/// 首次调用时从磁盘 parser_config.json 加载配置并注入内存状态，
/// 后续调用直接返回内存中的当前值。
#[tauri::command]
pub fn get_parser_config(
    app: tauri::AppHandle,
    state: State<'_, ParserState>,
) -> Result<ParserConfig, String> {
    // 首次加载：从磁盘读取配置并覆盖内置默认值
    if !state.initialized.load(Ordering::SeqCst) {
        let disk_config = storage::load_config(&app);
        let mut guard = state
            .config
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *guard = disk_config;
        // 标记为已初始化，防止后续调用重复覆盖
        state.initialized.store(true, Ordering::SeqCst);
        return Ok(guard.clone());
    }

    state
        .config
        .lock()
        .map(|s| s.clone())
        .map_err(|e| format!("Lock error: {}", e))
}

/// 前端更新解析器配置（覆盖全部方案 + 激活 ID），并原子落盘持久化
#[tauri::command]
pub fn update_parser_config(
    app: tauri::AppHandle,
    new_config: ParserConfig,
    state: State<'_, ParserState>,
) -> Result<(), String> {
    {
        let mut guard = state
            .config
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *guard = new_config.clone();
        // update 先于 get 时也标记为已初始化，防止 get 误覆盖
        state.initialized.store(true, Ordering::SeqCst);
        // guard 在此处 drop，释放锁后再执行 I/O，避免持锁期间阻塞读取线程
    }

    // 锁已释放，安全落盘（atomic_write_str 内部先写 .tmp 再 rename）
    storage::save_config(&app, &new_config);

    Ok(())
}

// ─── 向后兼容暂留（将在后续版本中移除） ─────────────────────────────────────

/// @deprecated 请使用 get_parser_config
#[tauri::command]
pub fn get_parser_schema(state: State<'_, ParserState>) -> Result<ParserScheme, String> {
    state
        .config
        .lock()
        .map_err(|e| format!("Lock error: {}", e))
        .and_then(|s| {
            s.active_schemes()
                .first()
                .cloned()
                .cloned()
                .ok_or_else(|| "无激活方案".to_string())
        })
}

/// @deprecated 请使用 update_parser_config
#[tauri::command]
pub fn update_parser_schema(
    new_schema: ParserScheme,
    state: State<'_, ParserState>,
) -> Result<(), String> {
    let mut guard = state
        .config
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    // 以第一个激活 ID 为准更新对应方案，若没有激活则追加
    if let Some(id) = guard.active_ids.first().cloned() {
        if let Some(scheme) = guard.schemes.iter_mut().find(|s| s.id == id) {
            *scheme = new_schema;
            return Ok(());
        }
    }
    // 若无激活则将其设为第一个方案并激活
    let new_id = new_schema.id.clone();
    guard.schemes.clear();
    guard.schemes.push(new_schema);
    guard.active_ids = vec![new_id];
    Ok(())
}
