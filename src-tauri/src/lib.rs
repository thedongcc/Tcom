/**
 * lib.rs
 * Tauri v2 应用入口 — 模块化 Command 注册 + 插件初始化。
 * ⚠️ 铁律：本文件禁止编写任何业务逻辑，仅做 Plugin/State/Command 注册。
 *
 * 子模块（全部真实实现）：
 * - commands/serial.rs — 串口扫描/连接/读写/定时发送
 * - commands/mqtt.rs — MQTT 客户端
 * - commands/monitor.rs — 虚拟串口监控（双向桥接）
 * - commands/tcp.rs — TCP 服务器
 * - commands/workspace.rs — 工作区/会话 CRUD
 * - commands/theme.rs — 主题管理 + 编辑器状态
 * - commands/app.rs — 应用级功能 + com0com
 * - commands/shell.rs — 外部链接 + 文件对话框
 * - commands/window.rs — 窗口管理（置顶控制）
 * - commands/updater.rs — 应用更新（占位）
 */

mod commands;

use commands::monitor::MonitorState;
use commands::mqtt::MqttState;
use commands::serial::SerialState;
use commands::tcp::TcpState;
use commands::theme::ThemeEditorState;

// ─── Tauri 应用入口 ───────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ThemeEditorState::default())
        .manage(SerialState::default())
        .manage(MqttState::default())
        .manage(MonitorState::default())
        .manage(TcpState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 串口
            commands::serial::serial_list_ports,
            commands::serial::serial_open,
            commands::serial::serial_close,
            commands::serial::serial_write,
            commands::serial::serial_timed_send_start,
            commands::serial::serial_timed_send_stop,
            commands::serial::serial_timed_send_start_dynamic,
            // MQTT
            commands::mqtt::mqtt_connect,
            commands::mqtt::mqtt_disconnect,
            commands::mqtt::mqtt_publish,
            commands::mqtt::mqtt_subscribe,
            commands::mqtt::mqtt_unsubscribe,
            // 监控
            commands::monitor::monitor_start,
            commands::monitor::monitor_stop,
            commands::monitor::monitor_write,
            // TCP
            commands::tcp::tcp_start,
            commands::tcp::tcp_stop,
            commands::tcp::tcp_write,
            // 工作区
            commands::workspace::workspace_get_last,
            commands::workspace::workspace_set_last,
            commands::workspace::workspace_open_folder,
            commands::workspace::workspace_list_sessions,
            commands::workspace::workspace_save_session,
            commands::workspace::workspace_delete_session,
            commands::workspace::workspace_rename_session,
            commands::workspace::workspace_get_recent,
            commands::workspace::workspace_migrate_old,
            commands::workspace::workspace_save_session_order,
            commands::workspace::session_save,
            commands::workspace::session_load,
            // 应用
            commands::app::app_get_version,
            commands::app::app_get_stats,
            commands::app::app_is_admin,
            commands::app::app_list_fonts,
            commands::app::app_factory_reset,
            commands::app::serial_list_ghost_ports,
            commands::app::com0com_list_pairs,
            commands::app::com0com_exec,
            commands::app::com0com_install,
            commands::app::com0com_set_friendly_name,
            commands::app::com0com_check_path,
            commands::app::com0com_launch_installer,
            // Shell
            commands::shell::shell_open_external,
            commands::shell::shell_show_open_dialog,
            // 窗口
            commands::window::window_set_always_on_top,
            commands::window::window_is_always_on_top,
            // 更新（占位）
            commands::updater::update_check,
            commands::updater::update_download,
            commands::updater::update_install,
            // 主题
            commands::theme::theme_load_all,
            commands::theme::theme_open_folder,
            commands::theme::theme_open_file,
            commands::theme::theme_editor_open,
            commands::theme::theme_editor_close,
            commands::theme::theme_editor_is_open,
            commands::theme::theme_editor_save,
            commands::theme::theme_editor_preview,
            commands::theme::theme_editor_get_pending,
            commands::theme::theme_editor_get_all_pending,
            commands::theme::theme_editor_clear_all_pending,
            commands::theme::theme_editor_set_pending,
            commands::theme::theme_editor_start_inspector,
            commands::theme::theme_editor_stop_inspector,
            commands::theme::theme_editor_component_picked,
            commands::theme::theme_editor_get_expanded_groups,
            commands::theme::theme_editor_set_expanded_groups,
            commands::theme::theme_editor_init_data,
            commands::theme::eyedropper_pick,
            commands::theme::eyedropper_watch_start,
            commands::theme::eyedropper_watch_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
