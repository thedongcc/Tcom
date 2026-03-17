/**
 * useSettingsActions.ts
 * 设置编辑器的操作函数集合。
 * 从 SettingsEditor.tsx 中拆分出来。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useI18n } from '../../context/I18nContext';

// 等宽字体关键词
const MONO_KEYWORDS = ['mono', 'console', 'code', 'courier', 'fixed', 'terminal'];

export const useSettingsActions = () => {
    const { config: _config, resetConfig, importConfig, exportConfig } = useSettings();
    const { confirm } = useConfirm();
    const { t } = useI18n();
    const [systemFonts, setSystemFonts] = useState<string[]>([]);

    // 加载系统字体列表
    useEffect(() => {
        window.updateAPI?.listFonts?.().then((res: { success: boolean; fonts?: string[] }) => {
            if (res?.success && Array.isArray(res.fonts)) {
                setSystemFonts(res.fonts);
            }
        }).catch(() => { /* 忽略错误，使用预设列表 */ });
    }, []);

    // 导入配置文件
    const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => {
                if (ev.target?.result) importConfig(ev.target.result as string);
            };
            reader.readAsText(file);
        }
    }, [importConfig]);

    // 导出配置文件
    const handleDownload = useCallback(() => {
        const json = exportConfig();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tcom-settings.json';
        a.click();
        URL.revokeObjectURL(url);
    }, [exportConfig]);

    // 重置确认
    const handleReset = useCallback(async () => {
        const ok = await confirm({
            title: t('settings.resetTitle'),
            message: t('settings.resetMessage'),
            confirmText: t('settings.resetConfirm'),
            cancelText: t('common.cancel'),
            type: 'warning',
        });
        if (ok) resetConfig();
    }, [confirm, t, resetConfig]);

    // 工厂重置
    const performFactoryReset = useCallback(async () => {
        try {
            if (!window.appAPI) {
                alert('appAPI 未定义，请完全重启应用以加载最新的主进程和预加载脚本！\nappAPI is undefined, please restart the app fully.');
                return;
            }
            const res = await window.appAPI.factoryReset();
            if (res && res.success === false) {
                alert('重置失败 (Reset Failed):\n' + res.error);
            }
        } catch (e: any) {
            console.error(e);
            alert('重置期间发生异常:\n' + e.message);
        }
    }, []);

    // 构建字体列表
    const finalFontList = useMemo(() => {
        const fontFamilyPresets = [
            { label: '-- Built-in --', value: '', disabled: true },
            { label: '内嵌字体 (Default)', value: 'AppCoreFont' },
        ];

        const monoFonts: { label: string; value: string }[] = [];
        const propFonts: { label: string; value: string }[] = [];

        systemFonts.forEach(f => {
            const lowerF = f.toLowerCase();
            const item = { label: f, value: `"${f}"` };
            if (MONO_KEYWORDS.some(kw => lowerF.includes(kw))) {
                monoFonts.push(item);
            } else {
                propFonts.push(item);
            }
        });

        return [
            ...fontFamilyPresets,
            ...(monoFonts.length > 0 ? [{ label: '-- Monospaced --', value: '', disabled: true }, ...monoFonts] : []),
            ...(propFonts.length > 0 ? [{ label: '-- Proportional --', value: '', disabled: true }, ...propFonts] : [])
        ];
    }, [systemFonts]);

    return {
        handleImport, handleDownload, handleReset, performFactoryReset,
        finalFontList,
    };
};
