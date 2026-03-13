/**
 * System Stats Monitor
 * 提供应用级别的 CPU 与内存占用情况计算。
 */

// App-specific resource stats (process-level, not system-wide)
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

export function getAppStats() {
    // Memory: app process memory
    const mem = process.memoryUsage();
    const memUsedMB = Math.round(mem.rss / 1024 / 1024); // Resident Set Size

    // CPU: app process CPU usage
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();

    const userTimeDiff = currentCpuUsage.user - lastCpuUsage.user;
    const sysTimeDiff = currentCpuUsage.system - lastCpuUsage.system;
    const totalMicroSecDiff = userTimeDiff + sysTimeDiff;

    const timeDiffMs = currentTime - lastCpuTime;
    const cpuPercent = timeDiffMs > 0
        ? Math.min(100, Math.round((totalMicroSecDiff / 1000) / timeDiffMs * 100))
        : 0;

    lastCpuUsage = currentCpuUsage;
    lastCpuTime = currentTime;

    return {
        cpu: cpuPercent,
        memUsed: memUsedMB,
    };
}
