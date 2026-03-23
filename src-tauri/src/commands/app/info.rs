/**
 * info.rs
 * 应用信息 — 版本查询、系统统计、管理员检测、恢复出厂。
 */
use serde_json::Value;
use std::process::Command;

/// 获取应用版本号
pub fn get_version(app: &tauri::AppHandle) -> Result<String, String> {
    let version = app.config().version.clone().unwrap_or_else(|| "0.0.2".into());
    Ok(version)
}

/// 获取应用统计信息（CPU 占用率 + 内存占用 + GPU 显存）
pub fn get_stats() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use std::mem;
        use std::sync::Mutex;

        // 用于保存上次 CPU 采样数据
        struct CpuSample {
            kernel_time: u64,
            user_time: u64,
            wall_time: u64,
        }

        static LAST_SAMPLE: Mutex<Option<CpuSample>> = Mutex::new(None);

        // 扩展版内存计数器（包含 PrivateUsage）
        #[repr(C)]
        #[allow(non_snake_case)]
        struct PROCESS_MEMORY_COUNTERS_EX {
            cb: u32,
            PageFaultCount: u32,
            PeakWorkingSetSize: usize,
            WorkingSetSize: usize,
            QuotaPeakPagedPoolUsage: usize,
            QuotaPagedPoolUsage: usize,
            QuotaPeakNonPagedPoolUsage: usize,
            QuotaNonPagedPoolUsage: usize,
            PagefileUsage: usize,
            PeakPagefileUsage: usize,
            PrivateUsage: usize,
        }

        #[repr(C)]
        #[derive(Default)]
        #[allow(non_snake_case)]
        struct FILETIME {
            dwLowDateTime: u32,
            dwHighDateTime: u32,
        }

        extern "system" {
            fn GetCurrentProcess() -> isize;
            fn K32GetProcessMemoryInfo(
                process: isize,
                ppsmemCounters: *mut PROCESS_MEMORY_COUNTERS_EX,
                cb: u32,
            ) -> i32;
            fn GetProcessTimes(
                hProcess: isize,
                lpCreationTime: *mut FILETIME,
                lpExitTime: *mut FILETIME,
                lpKernelTime: *mut FILETIME,
                lpUserTime: *mut FILETIME,
            ) -> i32;
            fn GetSystemTimeAsFileTime(lpSystemTimeAsFileTime: *mut FILETIME);
        }

        // 将 FILETIME 转换为 u64（100 纳秒单位）
        fn filetime_to_u64(ft: &FILETIME) -> u64 {
            ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64)
        }

        // --- 获取内存（专用工作集，与任务管理器一致） ---
        let mut pmc: PROCESS_MEMORY_COUNTERS_EX = unsafe { mem::zeroed() };
        pmc.cb = mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;

        let mem_used = unsafe {
            let process = GetCurrentProcess();
            if K32GetProcessMemoryInfo(process, &mut pmc, pmc.cb) != 0 {
                // PrivateUsage = 任务管理器的"内存(专用工作集)"
                (pmc.PrivateUsage as f64 / 1024.0 / 1024.0).round() as u64
            } else {
                0
            }
        };

        // --- 获取 CPU ---
        let cpu_percent = unsafe {
            let process = GetCurrentProcess();
            let mut creation = FILETIME::default();
            let mut exit = FILETIME::default();
            let mut kernel = FILETIME::default();
            let mut user = FILETIME::default();
            let mut now_ft = FILETIME::default();

            if GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user) != 0 {
                GetSystemTimeAsFileTime(&mut now_ft);

                let current_kernel = filetime_to_u64(&kernel);
                let current_user = filetime_to_u64(&user);
                let current_wall = filetime_to_u64(&now_ft);

                let mut guard = LAST_SAMPLE.lock().unwrap();
                let cpu = if let Some(prev) = guard.as_ref() {
                    let cpu_delta = (current_kernel + current_user)
                        .saturating_sub(prev.kernel_time + prev.user_time);
                    let wall_delta = current_wall.saturating_sub(prev.wall_time);
                    if wall_delta > 0 {
                        // 除以逻辑 CPU 核心数，得到占用百分比
                        let num_cpus = std::thread::available_parallelism()
                            .map(|n| n.get() as f64)
                            .unwrap_or(1.0);
                        let pct = (cpu_delta as f64 / wall_delta as f64 / num_cpus * 100.0).round();
                        pct.min(100.0) as u64
                    } else {
                        0
                    }
                } else {
                    0
                };

                *guard = Some(CpuSample {
                    kernel_time: current_kernel,
                    user_time: current_user,
                    wall_time: current_wall,
                });

                cpu
            } else {
                0
            }
        };

        Ok(serde_json::json!({
            "cpu": cpu_percent,
            "memUsed": mem_used
        }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "cpu": 0, "memUsed": 0 }))
    }
}


/// 检测当前是否以管理员权限运行
pub fn is_admin() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("net")
            .arg("session")
            .output();
        Ok(output.map(|o| o.status.success()).unwrap_or(false))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// 恢复出厂设置
pub fn factory_reset(app: &tauri::AppHandle) -> Result<Value, String> {
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let flag_path = data_dir.parent()
        .map(|p| p.join(".reset-pending"))
        .ok_or("Cannot determine parent directory")?;

    std::fs::write(&flag_path, "1").map_err(|e| e.to_string())?;
    app.restart();
}

/// 检测幽灵串口 — 设备已拔出但端口号仍被系统占用
pub fn list_ghost_ports() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

        // 1. 读取 SERIALCOMM 获取当前活跃的 COM 端口
        let mut active_ports: std::collections::HashSet<u32> = std::collections::HashSet::new();
        if let Ok(serialcomm) = hklm.open_subkey_with_flags(
            r"HARDWARE\DEVICEMAP\SERIALCOMM", KEY_READ
        ) {
            for value_result in serialcomm.enum_values() {
                if let Ok((name, _)) = value_result {
                    if let Ok(port_name) = serialcomm.get_value::<String, _>(&name) {
                        if let Some(num_str) = port_name.strip_prefix("COM").or_else(|| port_name.strip_prefix("com")) {
                            if let Ok(num) = num_str.parse::<u32>() {
                                active_ports.insert(num);
                            }
                        }
                    }
                }
            }
        }

        // 2. 读取 ComDB 位图获取所有已分配的 COM 端口号
        let mut allocated_ports: std::collections::HashSet<u32> = std::collections::HashSet::new();
        if let Ok(arbiter) = hklm.open_subkey_with_flags(
            r"SYSTEM\CurrentControlSet\Control\COM Name Arbiter", KEY_READ
        ) {
            if let Ok(comdb) = arbiter.get_raw_value("ComDB") {
                for (byte_idx, &byte) in comdb.bytes.iter().enumerate() {
                    for bit in 0..8u32 {
                        if byte & (1 << bit) != 0 {
                            let port_num = (byte_idx as u32) * 8 + bit + 1;
                            allocated_ports.insert(port_num);
                        }
                    }
                }
            }
        }

        // 3. 差集 = 幽灵端口
        let ghost_ports: Vec<String> = allocated_ports
            .difference(&active_ports)
            .filter(|&&num| num <= 255)
            .map(|&num| format!("COM{}", num))
            .collect();

        Ok(serde_json::json!({ "success": true, "ghostPorts": ghost_ports }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({ "success": true, "ghostPorts": [] }))
    }
}
