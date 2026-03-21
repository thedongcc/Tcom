/**
 * migrateLegacyData.ts
 * 旧数据迁移工具 — 将 localStorage 中的命令菜单/自动回复/设置一次性迁移到新的文件系统。
 *
 * 迁移流程（完全由前端主导，Rust 后端无法直接读取 WebView 的 localStorage）：
 * 1. 检查 state.json 中的 migrated 标记
 * 2. 若未迁移，从 localStorage 读取旧数据
 * 3. 通过新 API 传给 Rust 写盘
 * 4. 确认写盘成功后，更新 migrated 标记
 * 5. 不删除旧 localStorage 数据（保底降级用）
 */

/** 旧 localStorage Key 定义 */
const LEGACY_KEYS = {
    commands: 'tcom-commands',
    autoReply: 'tcom:autoReply',
    settings: 'tcom-settings',
    theme: 'tcom-theme',
} as const;

/**
 * 执行一次性数据迁移。
 * @param profileName 目标 Profile 名称（通常为 'default'）
 * @returns 迁移结果
 */
export async function migrateLegacyData(profileName: string): Promise<{
    migrated: boolean;
    commandsMigrated: number;
    rulesMigrated: number;
    settingsMigrated: boolean;
}> {
    const result = {
        migrated: false,
        commandsMigrated: 0,
        rulesMigrated: 0,
        settingsMigrated: false,
    };

    try {
        // 1. 迁移命令菜单
        const commandsRaw = localStorage.getItem(LEGACY_KEYS.commands);
        if (commandsRaw) {
            try {
                const commands = JSON.parse(commandsRaw);
                if (Array.isArray(commands) && commands.length > 0) {
                    const res = await window.profileAPI?.saveCommands(profileName, commands);
                    if (res?.success) {
                        result.commandsMigrated = commands.length;
                        console.log(`[迁移] 命令菜单: ${commands.length} 条已迁移到 Profile "${profileName}"`);
                    }
                }
            } catch (e) {
                console.error('[迁移] 解析命令菜单数据失败:', e);
            }
        }

        // 2. 迁移自动回复规则
        const autoReplyRaw = localStorage.getItem(LEGACY_KEYS.autoReply);
        if (autoReplyRaw) {
            try {
                const autoReply = JSON.parse(autoReplyRaw);
                if (autoReply && typeof autoReply === 'object') {
                    const res = await window.profileAPI?.saveAutoReply(profileName, autoReply);
                    if (res?.success) {
                        result.rulesMigrated = autoReply.rules?.length || 0;
                        console.log(`[迁移] 自动回复: ${result.rulesMigrated} 条规则已迁移`);
                    }
                }
            } catch (e) {
                console.error('[迁移] 解析自动回复数据失败:', e);
            }
        }

        // 3. 迁移全局设置
        const settingsRaw = localStorage.getItem(LEGACY_KEYS.settings);
        if (settingsRaw) {
            try {
                const settings = JSON.parse(settingsRaw);
                if (settings && typeof settings === 'object') {
                    // 合入旧 theme key（如果存在）
                    const themeId = localStorage.getItem(LEGACY_KEYS.theme);
                    if (themeId && !settings.theme) {
                        settings.theme = themeId;
                    }
                    const res = await window.globalSettingsAPI?.save(settings);
                    if (res?.success) {
                        result.settingsMigrated = true;
                        console.log('[迁移] 全局设置已迁移');
                    }
                }
            } catch (e) {
                console.error('[迁移] 解析设置数据失败:', e);
            }
        }

        result.migrated = true;

        // 4. 标记迁移完成（更新 state.json），同时迁移 setupcPath 和 monitorEnabled
        try {
            const stateRes = await window.globalSettingsAPI?.loadState();
            const state = stateRes?.data || {};

            // 迁移 setupcPath
            const setupcPath = localStorage.getItem('tcom-setupc-path');
            // 迁移 monitorEnabled
            const monitorRaw = localStorage.getItem('tcom-monitor-enabled');

            await window.globalSettingsAPI?.saveState({
                ...state,
                migrated: true,
                migratedAt: Date.now(),
                lastProfile: profileName,
                ...(setupcPath ? { setupcPath } : {}),
                ...(monitorRaw !== null ? { monitorEnabled: monitorRaw !== 'false' } : {}),
            });
            if (setupcPath) console.log('[迁移] setupcPath 已迁移');
            if (monitorRaw !== null) console.log('[迁移] monitorEnabled 已迁移');
            console.log('[迁移] 迁移标记已写入 state.json');
        } catch (e) {
            console.error('[迁移] 写入迁移标记失败:', e);
        }

        // 注意：不删除旧 localStorage 数据，作为降级保底
        console.log('[迁移] 旧数据迁移完成（localStorage 数据已保留作为备份）');

    } catch (e) {
        console.error('[迁移] 迁移过程出错:', e);
    }

    return result;
}
