/**
 * parser/mod.rs
 * 自定义协议解析引擎模块入口。
 *
 * 子模块：
 * - schema.rs  — 核心数据结构（DataType / FieldDef / ProtocolSchema）
 * - framer.rs  — 流式切帧器（解决串口粘包/半包）
 * - decoder.rs — 无状态解码器（字节帧 → HashMap<String, f64>）
 */
pub mod schema;
pub mod framer;
pub mod decoder;
pub mod api;


