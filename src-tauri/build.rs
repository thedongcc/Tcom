/// build.rs — 构建时从 .env 文件读取环境变量并传递给 Cargo
fn main() {
    // 从 .env 文件读取环境变量（如 FEISHU_WEBHOOK_URL）
    if let Ok(content) = std::fs::read_to_string(".env") {
        for line in content.lines() {
            let line = line.trim();
            // 跳过空行和注释
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();
                // 通过 cargo:rustc-env 传递给编译器
                println!("cargo:rustc-env={}={}", key, value);
            }
        }
    }
    // 当 .env 文件变化时重新运行
    println!("cargo:rerun-if-changed=.env");

    tauri_build::build()
}
