/**
 * app.rs
 * 应用级 Commands — 版本查询、系统统计、管理员检测、字体枚举、恢复出厂。
 * com0com Commands — Windows 虚拟串口驱动管理（setupc.exe CLI 调用）。
 */
use serde_json::Value;
use std::process::Command;

#[tauri::command]
pub fn app_get_version(app: tauri::AppHandle) -> Result<String, String> {
    let version = app.config().version.clone().unwrap_or_else(|| "0.0.2".into());
    Ok(version)
}

#[tauri::command]
pub fn app_get_stats() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        // 查询进程自身内存占用
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

#[tauri::command]
pub fn app_is_admin() -> Result<bool, String> {
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

#[tauri::command]
pub fn app_list_fonts() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$fonts = @()
$regPaths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
  'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
)
foreach ($regPath in $regPaths) {
  if (Test-Path $regPath) {
    $keys = Get-ItemProperty -Path $regPath
    $keys.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
      $name = $_.Name -replace '\s*\(.*\)\s*$', '' -replace '\s+$', ''
      if ($name -and $name.Length -gt 1) {
        $fonts += $name
      }
    }
  }
}
$fonts | Sort-Object -Unique | ForEach-Object { [Console]::WriteLine($_) }
"#;
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let fonts: Vec<String> = stdout
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect();
            Ok(serde_json::json!({ "success": true, "fonts": fonts }))
        } else {
            Ok(serde_json::json!({ "success": false, "fonts": [] }))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "success": true, "fonts": [] }))
    }
}

#[tauri::command]
pub fn app_factory_reset(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let flag_path = data_dir.parent()
        .map(|p| p.join(".reset-pending"))
        .ok_or("Cannot determine parent directory")?;

    std::fs::write(&flag_path, "1").map_err(|e| e.to_string())?;
    app.restart();
}

/// 检测幽灵串口 — 设备已拔出但端口号仍被系统占用
/// 通过比对 ComDB 位图（所有已分配端口）与 SERIALCOMM（活跃端口）得到差集
#[tauri::command]
pub fn serial_list_ghost_ports() -> Result<Value, String> {
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
                        // 提取 COM 端口号
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
                // ComDB 是一个位图，每个 bit 代表一个 COM 端口
                // bit 0 = COM1, bit 1 = COM2, ...
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

        // 3. 差集 = 幽灵端口（已分配但不活跃）
        let ghost_ports: Vec<String> = allocated_ports
            .difference(&active_ports)
            .filter(|&&num| num <= 255) // 只关注合理范围
            .map(|&num| format!("COM{}", num))
            .collect();

        Ok(serde_json::json!({ "success": true, "ghostPorts": ghost_ports }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "success": true, "ghostPorts": [] }))
    }
}
// ─── com0com Commands（Windows 虚拟串口驱动管理） ──────────────────────

