/**
 * com0com.rs
 * Windows 虚拟串口驱动管理 — setupc.exe CLI 调用、端口对查询、FriendlyName 设置。
 */
use serde_json::Value;
use std::process::Command;

/// 查找 com0com 的 setupc.exe 路径
#[cfg(target_os = "windows")]
fn find_setupc_path() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let candidates = [
        r"C:\Program Files (x86)\com0com\setupc.exe",
        r"C:\Program Files\com0com\setupc.exe",
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\com0com")
        .or_else(|_| {
            RegKey::predef(HKEY_LOCAL_MACHINE)
                .open_subkey(r"SOFTWARE\WOW6432Node\com0com")
        })
    {
        if let Ok(install_dir) = hklm.get_value::<String, _>("Install_Dir") {
            let path = format!(r"{}\setupc.exe", install_dir.trim_end_matches('\\'));
            if std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    None
}

/// 从注册表读取 com0com 端口对
pub fn list_pairs() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut pairs: Vec<serde_json::Value> = Vec::new();

        // ── 策略 1: 注册表 Enum 路径 ──
        let enum_paths = [
            r"SYSTEM\CurrentControlSet\Enum\com0com",
            r"SYSTEM\CurrentControlSet\Enum\Root\com0com",
        ];

        for enum_path in &enum_paths {
            if let Ok(com0com_key) = hklm.open_subkey_with_flags(enum_path, KEY_READ) {
                let mut port_map: std::collections::HashMap<String, (Option<String>, Option<String>)> = std::collections::HashMap::new();

                for subkey_name in com0com_key.enum_keys().filter_map(|r| r.ok()) {
                    let upper = subkey_name.to_uppercase();
                    let is_a = upper.starts_with("CNCA");
                    let is_b = upper.starts_with("CNCB");
                    if !is_a && !is_b { continue; }

                    let index = &upper[4..];
                    let mut port_name = None;

                    if let Ok(dp) = com0com_key.open_subkey_with_flags(
                        format!(r"{}\Device Parameters", subkey_name), KEY_READ
                    ) {
                        if let Ok(name) = dp.get_value::<String, _>("PortName") {
                            port_name = Some(name);
                        }
                    }

                    if port_name.is_none() {
                        if let Ok(sk) = com0com_key.open_subkey_with_flags(&subkey_name, KEY_READ) {
                            if let Ok(fname) = sk.get_value::<String, _>("FriendlyName") {
                                if let Some(start) = fname.rfind('(') {
                                    if let Some(end) = fname.rfind(')') {
                                        if end > start {
                                            port_name = Some(fname[start + 1..end].to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }

                    let entry = port_map.entry(index.to_string()).or_insert((None, None));
                    if is_a { entry.0 = port_name; } else { entry.1 = port_name; }
                }

                for (id, (port_a, port_b)) in &port_map {
                    if let (Some(a), Some(b)) = (port_a, port_b) {
                        pairs.push(serde_json::json!({ "portA": a, "portB": b, "id": id }));
                    }
                }

                if !pairs.is_empty() {
                    return Ok(serde_json::json!({ "success": true, "pairs": pairs }));
                }
            }
        }

        // ── 策略 2: SERIALCOMM 注册表 ──
        if let Ok(serialcomm) = hklm.open_subkey_with_flags(
            r"HARDWARE\DEVICEMAP\SERIALCOMM", KEY_READ
        ) {
            let mut com0com_ports: Vec<(String, String)> = Vec::new();
            for value_result in serialcomm.enum_values() {
                if let Ok((name, _data)) = value_result {
                    let name_upper = name.to_uppercase();
                    if name_upper.contains("COM0COM") || name_upper.contains("CNC") {
                        if let Ok(port_name) = serialcomm.get_value::<String, _>(&name) {
                            com0com_ports.push((name, port_name));
                        }
                    }
                }
            }

            let mut pair_map: std::collections::HashMap<String, (Option<String>, Option<String>)> = std::collections::HashMap::new();
            for (name, port) in &com0com_ports {
                let upper = name.to_uppercase();
                let is_a = upper.contains("CNCA");
                let is_b = upper.contains("CNCB");
                if !is_a && !is_b { continue; }

                let idx = upper.chars().rev().take_while(|c| c.is_ascii_digit()).collect::<String>().chars().rev().collect::<String>();
                if idx.is_empty() { continue; }

                let entry = pair_map.entry(idx).or_insert((None, None));
                if is_a { entry.0 = Some(port.clone()); } else { entry.1 = Some(port.clone()); }
            }

            for (id, (port_a, port_b)) in &pair_map {
                if let (Some(a), Some(b)) = (port_a, port_b) {
                    pairs.push(serde_json::json!({ "portA": a, "portB": b, "id": id }));
                }
            }

            if !pairs.is_empty() {
                return Ok(serde_json::json!({ "success": true, "pairs": pairs }));
            }
        }

        // ── 策略 3: setupc.exe 回退 ──
        if let Some(setupc) = find_setupc_path() {
            if let Some(setupc_dir) = std::path::Path::new(&setupc).parent() {
                if let Ok(output) = Command::new(&setupc)
                    .current_dir(setupc_dir)
                    .arg("list")
                    .output()
                {
                    if output.status.success() {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let mut port_map: std::collections::HashMap<String, (Option<String>, Option<String>)> = std::collections::HashMap::new();
                        for line in stdout.lines() {
                            let trimmed = line.trim();
                            if let Some(captures) = trimmed.split_whitespace().next() {
                                let upper = captures.to_uppercase();
                                let is_a = upper.starts_with("CNCA");
                                let is_b = upper.starts_with("CNCB");
                                if !is_a && !is_b { continue; }
                                let index = &upper[4..];

                                if let Some(pn_start) = trimmed.find("PortName=") {
                                    let rest = &trimmed[pn_start + 9..];
                                    let port_name = rest.split(&[',', ' '][..]).next().unwrap_or("").to_string();
                                    if !port_name.is_empty() {
                                        let entry = port_map.entry(index.to_string()).or_insert((None, None));
                                        if is_a { entry.0 = Some(port_name); } else { entry.1 = Some(port_name); }
                                    }
                                }
                            }
                        }
                        for (id, (port_a, port_b)) in &port_map {
                            if let (Some(a), Some(b)) = (port_a, port_b) {
                                pairs.push(serde_json::json!({ "portA": a, "portB": b, "id": id }));
                            }
                        }
                    }
                }
            }
        }

        pairs.sort_by(|a, b| {
            let num_a = a["portA"].as_str().unwrap_or("").replace("COM", "").parse::<u32>().unwrap_or(999);
            let num_b = b["portA"].as_str().unwrap_or("").replace("COM", "").parse::<u32>().unwrap_or(999);
            num_a.cmp(&num_b)
        });

        Ok(serde_json::json!({ "success": true, "pairs": pairs }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "success": true, "pairs": [] }))
    }
}

/// 执行 setupc.exe 命令
pub fn exec_command(command: String) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let setupc = find_setupc_path().ok_or("com0com setupc.exe not found")?;
        let setupc_dir = std::path::Path::new(&setupc).parent()
            .ok_or("Cannot determine setupc.exe directory")?;

        let clean_cmd = if command.contains("setupc") || command.contains("setupc.exe") {
            command.rsplit_once('"')
                .map(|(_, rest)| rest.trim())
                .or_else(|| command.rsplit_once("setupc.exe").map(|(_, rest)| rest.trim()))
                .or_else(|| command.rsplit_once("setupc").map(|(_, rest)| rest.trim()))
                .unwrap_or(&command)
                .to_string()
        } else {
            command.clone()
        };

        let output = Command::new(&setupc)
            .current_dir(setupc_dir)
            .args(clean_cmd.split_whitespace())
            .output()
            .map_err(|e| format!("Failed to execute setupc: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(serde_json::json!({
            "success": output.status.success(),
            "stdout": stdout,
            "stderr": stderr,
            "exitCode": output.status.code()
        }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
        Err("com0com is only available on Windows".into())
    }
}

/// 安装一对新的虚拟串口
pub fn install_pair() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let setupc = find_setupc_path().ok_or("com0com setupc.exe not found")?;
        let setupc_dir = std::path::Path::new(&setupc).parent()
            .ok_or("Cannot determine setupc.exe directory")?;
        let output = Command::new(&setupc)
            .current_dir(setupc_dir)
            .args(["install", "0", "-"])
            .output()
            .map_err(|e| format!("Failed to install com0com pair: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        if output.status.success() {
            Ok(serde_json::json!({ "success": true, "output": stdout }))
        } else {
            Err(format!("Install failed: {}", stdout))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("com0com is only available on Windows".into())
    }
}

/// 设置 com0com 端口的 FriendlyName
pub fn set_friendly_name(port: String, name: String) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

        let enum_paths = [
            r"SYSTEM\CurrentControlSet\Enum\com0com\port",
            r"SYSTEM\CurrentControlSet\Enum\com0com",
        ];

        for enum_path in &enum_paths {
            if let Ok(parent_key) = hklm.open_subkey_with_flags(enum_path, KEY_READ) {
                for subkey_name in parent_key.enum_keys().filter_map(|r| r.ok()) {
                    let dp_path = format!(r"{}\Device Parameters", subkey_name);
                    if let Ok(dp_key) = parent_key.open_subkey_with_flags(&dp_path, KEY_READ) {
                        if let Ok(port_name) = dp_key.get_value::<String, _>("PortName") {
                            if port_name.eq_ignore_ascii_case(&port) {
                                if let Ok(device_key) = parent_key.open_subkey_with_flags(&subkey_name, KEY_READ | KEY_WRITE) {
                                    device_key.set_value("FriendlyName", &name)
                                        .map_err(|e| format!("Failed to set FriendlyName: {}", e))?;
                                    return Ok(serde_json::json!({ "success": true }));
                                } else {
                                    return Err(format!("Cannot open device key {} for writing (admin required)", subkey_name));
                                }
                            }
                        }
                    }
                }
            }
        }

        Err(format!("Cannot find com0com device for port {}", port))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (port, name);
        Err("com0com is only available on Windows".into())
    }
}

/// 检查 com0com 路径是否有效
pub fn check_path(path: String) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        if !path.is_empty() && std::path::Path::new(&path).join("setupc.exe").exists() {
            return Ok(serde_json::json!({ "success": true, "path": path }));
        }
        match find_setupc_path() {
            Some(found) => Ok(serde_json::json!({ "success": true, "path": found })),
            None => Ok(serde_json::json!({ "success": false })),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(serde_json::json!({ "success": false }))
    }
}

/// 启动 com0com 安装器（内置安装包）
pub fn launch_installer() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        // 查找内置安装包路径：
        // 1. 生产环境：exe 同目录下的 resources/drivers/com0com_setup.exe
        // 2. 开发环境：项目根目录下的 resources/drivers/com0com_setup.exe
        let installer_path = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("resources/drivers/com0com_setup.exe")))
            .filter(|p| p.exists())
            .or_else(|| {
                // 开发模式回退：从 cargo manifest 目录向上查找
                let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .map(|root| root.join("resources/drivers/com0com_setup.exe"))?;
                if dev_path.exists() { Some(dev_path) } else { None }
            });

        match installer_path {
            Some(path) => {
                // 使用 ShellExecuteW 以管理员权限启动安装程序
                let path_str = path.to_string_lossy().to_string();

                // 使用 cmd /c start 方式以管理员权限启动
                Command::new("cmd")
                    .args(["/c", "start", "", &path_str])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .spawn()
                    .map_err(|e| format!("Failed to launch installer: {}", e))?;

                Ok(serde_json::json!({ "success": true }))
            }
            None => {
                Err("Built-in installer not found (com0com_setup.exe)".into())
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("com0com is only available on Windows".into())
    }
}
