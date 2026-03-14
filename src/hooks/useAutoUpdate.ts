/**
 * useAutoUpdate.ts
 * 自动更新 Hook：30 分钟轮询检查 + 状态栏提示（不自动弹窗）。
 */
import { useState, useEffect, useCallback } from 'react';

// 轮询间隔：30 分钟
const POLL_INTERVAL_MS = 30 * 60 * 1000;

export const useAutoUpdate = () => {
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [hasUpdate, setHasUpdate] = useState(false);
    const [updateVersion, setUpdateVersion] = useState('');

    useEffect(() => {
        // 版本跳变检测（从旧版本升级后首次启动时触发）
        const checkVersionJump = async () => {
            const currentVersion = await window.updateAPI.getVersion();
            const lastVersion = localStorage.getItem('app_last_version');
            if (lastVersion && currentVersion !== lastVersion) {
                // 版本发生变化，可在未来扩展展示更新日志
            }
            localStorage.setItem('app_last_version', currentVersion);
        };
        checkVersionJump();

        // 监听主进程更新状态推送
        const removeStatusListener = window.updateAPI.onStatus((data: any) => {
            if (data.type === 'available') {
                setHasUpdate(true);
                setUpdateVersion(data.version);
                // 不自动弹窗，仅更新状态栏
            }
        });

        // 30 分钟轮询检查更新（不在启动时立即检查）
        const intervalId = setInterval(() => {
            window.updateAPI.check().catch(() => { });
        }, POLL_INTERVAL_MS);

        return () => {
            removeStatusListener();
            clearInterval(intervalId);
        };
    }, []);

    // 手动触发检查更新（点击状态栏图标时调用）
    const checkForUpdates = useCallback(() => {
        if (hasUpdate) {
            // 已有更新，直接弹窗
            setShowUpdateDialog(true);
        } else {
            // 无更新，先触发检查再弹窗
            setShowUpdateDialog(true);
            window.updateAPI.check().catch(() => { });
        }
    }, [hasUpdate]);

    return {
        showUpdateDialog,
        setShowUpdateDialog,
        hasUpdate,
        updateVersion,
        checkForUpdates,
    };
};
