import { useState, useEffect, useCallback } from 'react';
import { componentTokenMap } from '../../themes/componentTokenMap';

export const useThemeInspector = (onClose: () => void) => {
    const [isInspecting, setIsInspecting] = useState(false);
    const [lastPickedVars, setLastPickedVars] = useState<string[]>([]);
    const [cdpDebugData, setCdpDebugData] = useState<{ compKey: string | null, className: string, outerHTML: string } | null>(null);

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

    // ── CDP 检查器监听 ──
    const extractVars = useCallback((html: string, compKey?: string | null) => {
        const registeredVars = new Set<string>();
        for (const group of Object.values(componentTokenMap)) {
            group.tokens.forEach(t => registeredVars.add(t.var));
        }

        const vars = new Set<string>();

        const regex = /var\((--[\w][\w-]*)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const varName = match[1].trim();
            if (registeredVars.has(varName)) vars.add(varName);
        }

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

    // ── 控制 ──
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

    return {
        isInspecting,
        lastPickedVars,
        cdpDebugData,
        setCdpDebugData,
        extractVars,
        startInspect,
        stopInspect
    };
};
