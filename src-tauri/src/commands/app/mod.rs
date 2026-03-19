/**
 * app/mod.rs
 * 应用级 Commands 门面层 — 版本/统计/字体/com0com。
 *
 * 子模块：
 * - info.rs — 版本查询、统计、管理员检测、出厂重置、幽灵端口
 * - fonts.rs — 系统字体扫描
 * - com0com.rs — Windows 虚拟串口驱动管理
 */
mod info;
mod fonts;
mod com0com;

use serde_json::Value;

#[tauri::command]
pub fn app_get_version(app: tauri::AppHandle) -> Result<String, String> {
    info::get_version(&app)
}

#[tauri::command]
pub fn app_get_stats() -> Result<Value, String> {
    info::get_stats()
}

#[tauri::command]
pub fn app_is_admin() -> Result<bool, String> {
    info::is_admin()
}

#[tauri::command]
pub fn app_list_fonts() -> Result<Value, String> {
    fonts::list_fonts()
}

#[tauri::command]
pub fn app_factory_reset(app: tauri::AppHandle) -> Result<Value, String> {
    info::factory_reset(&app)
}

#[tauri::command]
pub fn serial_list_ghost_ports() -> Result<Value, String> {
    info::list_ghost_ports()
}

#[tauri::command]
pub fn com0com_list_pairs() -> Result<Value, String> {
    com0com::list_pairs()
}

#[tauri::command]
pub fn com0com_exec(command: String, _silent: bool) -> Result<Value, String> {
    com0com::exec_command(command)
}

#[tauri::command]
pub fn com0com_install() -> Result<Value, String> {
    com0com::install_pair()
}

#[tauri::command]
pub fn com0com_set_friendly_name(port: String, name: String) -> Result<Value, String> {
    com0com::set_friendly_name(port, name)
}

#[tauri::command]
pub fn com0com_check_path(path: String) -> Result<Value, String> {
    com0com::check_path(path)
}

#[tauri::command]
pub fn com0com_launch_installer() -> Result<Value, String> {
    com0com::launch_installer()
}
