/**
 * storage.rs
 * 解析器配置持久化 — 将 ParserConfig 序列化到应用数据目录下的 parser_config.json。
 *
 * 依赖项目现有的 fs_utils 工具：
 * - get_app_data_dir：跨平台获取 App 专属数据目录
 * - atomic_write_str：先写 .tmp 再 rename，防断电/崩溃数据损坏
 */
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::commands::fs_utils::{atomic_write_str, get_app_data_dir};
use crate::commands::parser::schema::ParserConfig;

/// 返回 parser_config.json 的完整路径（确保父目录已存在）
pub fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = get_app_data_dir(app)?;
    // 父目录可能尚未创建（首次运行）
    fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    Ok(dir.join("parser_config.json"))
}

/// 将配置原子写入磁盘（先写 .tmp，成功后 rename 覆盖）
pub fn save_config(app: &AppHandle, config: &ParserConfig) {
    match get_config_path(app) {
        Err(e) => log::error!("[ParserStorage] 获取配置路径失败: {}", e),
        Ok(path) => {
            match serde_json::to_string_pretty(config) {
                Err(e) => log::error!("[ParserStorage] 配置序列化失败: {}", e),
                Ok(json) => {
                    if let Err(e) = atomic_write_str(&path, &json) {
                        log::error!("[ParserStorage] 配置写入失败: {}", e);
                    } else {
                        log::info!("[ParserStorage] 配置已落盘: {:?}", path);
                    }
                }
            }
        }
    }
}

/// 从磁盘读取配置；文件不存在或解析失败时返回内置默认配置
pub fn load_config(app: &AppHandle) -> ParserConfig {
    let path = match get_config_path(app) {
        Err(e) => {
            log::warn!("[ParserStorage] 获取配置路径失败，使用默认配置: {}", e);
            return ParserConfig::default_config();
        }
        Ok(p) => p,
    };

    if !path.exists() {
        log::info!("[ParserStorage] 配置文件不存在，使用默认配置");
        return ParserConfig::default_config();
    }

    match fs::read_to_string(&path) {
        Err(e) => {
            log::error!("[ParserStorage] 读取配置文件失败，使用默认配置: {}", e);
            ParserConfig::default_config()
        }
        Ok(json) => match serde_json::from_str::<ParserConfig>(&json) {
            Ok(config) => {
                log::info!(
                    "[ParserStorage] 配置加载成功，共 {} 个方案，激活 IDs: {:?}",
                    config.schemes.len(),
                    config.active_ids
                );
                config
            }
            Err(e) => {
                log::error!("[ParserStorage] 配置反序列化失败，使用默认配置: {}", e);
                ParserConfig::default_config()
            }
        },
    }
}
