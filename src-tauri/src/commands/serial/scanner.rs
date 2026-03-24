/**
 * scanner.rs
 * 串口硬件扫描 — 系统端口列表 + Windows 注册表兜底。
 */
use serde_json::Value;
use serialport::SerialPortType;
use tauri::Manager;

use super::state::{lock_err, PortInfo, SerialState};


/// 扫描系统串口列表
pub fn scan_ports(app: &tauri::AppHandle) -> Result<Value, String> {
    let state = app.state::<SerialState>();
    let ports_map = state.ports.lock().map_err(lock_err)?;
    drop(ports_map);

    // 获取系统串口列表
    let sys_ports = serialport::available_ports().unwrap_or_default();

    // 1. 先并行发起所有端口的检测线程（不阻塞等待）
    let checks: Vec<(String, std::sync::mpsc::Receiver<bool>)> = sys_ports
        .iter()
        .map(|p| {
            let path = p.port_name.clone();
            let (tx, rx) = std::sync::mpsc::channel();
            let path2 = path.clone();
            std::thread::spawn(move || {
                let is_err = serialport::new(&path2, 9600)
                    .timeout(std::time::Duration::from_millis(10))
                    .open()
                    .is_err();
                let _ = tx.send(is_err);
            });
            (path, rx)
        })
        .collect();

    // 2. 构建端口信息（busy 默认 false，稍后从并行检测结果填充）
    let mut result: Vec<PortInfo> = sys_ports
        .iter()
        .map(|p| {
            let (manufacturer, friendly, pnp_id) = match &p.port_type {
                SerialPortType::UsbPort(usb) => (
                    usb.manufacturer.clone(),
                    Some(format!(
                        "{} ({})",
                        usb.product.as_deref().unwrap_or("Serial Port"),
                        &p.port_name
                    )),
                    Some(format!("USB\\VID_{:04X}&PID_{:04X}", usb.vid, usb.pid)),
                ),
                SerialPortType::PciPort => (
                    Some("PCI".into()),
                    Some(format!("PCI Serial Port ({})", &p.port_name)),
                    None,
                ),
                _ => (None, None, None),
            };
            PortInfo {
                path: p.port_name.clone(),
                manufacturer,
                friendly_name: friendly,
                pnp_id,
                busy: false,
                status: "available".into(),
            }
        })
        .collect();

    // Windows 注册表兜底：发现 serialport crate 漏掉的端口
    #[cfg(target_os = "windows")]
    {
        if let Ok(reg_ports) = get_registry_ports() {
            for (port_name, device) in &reg_ports {
                if !result.iter().any(|p| &p.path == port_name) {
                    let manufacturer = if device.to_lowercase().contains("com0com") {
                        Some("com0com".into())
                    } else if device.to_lowercase().contains("bthmodem") {
                        Some("Microsoft (Bluetooth)".into())
                    } else {
                        None
                    };
                    result.push(PortInfo {
                        path: port_name.clone(),
                        manufacturer: manufacturer.clone(),
                        friendly_name: Some(format!(
                            "{} Port ({})",
                            manufacturer.as_deref().unwrap_or("Serial"),
                            port_name
                        )),
                        pnp_id: Some(device.clone()),
                        busy: false,
                        status: "available".into(),
                    });
                }
            }
        }
    }

    // Windows: 为缺少 friendlyName 的端口从注册表获取 FriendlyName
    #[cfg(target_os = "windows")]
    {
        let friendly_map = get_registry_friendly_names();
        for port in &mut result {
            if port.friendly_name.is_none() || port.friendly_name.as_ref().map_or(false, |n| n == &port.path) {
                if let Some(name) = friendly_map.get(&port.path) {
                    port.friendly_name = Some(name.clone());
                }
            }
        }
    }

    // 3. 等待所有并行检测线程结果，并回填 busy 状态（最多等 200ms/个）
    let mut busy_map: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    for (path, rx) in checks {
        let is_busy = rx
            .recv_timeout(std::time::Duration::from_millis(200))
            .unwrap_or(true); // 超时 = 认为 busy（端口响应太慢）
        busy_map.insert(path, is_busy);
    }

    // 对注册表兜底端口也做检测（在已有并行结果中没有对应项时）
    for port in &result {
        if !busy_map.contains_key(&port.path) {
            let path = port.path.clone();
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let is_err = serialport::new(&path, 9600)
                    .timeout(std::time::Duration::from_millis(10))
                    .open()
                    .is_err();
                let _ = tx.send(is_err);
            });
            let is_busy = rx
                .recv_timeout(std::time::Duration::from_millis(200))
                .unwrap_or(true);
            busy_map.insert(port.path.clone(), is_busy);
        }
    }

    // 4. 用 busy_map 回填所有端口状态
    for port in &mut result {
        if let Some(&is_busy) = busy_map.get(&port.path) {
            port.busy = is_busy;
            port.status = if is_busy { "busy".into() } else { "available".into() };
        }
    }

    Ok(serde_json::json!({ "success": true, "ports": result }))
}

/// 从 Windows 注册表获取活动串口列表
#[cfg(target_os = "windows")]
fn get_registry_ports() -> Result<Vec<(String, String)>, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm
        .open_subkey("HARDWARE\\DEVICEMAP\\SERIALCOMM")
        .map_err(|e| e.to_string())?;

    let mut ports = Vec::new();
    for (name, value) in key.enum_values().flatten() {
        let val = format!("{}", value);
        if val.starts_with("COM") {
            ports.push((val, name));
        }
    }
    Ok(ports)
}

/// 从 Windows 注册表获取所有串口设备的 FriendlyName
#[cfg(target_os = "windows")]
fn get_registry_friendly_names() -> std::collections::HashMap<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let mut map = std::collections::HashMap::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    if let Ok(enum_key) = hklm.open_subkey_with_flags(
        r"SYSTEM\CurrentControlSet\Enum", KEY_READ
    ) {
        for bus in enum_key.enum_keys().flatten() {
            if let Ok(bus_key) = enum_key.open_subkey_with_flags(&bus, KEY_READ) {
                for device in bus_key.enum_keys().flatten() {
                    if let Ok(device_key) = bus_key.open_subkey_with_flags(&device, KEY_READ) {
                        for instance in device_key.enum_keys().flatten() {
                            if let Ok(inst_key) = device_key.open_subkey_with_flags(&instance, KEY_READ) {
                                let dp_path = format!(r"{}\Device Parameters", instance);
                                if let Ok(dp_key) = device_key.open_subkey_with_flags(&dp_path, KEY_READ) {
                                    if let Ok(port_name) = dp_key.get_value::<String, _>("PortName") {
                                        if port_name.starts_with("COM") {
                                            if let Ok(friendly) = inst_key.get_value::<String, _>("FriendlyName") {
                                                map.insert(port_name, friendly);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    map
}
