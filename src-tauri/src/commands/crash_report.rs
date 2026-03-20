/**
 * crash_report.rs
 * 崩溃上报模块 — 通过飞书 Webhook 发送错误报告。
 *
 * 职责：
 * - 接收前端拼装的错误 JSON，POST 到飞书机器人 Webhook
 * - 检查/清除上次 Rust Panic 崩溃标记文件
 */

use serde_json::Value;

/// 飞书 Webhook 地址 — 通过编译时环境变量 FEISHU_WEBHOOK_URL 注入
/// 构建方式：FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxx" cargo build
/// 若未设置，上报功能静默禁用
const FEISHU_WEBHOOK_URL: &str = match option_env!("FEISHU_WEBHOOK_URL") {
    Some(url) => url,
    None => "",
};

/// 获取崩溃标记文件路径
fn crash_marker_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.thedongcc.tcom")
        .join(".crash_marker")
}

/// 发送崩溃报告到飞书 Webhook
/// payload: 前端构建的完整飞书消息卡片 JSON 字符串
#[tauri::command]
pub async fn crash_report_send(payload: String) -> Result<(), String> {
    // 未配置 Webhook 地址时静默跳过
    if FEISHU_WEBHOOK_URL.is_empty() {
        log::warn!("[crash_report] 未配置 FEISHU_WEBHOOK_URL 环境变量，跳过上报");
        return Ok(());
    }

    // 解析 payload 为 JSON 值
    let body: Value = serde_json::from_str(&payload)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;

    // 异步发送到飞书 Webhook（超时 10 秒）
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {}", e))?;

    let resp = client
        .post(FEISHU_WEBHOOK_URL)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("发送失败: {}", e))?;

    if resp.status().is_success() {
        log::info!("[crash_report] 崩溃报告已发送到飞书");
        Ok(())
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        Err(format!("飞书返回错误 {}: {}", status, text))
    }
}

/// 检查上次是否 Rust Panic 闪退
/// 返回 Panic 信息字符串，若无崩溃返回 null
#[tauri::command]
pub fn crash_report_check() -> Result<Option<String>, String> {
    let path = crash_marker_path();
    if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("读取崩溃标记失败: {}", e))?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

/// 清除崩溃标记文件
#[tauri::command]
pub fn crash_report_clear() -> Result<(), String> {
    let path = crash_marker_path();
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("删除崩溃标记失败: {}", e))?;
    }
    Ok(())
}
