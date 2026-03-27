/**
 * schema.rs
 * 协议解析引擎 — 核心数据结构定义（多方案版本）
 *
 * 架构变更：
 * - ProtocolSchema → ParserScheme（单个方案，含 id + name）
 * - 新增 ParserConfig（方案集合 + 激活 id）
 * - frame_length 改为可选的 min_frame_len（越界字段跳过，不再强制固定帧长）
 */
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ─── DataType ─────────────────────────────────────────────────────────────────

/// 字段的数据类型枚举
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataType {
    U8, I8,
    U16Le, U16Be, I16Le, I16Be,
    U32Le, U32Be, I32Le, I32Be,
    F32Le, F32Be,
}

impl DataType {
    pub fn byte_size(&self) -> usize {
        match self {
            DataType::U8 | DataType::I8 => 1,
            DataType::U16Le | DataType::U16Be
            | DataType::I16Le | DataType::I16Be => 2,
            DataType::U32Le | DataType::U32Be
            | DataType::I32Le | DataType::I32Be
            | DataType::F32Le | DataType::F32Be => 4,
        }
    }
}

// ─── FieldDef ─────────────────────────────────────────────────────────────────

/// 协议字段定义（偏移量相对整帧起始位置，含包头）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDef {
    pub name: String,
    pub offset: usize,
    pub data_type: DataType,
    #[serde(default = "default_multiplier")]
    pub multiplier: f64,
}

fn default_multiplier() -> f64 { 1.0 }

// ─── ParserScheme（单个解析方案） ─────────────────────────────────────────────

/// 协议解析方案。
/// 一个方案 = 帧头 + 最小帧长（可选）+ 字段定义列表。
///
/// `min_frame_len`：切帧器找到帧头后，至少等待这么多字节才切出一帧。
/// - `None`：默认取 `frame_header.len() + 1`（找到帧头即立刻切帧）
/// - `Some(n)`：等待至少 n 字节（超出字段在解码时跳过，不报错）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParserScheme {
    /// 唯一 ID（UUID v4 格式）
    pub id: String,

    /// 用户可见方案名称
    pub name: String,

    /// 帧头特征字节序列，例如 `[0xAA, 0x55]`
    pub frame_header: Vec<u8>,

    /// 最小帧长（可选）。填 None 时 = frame_header.len() + 1
    #[serde(default)]
    pub min_frame_len: Option<usize>,

    /// 字段定义列表
    pub fields: Vec<FieldDef>,
}

impl ParserScheme {
    /// 返回实际生效的最小帧长
    pub fn effective_min_frame_len(&self) -> usize {
        self.min_frame_len
            .unwrap_or_else(|| self.frame_header.len().saturating_add(1))
    }

    /// 构造默认测试方案
    pub fn default_test_scheme() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: "默认测试方案".to_string(),
            frame_header: vec![0xAA, 0x55],
            min_frame_len: Some(10),
            fields: vec![
                FieldDef { name: "pitch".into(), offset: 2, data_type: DataType::I16Be, multiplier: 0.1 },
                FieldDef { name: "temp".into(),  offset: 4, data_type: DataType::F32Le, multiplier: 1.0 },
                FieldDef { name: "pwm".into(),   offset: 8, data_type: DataType::U16Be, multiplier: 1.0 },
            ],
        }
    }
}

// ─── ParserConfig（方案集合） ─────────────────────────────────────────────────

/// 解析器全局配置：包含所有方案，以及当前激活的方案 ID。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParserConfig {
    /// 所有解析方案列表
    pub schemes: Vec<ParserScheme>,

    /// 当前激活方案的 ID（None = 无方案激活，不解析）
    pub active_id: Option<String>,
}

impl ParserConfig {
    /// 返回当前激活方案的引用（如果存在）
    pub fn active_scheme(&self) -> Option<&ParserScheme> {
        let id = self.active_id.as_deref()?;
        self.schemes.iter().find(|s| s.id == id)
    }

    /// 构造含一个默认测试方案的初始配置
    pub fn default_config() -> Self {
        let scheme = ParserScheme::default_test_scheme();
        let id = scheme.id.clone();
        Self {
            schemes: vec![scheme],
            active_id: Some(id),
        }
    }
}

// ─── 向后兼容别名（供旧引用过渡期使用） ──────────────────────────────────────
/// 废弃：请使用 `ParserScheme`
#[allow(dead_code)]
pub type ProtocolSchema = ParserScheme;

// ─── 单元测试 ──────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_type_byte_sizes_correct() {
        assert_eq!(DataType::U8.byte_size(), 1);
        assert_eq!(DataType::I8.byte_size(), 1);
        assert_eq!(DataType::U16Le.byte_size(), 2);
        assert_eq!(DataType::U16Be.byte_size(), 2);
        assert_eq!(DataType::I16Le.byte_size(), 2);
        assert_eq!(DataType::I16Be.byte_size(), 2);
        assert_eq!(DataType::U32Le.byte_size(), 4);
        assert_eq!(DataType::U32Be.byte_size(), 4);
        assert_eq!(DataType::I32Le.byte_size(), 4);
        assert_eq!(DataType::I32Be.byte_size(), 4);
        assert_eq!(DataType::F32Le.byte_size(), 4);
        assert_eq!(DataType::F32Be.byte_size(), 4);
    }

    #[test]
    fn effective_min_frame_len_uses_none_default() {
        let s = ParserScheme {
            id: "x".into(), name: "t".into(),
            frame_header: vec![0xAA, 0x55],
            min_frame_len: None,
            fields: vec![],
        };
        assert_eq!(s.effective_min_frame_len(), 3); // header(2) + 1
    }

    #[test]
    fn effective_min_frame_len_uses_explicit_value() {
        let s = ParserScheme {
            id: "x".into(), name: "t".into(),
            frame_header: vec![0xAA, 0x55],
            min_frame_len: Some(10),
            fields: vec![],
        };
        assert_eq!(s.effective_min_frame_len(), 10);
    }

    #[test]
    fn parser_config_active_scheme_returns_correct() {
        let cfg = ParserConfig::default_config();
        let active = cfg.active_scheme();
        assert!(active.is_some(), "默认配置应有激活方案");
        assert_eq!(active.unwrap().name, "默认测试方案");
        assert_eq!(active.unwrap().fields.len(), 3);
    }

    #[test]
    fn config_serde_roundtrip() {
        let cfg = ParserConfig::default_config();
        let json = serde_json::to_string(&cfg).expect("序列化不应失败");
        let restored: ParserConfig = serde_json::from_str(&json).expect("反序列化不应失败");
        assert_eq!(restored.schemes.len(), 1);
        assert_eq!(restored.active_id, cfg.active_id);
    }

    #[test]
    fn field_def_default_multiplier_via_serde() {
        let json = r#"{"name":"rpm","offset":2,"data_type":"u16_be"}"#;
        let field: FieldDef = serde_json::from_str(json).expect("应能反序列化");
        assert_eq!(field.multiplier, 1.0);
    }
}