/// 查找 com0com 的 setupc.exe 路径
#[cfg(target_os = "windows")]
fn find_setupc_path() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;

    // 常见安装路径
    let candidates = [
        r"C:\Program Files (x86)\com0com\setupc.exe",
        r"C:\Program Files\com0com\setupc.exe",
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // 从注册表查找安装路径
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

/// 从注册表读取 com0com 端口对（多路径搜索 + setupc.exe 回退）
#[tauri::command]
pub fn com0com_list_pairs() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut pairs: Vec<serde_json::Value> = Vec::new();

        // ── 策略 1: 注册表 Enum 路径（免 admin） ──
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

                    // Device Parameters\PortName
                    if let Ok(dp) = com0com_key.open_subkey_with_flags(
                        format!(r"{}\Device Parameters", subkey_name), KEY_READ
                    ) {
                        if let Ok(name) = dp.get_value::<String, _>("PortName") {
                            port_name = Some(name);
                        }
                    }

                    // FriendlyName 回退
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

        // ── 策略 2: SERIALCOMM 注册表（检测 com0com 端口） ──
        if let Ok(serialcomm) = hklm.open_subkey_with_flags(
            r"HARDWARE\DEVICEMAP\SERIALCOMM", KEY_READ
        ) {
            let mut com0com_ports: Vec<(String, String)> = Vec::new();
            for value_result in serialcomm.enum_values() {
                if let Ok((name, _data)) = value_result {
                    // com0com 端口的 value name 通常包含 "com0com" 或 "CNC"
                    let name_upper = name.to_uppercase();
                    if name_upper.contains("COM0COM") || name_upper.contains("CNC") {
                        if let Ok(port_name) = serialcomm.get_value::<String, _>(&name) {
                            com0com_ports.push((name, port_name));
                        }
                    }
                }
            }

            // 将 CNCA/CNCB 配对
            let mut pair_map: std::collections::HashMap<String, (Option<String>, Option<String>)> = std::collections::HashMap::new();
            for (name, port) in &com0com_ports {
                let upper = name.to_uppercase();
                let is_a = upper.contains("CNCA");
                let is_b = upper.contains("CNCB");
                if !is_a && !is_b { continue; }

                // 提取数字索引
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

        // ── 策略 3: setupc.exe 回退（需要 admin） ──
        if let Some(setupc) = find_setupc_path() {
            if let Some(setupc_dir) = std::path::Path::new(&setupc).parent() {
                if let Ok(output) = Command::new(&setupc)
                    .current_dir(setupc_dir)
                    .arg("list")
                    .output()
                {
                    if output.status.success() {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        // 解析 setupc list 输出
                        let mut port_map: std::collections::HashMap<String, (Option<String>, Option<String>)> = std::collections::HashMap::new();
                        for line in stdout.lines() {
                            let trimmed = line.trim();
                            // 匹配 "CNCA0 PortName=COM1,..." 格式
                            if let Some(captures) = trimmed.split_whitespace().next() {
                                let upper = captures.to_uppercase();
                                let is_a = upper.starts_with("CNCA");
                                let is_b = upper.starts_with("CNCB");
                                if !is_a && !is_b { continue; }
                                let index = &upper[4..];

                                // 提取 PortName=COMx
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

        // 按 portA 的 COM 端口号排序，确保每次返回顺序一致
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

#[tauri::command]
pub fn com0com_exec(command: String, _silent: bool) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let setupc = find_setupc_path().ok_or("com0com setupc.exe not found")?;
        // 必须在 setupc.exe 所在目录执行，否则它会在当前目录搜索 com0com.inf 导致弹窗
        let setupc_dir = std::path::Path::new(&setupc).parent()
            .ok_or("Cannot determine setupc.exe directory")?;

        // 前端传来的 command 可能包含引号包裹的路径前缀，需要清理
        // 只提取实际的子命令部分（如 "list", "install PortName=COM3 PortName=COM4"）
        let clean_cmd = if command.contains("setupc") || command.contains("setupc.exe") {
            // 移除路径前缀，只保留子命令
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

#[tauri::command]
pub fn com0com_install() -> Result<Value, String> {
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

#[tauri::command]
pub fn com0com_set_friendly_name(port: String, name: String) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

        // 真实注册表结构：HKLM\SYSTEM\CurrentControlSet\Enum\com0com\port\CNCA0
        //                                                              \port\CNCB0
        // 每个设备子键下有 FriendlyName 值和 Device Parameters\PortName 值
        let enum_paths = [
            r"SYSTEM\CurrentControlSet\Enum\com0com\port",
            r"SYSTEM\CurrentControlSet\Enum\com0com",
        ];

        for enum_path in &enum_paths {
            if let Ok(parent_key) = hklm.open_subkey_with_flags(enum_path, KEY_READ) {
                for subkey_name in parent_key.enum_keys().filter_map(|r| r.ok()) {
                    // 检查 Device Parameters\PortName 是否匹配目标端口
                    let dp_path = format!(r"{}\Device Parameters", subkey_name);
                    if let Ok(dp_key) = parent_key.open_subkey_with_flags(&dp_path, KEY_READ) {
                        if let Ok(port_name) = dp_key.get_value::<String, _>("PortName") {
                            if port_name.eq_ignore_ascii_case(&port) {
                                // 找到匹配的设备，写入 FriendlyName
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

#[tauri::command]
pub fn com0com_check_path(path: String) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        // 检查自定义路径
        if !path.is_empty() && std::path::Path::new(&path).join("setupc.exe").exists() {
            return Ok(serde_json::json!({ "success": true, "path": path }));
        }
        // 使用默认搜索逻辑
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

#[tauri::command]
pub fn com0com_launch_installer() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        // 尝试打开 com0com 安装目录或下载页面
        match find_setupc_path() {
            Some(path) => {
                let dir = std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new("."));
                open::that(dir).map_err(|e| e.to_string())?;
                Ok(serde_json::json!({ "success": true }))
            }
            None => {
                // 打开 com0com 下载页面
                open::that("https://sourceforge.net/projects/com0com/").map_err(|e| e.to_string())?;
                Ok(serde_json::json!({ "success": true, "openedUrl": true }))
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("com0com is only available on Windows".into())
    }
}
