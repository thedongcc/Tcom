/**
 * ColorPickerApp.tsx
 * 独立颜色选择器窗口入口。
 * 支持从外部 init_update 事件唤醒复用（窗口常驻内存，避免重复创建）。
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ColorPickerContent } from './components/theme/ColorPickerShared';
import { SettingsProvider } from './context/SettingsContext';
import { I18nProvider } from './context/I18nContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';

/** 聚焦当前 Tauri 窗口 */
async function focusCurrentWindow() {
    window.focus();
    getCurrentWindow().setFocus().catch(() => {});
}

/** 初始化色彩选择器：读取初始颜色，注册失焦/键盘/唤醒事件 */
function useColorPickerSetup(
    setColor: (c: string) => void,
    setResetKey: React.Dispatch<React.SetStateAction<number>>,
    hasClosed: React.MutableRefObject<boolean>,
) {
    const hideSelf = useCallback(() => {
        if (hasClosed.current) return;
        hasClosed.current = true;
        emit('color_picker:closed').catch(() => {});
        invoke('color_picker_close').catch(() => {});
    }, [hasClosed]);

    useEffect(() => {
        // 初次 mount：主动抢取键盘焦点
        focusCurrentWindow();

        // 从 localStorage 读取初始颜色
        const init = localStorage.getItem('color_picker_init');
        if (init) setColor(init);

        // 点外面失焦关闭
        window.addEventListener('blur', hideSelf);

        // ESC / Enter 关闭
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); hideSelf(); }
            if (e.key === 'Enter' && (e.target as Element)?.tagName !== 'BUTTON') hideSelf();
        };
        window.addEventListener('keydown', onKey);

        // 监听外部唤醒事件，刷新颜色并重置关闭标志
        let unlisten: (() => void) | null = null;
        listen<string>('color_picker:init_update', (e) => {
            setColor(e.payload);
            setResetKey(k => k + 1); // 强制 ColorPickerContent 重挂载，清除吸管残留状态
            hasClosed.current = false;
            focusCurrentWindow();
        }).then(fn => { unlisten = fn; });

        return () => {
            window.removeEventListener('blur', hideSelf);
            window.removeEventListener('keydown', onKey);
            unlisten?.();
        };
    }, [hideSelf, setColor, setResetKey, hasClosed]);
}

export default function ColorPickerApp() {
    const [color, setColor] = useState('#000000');
    // hasClosed 用 useRef，就算组件不卸载也能被 init_update 正确重置
    const hasClosed = useRef(false);
    // resetKey：每次 init_update 递增，强制 ColorPickerContent 重挂载，清除 isPicking 等残留状态
    const [resetKey, setResetKey] = useState(0);

    // 初始化：聚焦、读取颜色、注册事件
    useColorPickerSetup(setColor, setResetKey, hasClosed);

    // 修复 Tauri 透明窗口模式下 body 默认深色背景导致的圆角外部黑边
    useEffect(() => {
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';
    }, []);

    const handleChange = (newColor: string) => {
        setColor(newColor);
        emit('color_picker:change', newColor).catch(() => {});
    };

    const handleClose = () => {
        emit('color_picker:closed').catch(() => {});
        invoke('color_picker_close').catch(() => {});
    };

    return (
        <ErrorBoundary>
            <SettingsProvider>
                <I18nProvider>
                    <div style={{ width: '100vw', height: '100vh', display: 'flex', boxSizing: 'border-box' }}>
                       <ColorPickerContent
                           key={resetKey}
                           value={color}
                           onChange={handleChange}
                           onClose={handleClose}
                           isStandalone={true}
                       />
                    </div>
                </I18nProvider>
            </SettingsProvider>
        </ErrorBoundary>
    );
}
