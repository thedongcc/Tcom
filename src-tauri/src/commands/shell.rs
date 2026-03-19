/**
 * shell.rs
 * Shell Commands — 打开外部链接、文件选择对话框。
 * 使用 tauri-plugin-shell 和 tauri-plugin-dialog。
 */
use serde_json::Value;

#[tauri::command]
pub fn shell_open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shell_show_open_dialog(app: tauri::AppHandle, options: Value) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file();

    // 解析 properties
    let properties = options.get("properties")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let is_directory = properties.iter().any(|p| p.as_str() == Some("openDirectory"));

    // 解析 title
    if let Some(title) = options.get("title").and_then(|v| v.as_str()) {
        dialog = dialog.set_title(title);
    }

    // 解析 filters
    if let Some(filters) = options.get("filters").and_then(|v| v.as_array()) {
        for filter in filters {
            if let (Some(name), Some(exts)) = (
                filter.get("name").and_then(|v| v.as_str()),
                filter.get("extensions").and_then(|v| v.as_array()),
            ) {
                let extensions: Vec<&str> = exts
                    .iter()
                    .filter_map(|e| e.as_str())
                    .collect();
                dialog = dialog.add_filter(name, &extensions);
            }
        }
    }

    if is_directory {
        let result = dialog.blocking_pick_folder();
        match result {
            Some(path) => Ok(serde_json::json!({
                "canceled": false,
                "filePaths": [path.to_string()]
            })),
            None => Ok(serde_json::json!({
                "canceled": true,
                "filePaths": []
            })),
        }
    } else {
        let result = dialog.blocking_pick_file();
        match result {
            Some(path) => Ok(serde_json::json!({
                "canceled": false,
                "filePaths": [path.to_string()]
            })),
            None => Ok(serde_json::json!({
                "canceled": true,
                "filePaths": []
            })),
        }
    }
}
