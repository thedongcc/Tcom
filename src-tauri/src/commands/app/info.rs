/**
 * info.rs
 * 应用信息 — 版本查询、系统统计、管理员检测、恢复出厂。
 */
use serde_json::Value;
use std::process::Command;

/// 获取应用版本号
pub fn get_version(app: &tauri::AppHandle) -> Result<String, String> {
    let version = app.config().version.clone().unwrap_or_else(|| "0.0.2".into());
    Ok(version)
}

/// 获取应用统计信息（内存占用）
pub fn get_stats() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let pid = std::process::id();
        let ps_script = format!(
            "(Get-Process -Id {} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty WorkingSet64) / 1MB",
            pid
        );
        let mem_used = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8_lossy(&o.stdout).trim().parse::<f64>().ok()
                } else {
                    None
                }
            })
            .unwrap_or(0.0);

        Ok(serde_json::json!({ "memUsed": mem_used.round() as u64 }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "memUsed": 0 }))
    }
}

/// 检测当前是否以管理员权限运行
pub fn is_admin() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("net")
            .arg("session")
            .output();
        Ok(output.map(|o| o.status.success()).unwrap_or(false))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// 恢复出厂设置
pub fn factory_reset(app: &tauri::AppHandle) -> Result<Value, String> {
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let flag_path = data_dir.parent()
        .map(|p| p.join(".reset-pending"))
        .ok_or("Cannot determine parent directory")?;

    std::fs::write(&flag_path, "1").map_err(|e| e.to_string())?;
    app.restart();
}

/// 检测幽灵串口 — 设备已拔出但端口号仍被系统占用
pub fn list_ghost_ports() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

        // 1. 读取 SERIALCOMM 获取当前活跃的 COM 端口
        let mut active_ports: std::collections::HashSet<u32> = std::collections::HashSet::new();
        if let Ok(serialcomm) = hklm.open_subkey_with_flags(
            r"HARDWARE\DEVICEMAP\SERIALCOMM", KEY_READ
        ) {
            for value_result in serialcomm.enum_values() {
                if let Ok((name, _)) = value_result {
                    if let Ok(port_name) = serialcomm.get_value::<String, _>(&name) {
                        if let Some(num_str) = port_name.strip_prefix("COM").or_else(|| port_name.strip_prefix("com")) {
                            if let Ok(num) = num_str.parse::<u32>() {
                                active_ports.insert(num);
                            }
                        }
                    }
                }
            }
        }

        // 2. 读取 ComDB 位图获取所有已分配的 COM 端口号
        let mut allocated_ports: std::collections::HashSet<u32> = std::collections::HashSet::new();
        if let Ok(arbiter) = hklm.open_subkey_with_flags(
            r"SYSTEM\CurrentControlSet\Control\COM Name Arbiter", KEY_READ
        ) {
            if let Ok(comdb) = arbiter.get_raw_value("ComDB") {
                for (byte_idx, &byte) in comdb.bytes.iter().enumerate() {
                    for bit in 0..8u32 {
                        if byte & (1 << bit) != 0 {
                            let port_num = (byte_idx as u32) * 8 + bit + 1;
                            allocated_ports.insert(port_num);
                        }
                    }
                }
            }
        }

        // 3. 差集 = 幽灵端口
        let ghost_ports: Vec<String> = allocated_ports
            .difference(&active_ports)
            .filter(|&&num| num <= 255)
            .map(|&num| format!("COM{}", num))
            .collect();

        Ok(serde_json::json!({ "success": true, "ghostPorts": ghost_ports }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "success": true, "ghostPorts": [] }))
    }
}
