/**
 * useThemeEditorState.ts
 * 主题编辑器状态管理 Hook — Inspector 模式、初始化、颜色变更、保存/取消。
 * 从 ThemeColorEditor.tsx 中拆分出来。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { throttledIpcSync } from './ThemeTokenRow';
import { componentTokenMap } from '../../themes/componentTokenMap';

/** 将 rgb(r, g, b) / rgba(r, g, b, a) 格式转为 #hex，防止颜色选择器崩溃 */
const rgbToHex = (rgb: string): string => {
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgb; // 已经是 hex 或 var，直接返回
    const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
};

interface UseThemeEditorStateParams {
    isOpen: boolean;
    onClose: () => void;
}

export const useThemeEditorState = ({ isOpen, onClose }: UseThemeEditorStateParams) => {
    const { availableThemes, config, loadThemes } = useSettings();
    const [allEdits, setAllEdits] = useState<Record<string, Record<string, string>>>({});
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [isInspecting, setIsInspecting] = useState(false);
    const [copiedVar, setCopiedVar] = useState<string | null>(null);
    const [lastPickedVars, setLastPickedVars] = useState<string[]>([]);
    const [cdpDebugData, setCdpDebugData] = useState<{ compKey: string | null, className: string, outerHTML: string } | null>(null);
    const lastAppliedEditsRef = useRef<Record<string, string>>({});
    const previousThemeId = useRef<string | null>(null);
    const initDone = useRef(false);

    // 派生状态
    const currentThemeId = config.theme || localStorage.getItem('tcom-theme') || 'dark';
    const currentThemeDef = availableThemes.find(t => t.id === currentThemeId);
    const edits: Record<string, string> = allEdits[currentThemeId] || {};
    const editCount = Object.values(allEdits).reduce((sum, m) => sum + Object.keys(m).length, 0);

    // ── 键盘事件 + Inspector 监听 ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isInspecting) {
                    setIsInspecting(false);
                    window.themeAPI?.stopInspector?.();
                } else {
                    onClose();
                }
            }
        };
        const unInspectorStop = window.themeAPI?.onInspectorStopped?.(() => {
            setIsInspecting(false);
        });
        const unInspectorStart = window.themeAPI?.onInspectorStarted?.(() => {
            setIsInspecting(true);
        });

        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            unInspectorStart?.();
            unInspectorStop?.();
        };
    }, [isInspecting, onClose]);

    // ── 初始化：获取 expandedGroups + pendingEdits ──
    useEffect(() => {
        const api = window.themeAPI;
        if (!api?.initData) {
            api?.getExpandedGroups?.().then((groups: Record<string, boolean>) => {
                if (groups && Object.keys(groups).length > 0) setExpandedGroups(groups);
            });
            return;
        }
        api.initData().then(({ pendingEdits, expandedGroups: savedGroups }: { pendingEdits: Record<string, Record<string, string>>, expandedGroups: Record<string, boolean> }) => {
            if (savedGroups && Object.keys(savedGroups).length > 0) {
                setExpandedGroups(savedGroups);
            }
            initDone.current = true;
            if (pendingEdits && Object.keys(pendingEdits).length > 0) {
                setAllEdits(pendingEdits);
                const currentId = localStorage.getItem('tcom-theme') || 'dark';
                const themeEdits = pendingEdits[currentId] || {};
                lastAppliedEditsRef.current = { ...themeEdits };
                Object.entries(themeEdits).forEach(([varName, color]) => {
                    document.documentElement.style.setProperty(varName, color);
                });
                if (Object.keys(themeEdits).length > 0) {
                    api?.applyPreview?.(themeEdits);
                }
            }
        });
    }, []);

    // 同步 expandedGroups 到主进程（包括空对象，允许全部折叠持久化）
    useEffect(() => {
        if (initDone.current) {
            window.themeAPI?.setExpandedGroups?.(expandedGroups);
        }
    }, [expandedGroups]);

    // 默认展开 + 加载主题（仅在初始化完成后且确实没有保存状态时使用默认值）
    useEffect(() => {
        if (isOpen && initDone.current && Object.keys(expandedGroups).length === 0) {
            setExpandedGroups({ 'global-variables': true });
        }
        if (isOpen && availableThemes.length === 0) {
            loadThemes();
        }
    }, [isOpen]);

    // 主题切换时重新排布内联变量
    useEffect(() => {
        if (!isOpen) {
            previousThemeId.current = null;
            return;
        }
        if (currentThemeDef) {
            if (previousThemeId.current !== null && previousThemeId.current !== currentThemeDef.id) {
                Object.keys(lastAppliedEditsRef.current).forEach(varName => {
                    document.documentElement.style.removeProperty(varName);
                });
                const themeEdits = allEdits[currentThemeDef.id] || {};
                lastAppliedEditsRef.current = { ...themeEdits };
                Object.entries(themeEdits).forEach(([varName, color]) => {
                    document.documentElement.style.setProperty(varName, color);
                });
                window.themeAPI?.applyPreview?.(themeEdits);
            }
            previousThemeId.current = currentThemeDef.id;
        }
    }, [isOpen, currentThemeDef?.id, allEdits]);

    // ── CDP 检查器监听 ──
    const extractVars = useCallback((html: string, compKey?: string | null) => {
        const vars = new Set<string>();

        // 1. 从 HTML 字符串中正则提取 var(--xxx)
        const regex = /var\((--[^),]+)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            vars.add(match[1].trim());
        }

        // 2. 如果有 data-component key，从 componentTokenMap 中获取该组件全部变量
        if (compKey && componentTokenMap[compKey]) {
            componentTokenMap[compKey].tokens.forEach(t => vars.add(t.var));
        }

        return Array.from(vars);
    }, []);

    useEffect(() => {
        const unsub = window.themeAPI?.onComponentPicked?.((data) => {
            setCdpDebugData(data);
            setLastPickedVars(extractVars(data.outerHTML, data.compKey));
            setTimeout(() => setLastPickedVars([]), 2000);
        });
        return () => { unsub?.(); };
    }, [extractVars]);

    // ── Inspector 控制 ──
    const startInspect = useCallback(() => {
        setIsInspecting(true);
        window.themeAPI?.startInspectorMode?.();
    }, []);

    const stopInspect = useCallback(() => {
        if (isInspecting) {
            setIsInspecting(false);
                window.themeAPI?.stopInspectorMode?.();
        }
    }, [isInspecting]);

    // 关闭时清理
    useEffect(() => {
        if (!isOpen) {
            stopInspect();
            window.themeAPI?.applyPreview?.({});
            Object.keys(lastAppliedEditsRef.current).forEach(varName => {
                document.documentElement.style.removeProperty(varName);
            });
            setAllEdits({});
            lastAppliedEditsRef.current = {};
            window.themeAPI?.clearAllPendingEdits?.();
        }
    }, [isOpen, stopInspect]);

    // ── 颜色操作 ──
    const getColorValue = useCallback((varName: string) => {
        if (edits[varName]) return edits[varName];
        if (currentThemeDef?.colors?.[varName]) return currentThemeDef.colors[varName];
        if (typeof window !== 'undefined') {
            const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            if (val && val !== 'transparent' && val !== 'rgba(0, 0, 0, 0)') {
                // 必须转换：getComputedStyle 返回 rgb() 格式，颜色选择器需要 #hex
                return rgbToHex(val);
            }
        }
        return '#808080';
    }, [edits, currentThemeDef]);

    const handleColorChange = useCallback((varName: string, color: string) => {
        const themeId = currentThemeDef?.id || config.theme || 'dark';
        if (!varName.startsWith('--')) return;

        const colorStr = String(color);
        const newEditsForTheme = { ...(allEdits[themeId] || {}), [varName]: colorStr };

        setAllEdits(prev => ({ ...prev, [themeId]: newEditsForTheme }));
        lastAppliedEditsRef.current = { ...lastAppliedEditsRef.current, [varName]: colorStr };
        document.documentElement.style.setProperty(varName, colorStr);
        throttledIpcSync(themeId, newEditsForTheme);
    }, [allEdits, currentThemeDef, config.theme]);

    const handleSave = useCallback(async () => {
        if (editCount === 0) return;
        if (!window.themeAPI) return;

        let hasError = false;
        for (const themeId of Object.keys(allEdits)) {
            const themeEdits = allEdits[themeId];
            if (Object.keys(themeEdits).length === 0) continue;

            const def = availableThemes.find(t => t.id === themeId);
            if (def) {
                const updatedThemeDef = { ...def, colors: { ...def.colors, ...themeEdits } };
                const res = await window.themeAPI!.save!(themeId, updatedThemeDef);
                if (!res.success) {
                    alert(`保存主题 ${def.name} 失败: ${res.error}`);
                    hasError = true;
                }
            }
        }

        if (!hasError) {
            loadThemes();
            onClose();
        }
    }, [editCount, allEdits, availableThemes, loadThemes, onClose]);

    const handleCancel = useCallback(async () => {
        if (window.themeAPI) {
            // 先发送颜色恢复事件，等待 emit 完成
            await window.themeAPI.applyPreview?.({});
            window.themeAPI.setPendingEdits?.(currentThemeDef?.id || config.theme || 'dark', null);
            window.themeAPI.clearAllPendingEdits?.();
        }
        // 延迟关闭，确保主窗口有时间处理恢复事件
        setTimeout(() => onClose(), 150);
    }, [currentThemeDef, config.theme, onClose]);

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedVar(text);
        setTimeout(() => setCopiedVar(null), 1500);
    }, []);

    return {
        availableThemes,
        config,
        allEdits,
        expandedGroups,
        setExpandedGroups,
        isInspecting,
        copiedVar,
        lastPickedVars,
        cdpDebugData,
        setCdpDebugData,
        currentThemeDef,
        edits,
        editCount,
        getColorValue,
        handleColorChange,
        handleSave,
        handleCancel,
        handleCopy,
        startInspect,
        extractVars,
    };
};
