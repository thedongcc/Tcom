/**
 * backup.rs
 * 备份/恢复 Commands — Profile 单独导出/导入 + 全量导出/导入。
 * 使用 zip crate 打包为 .zip 文件。
 */
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;
use zip::write::SimpleFileOptions;

/// Profile 根目录
fn profiles_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("profiles")
}

/// 全局设置路径
fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("settings.json")
}

/// 主题目录
fn themes_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("themes")
}

// ── 递归添加目录到 zip ──

fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let zip_path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };

        if path.is_dir() {
            add_dir_to_zip(zip, &path, &zip_path, options)?;
        } else if path.is_file() {
            let data = fs::read(&path).map_err(|e| e.to_string())?;
            zip.start_file(&zip_path, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ── 导出单个 Profile ──

#[tauri::command]
pub fn backup_export_profile(app: tauri::AppHandle, profile_name: String) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let profile_path = profiles_dir(&app).join(&profile_name);
    if !profile_path.exists() {
        return Err(format!("Profile \"{}\" 不存在", profile_name));
    }

    // 让用户选择保存位置
    let default_name = format!("{}.tcom-profile.zip", profile_name);
    let result = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Tcom Profile", &["zip"])
        .blocking_save_file();

    let save_path = match result {
        Some(p) => p.to_string(),
        None => return Ok(serde_json::json!({ "success": false, "canceled": true })),
    };

    // 创建 zip
    let file = fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    add_dir_to_zip(&mut zip, &profile_path, "", options)?;
    zip.finish().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "success": true, "path": save_path }))
}

// ── 导入 Profile ──

#[tauri::command]
pub fn backup_import_profile(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let result = app
        .dialog()
        .file()
        .add_filter("Tcom Profile", &["zip"])
        .blocking_pick_file();

    let zip_path = match result {
        Some(p) => p.to_string(),
        None => return Ok(serde_json::json!({ "success": false, "canceled": true })),
    };

    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // 从 zip 中读取 profile.json 确定名称
    let profile_name = {
        let meta = archive.by_name("profile.json");
        if let Ok(mut f) = meta {
            let mut content = String::new();
            f.read_to_string(&mut content).map_err(|e| e.to_string())?;
            let v: Value = serde_json::from_str(&content).unwrap_or_default();
            v.get("name")
                .and_then(|n| n.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "imported".to_string())
        } else {
            "imported".to_string()
        }
    };

    // 确定目标目录（如已存在则添加后缀）
    let base_dir = profiles_dir(&app);
    let mut target_name = profile_name.clone();
    let mut target_dir = base_dir.join(&target_name);
    let mut counter = 1;
    while target_dir.exists() {
        target_name = format!("{}-{}", profile_name, counter);
        target_dir = base_dir.join(&target_name);
        counter += 1;
    }

    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    // 解压所有文件
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        let out_path = target_dir.join(&name);
        if file.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut data = Vec::new();
            file.read_to_end(&mut data).map_err(|e| e.to_string())?;
            fs::write(&out_path, &data).map_err(|e| e.to_string())?;
        }
    }

    // 更新 profile.json 中的 name
    let meta_file = target_dir.join("profile.json");
    if meta_file.exists() {
        if let Ok(content) = fs::read_to_string(&meta_file) {
            if let Ok(mut meta) = serde_json::from_str::<Value>(&content) {
                meta["name"] = Value::String(target_name.clone());
                let _ = fs::write(
                    &meta_file,
                    serde_json::to_string_pretty(&meta).unwrap(),
                );
            }
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "profileName": target_name
    }))
}

// ── 一键全量导出 ──

#[tauri::command]
pub fn backup_export_all(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let result = app
        .dialog()
        .file()
        .set_file_name("tcom-backup.zip")
        .add_filter("Tcom Backup", &["zip"])
        .blocking_save_file();

    let save_path = match result {
        Some(p) => p.to_string(),
        None => return Ok(serde_json::json!({ "success": false, "canceled": true })),
    };

    let file = fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // 1. 所有 Profile
    add_dir_to_zip(&mut zip, &profiles_dir(&app), "profiles", options)?;

    // 2. 全局设置
    let settings = settings_path(&app);
    if settings.exists() {
        let data = fs::read(&settings).map_err(|e| e.to_string())?;
        zip.start_file("settings.json", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
    }

    // 3. 自定义主题
    add_dir_to_zip(&mut zip, &themes_dir(&app), "themes", options)?;

    zip.finish().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "success": true, "path": save_path }))
}

// ── 一键全量导入 ──

#[tauri::command]
pub fn backup_import_all(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let result = app
        .dialog()
        .file()
        .add_filter("Tcom Backup", &["zip"])
        .blocking_pick_file();

    let zip_path = match result {
        Some(p) => p.to_string(),
        None => return Ok(serde_json::json!({ "success": false, "canceled": true })),
    };

    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let app_data = app.path().app_data_dir().unwrap();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        // 安全检查：防止路径遍历
        if name.contains("..") {
            continue;
        }

        let out_path = app_data.join(&name);
        if file.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut data = Vec::new();
            file.read_to_end(&mut data).map_err(|e| e.to_string())?;
            fs::write(&out_path, &data).map_err(|e| e.to_string())?;
        }
    }

    Ok(serde_json::json!({ "success": true }))
}
