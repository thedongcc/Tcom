/**
 * fs_utils.rs
 * 文件系统工具函数 — 原子写入（防断电/崩溃数据损坏）。
 *
 * 原理：先写入 .tmp 临时文件 → 落盘后 rename 覆盖目标文件。
 * rename 在同一文件系统上是原子操作，即使过程中断电，
 * 要么旧文件完好，要么新文件已完整写入，不会出现 0 字节或半截 JSON。
 */
use std::fs;
use std::io::Write;
use std::path::Path;

/// 原子写入文件
/// 1. 写入 `<path>.tmp`
/// 2. 调用 sync_all 确保数据落盘
/// 3. rename 覆盖目标文件
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let tmp_path = path.with_extension("tmp");

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 写入临时文件
    let mut file = fs::File::create(&tmp_path)
        .map_err(|e| format!("创建临时文件失败: {}", e))?;
    file.write_all(data)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("sync 失败: {}", e))?;
    drop(file); // 显式关闭文件句柄

    // 原子替换（rename 在同一磁盘上是原子操作）
    fs::rename(&tmp_path, path)
        .map_err(|e| format!("原子替换失败: {}", e))?;

    Ok(())
}

/// 原子写入字符串（便捷包装）
pub fn atomic_write_str(path: &Path, content: &str) -> Result<(), String> {
    atomic_write(path, content.as_bytes())
}
