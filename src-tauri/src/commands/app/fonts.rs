/**
 * fonts.rs
 * 系统字体扫描与获取。
 */
use serde_json::Value;
use std::process::Command;

/// 枚举系统已安装字体
pub fn list_fonts() -> Result<Value, String> {
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
