/**
 * api.rs
 * Tauri 命令层 — 解析器配置的全局状态与 IPC 接口（多方案版）
 */
use crate::commands::parser::schema::{ParserConfig, ParserScheme};
use tauri::State;

/// Tauri 全局解析配置状态（包含所有方案 + 激活 ID）
pub struct ParserState(pub std::sync::Mutex<ParserConfig>);

impl ParserState {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(ParserConfig::default_config()))
    }

    /// 获取当前激活方案的快照（如有）
    pub fn active_scheme_snapshot(&self) -> Option<ParserScheme> {
        self.0.lock().ok()?.active_scheme().cloned()
    }
}

// ─── Tauri Commands ────────────────────────────────────────────────────────────

/// 获取完整的解析器配置（含所有方案列表 + 激活 ID）
#[tauri::command]
pub fn get_parser_config(state: State<'_, ParserState>) -> Result<ParserConfig, String> {
    state.0.lock()
        .map(|s| s.clone())
        .map_err(|e| format!("Lock error: {}", e))
}

/// 前端更新解析器配置（覆盖全部方案 + 激活 ID）
#[tauri::command]
pub fn update_parser_config(
    new_config: ParserConfig,
    state: State<'_, ParserState>,
) -> Result<(), String> {
    let mut guard = state.0.lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    *guard = new_config;
    Ok(())
}

// ─── 向后兼容暂留（将在后续版本中移除） ─────────────────────────────────────
/// @deprecated 请使用 get_parser_config
#[tauri::command]
pub fn get_parser_schema(state: State<'_, ParserState>) -> Result<ParserScheme, String> {
    state.0.lock()
        .map_err(|e| format!("Lock error: {}", e))
        .and_then(|s| s.active_scheme().cloned().ok_or_else(|| "无激活方案".to_string()))
}

/// @deprecated 请使用 update_parser_config
#[tauri::command]
pub fn update_parser_schema(
    new_schema: ParserScheme,
    state: State<'_, ParserState>,
) -> Result<(), String> {
    let mut guard = state.0.lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    // 以激活 ID 为准更新对应方案，若没有激活则追加
    if let Some(id) = guard.active_id.clone() {
        if let Some(scheme) = guard.schemes.iter_mut().find(|s| s.id == id) {
            *scheme = new_schema;
            return Ok(());
        }
    }
    // 若无激活则将其设为第一个方案并激活
    let new_id = new_schema.id.clone();
    guard.schemes.clear();
    guard.schemes.push(new_schema);
    guard.active_id = Some(new_id);
    Ok(())
}
