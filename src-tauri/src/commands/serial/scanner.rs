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
    let opened_paths: std::collections::HashSet<String> = ports_map
        .values()
        .map(|_| String::new())
        .collect();
    drop(ports_map);

    // 获取系统串口列表
    let sys_ports = serialport::available_ports().unwrap_or_default();
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
    let _ = opened_paths;

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
