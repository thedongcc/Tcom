/**
 * parser/mod.rs
 * 自定义协议解析引擎模块入口。
 *
 * 子模块：
 * - schema.rs  — 核心数据结构（DataType / FieldDef / ParserScheme / ParserConfig）
 * - framer.rs  — 流式切帧器（解决串口粘包/半包）
 * - decoder.rs — 无状态解码器（字节帧 → HashMap<String, f64>）
 * - storage.rs — 配置持久化（parser_config.json 原子读写）
 * - api.rs     — Tauri IPC 命令层（全局 ParserState + Commands）
 */
pub mod schema;
pub mod framer;
pub mod decoder;
pub mod storage;
pub mod api;
