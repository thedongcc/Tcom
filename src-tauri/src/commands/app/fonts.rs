/**
 * fonts.rs
 * 系统字体扫描与获取。
 */
use serde_json::Value;


/// 枚举系统已安装字体
pub fn list_fonts() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        
        let mut fonts = Vec::new();
        
        if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts") {
            for val in hklm.enum_values().flatten() {
                let name = val.0; // 例如 "Arial (TrueType)"
                // 去除结尾的 " (TrueType)" 等括号
                let clean_name = name.split(" (").next().unwrap_or(&name).trim().to_string();
                if clean_name.len() > 1 {
                    fonts.push(clean_name);
                }
            }
        }

        if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts") {
            for val in hkcu.enum_values().flatten() {
                let name = val.0;
                let clean_name = name.split(" (").next().unwrap_or(&name).trim().to_string();
                if clean_name.len() > 1 {
                    fonts.push(clean_name);
                }
            }
        }
        
        fonts.sort();
        fonts.dedup();
        
        Ok(serde_json::json!({ "success": true, "fonts": fonts }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "success": true, "fonts": [] }))
    }
}
