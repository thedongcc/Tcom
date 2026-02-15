import { useState, useEffect, useCallback } from 'react';

export const useAutoUpdate = () => {
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [hasUpdate, setHasUpdate] = useState(false);
    const [updateVersion, setUpdateVersion] = useState('');

    useEffect(() => {
        // Version checking for post-update changelog
        const checkVersionJump = async () => {
            const currentVersion = await window.updateAPI.getVersion();
            const lastVersion = localStorage.getItem('app_last_version');

            if (lastVersion && currentVersion !== lastVersion) {
                // Version changed, show what's new (in a future improvement we can fetch notes)
                // For now, we trigger the dialog which will check for updates or just show "Current Version"
                // Actually, let's just mark that we should show a "Welcome" or something.
                // But the user wants a changelog.
                setShowUpdateDialog(true);
            }
            localStorage.setItem('app_last_version', currentVersion);
        };

        checkVersionJump();

        const removeStatusListener = window.updateAPI.onStatus((data) => {

            if (data.type === 'available') {
                setHasUpdate(true);
                setUpdateVersion(data.version);
                // Automatically show dialog if found
                setShowUpdateDialog(true);
            }
        });

        // Silent check on startup
        window.updateAPI.check().catch(() => {
            // Silently ignore errors on startup check
        });

        return () => removeStatusListener();
    }, []);

    const checkForUpdates = useCallback(() => {
        setShowUpdateDialog(true);
    }, []);

    return {
        showUpdateDialog,
        setShowUpdateDialog,
        hasUpdate,
        updateVersion,
        checkForUpdates
    };
};
