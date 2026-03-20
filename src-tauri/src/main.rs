// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 设置 Panic Hook — 拦截 Rust 闪退，写入崩溃标记文件
    let app_data = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.thedongcc.tcom");
    std::fs::create_dir_all(&app_data).ok();

    let crash_file = app_data.join(".crash_marker");
    std::panic::set_hook(Box::new(move |info| {
        let msg = format!("Rust Panic\n{}", info);
        std::fs::write(&crash_file, &msg).ok();
    }));

    app_lib::run();
}
