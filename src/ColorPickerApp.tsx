import { useEffect, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ColorPickerContent } from './components/theme/ColorPickerShared';
import { SettingsProvider } from './context/SettingsContext';
import { I18nProvider } from './context/I18nContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export default function ColorPickerApp() {
    const [color, setColor] = useState('#000000');
    // hasClosed 用 useRef，就算组件不卸载也能被 init_update 正确重置
    const hasClosed = useRef(false);
    // colorRef 追踪最新颜色（含吸管实时更新），hideSelf 时用于先发 change 事件
    const colorRef = useRef(color);
    colorRef.current = color;
    // resetKey：每次 init_update 递增，强制 ColorPickerContent 重挂载，清除 isPicking 等残留状态
    const [resetKey, setResetKey] = useState(0);

    useEffect(() => {
        // 初次 mount：主动抢取键盘焦点
        window.focus();
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
            getCurrentWindow().setFocus().catch(() => {});
        });

        // 从 localStorage 获取初始颜色
        const init = localStorage.getItem('color_picker_init');
        if (init) setColor(init);

        const hideSelf = () => {
            if (hasClosed.current) return;
            hasClosed.current = true;
            emit('color_picker:closed').catch(() => {});
            invoke('color_picker_close').catch(() => {});
        };

        // 点外面失焦关闭
        window.addEventListener('blur', hideSelf);

        // 绑定 ESC / Enter 关闭
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); hideSelf(); }
            if (e.key === 'Enter' && (e.target as Element)?.tagName !== 'BUTTON') hideSelf();
        };
        window.addEventListener('keydown', onKey);

        // 监听外部唤醒事件，刷新颜色并重置关闭标志
        let unlistenUpdate: (() => void) | null = null;
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen<string>('color_picker:init_update', (e) => {
                setColor(e.payload);
                setResetKey(k => k + 1); // 强制 ColorPickerContent 重挂载，清除吸管残留状态
                hasClosed.current = false;
                // 每次被唤醒重新抢取键盘焦点
                window.focus();
                import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
                    getCurrentWindow().setFocus().catch(() => {});
                });
            }).then(un => unlistenUpdate = un);
        });

        return () => {
            window.removeEventListener('blur', hideSelf);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    // 修复 Tauri 在透明窗口模式下 body 默认带深色底色导致的圆角外部黑边
    useEffect(() => {
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';
    }, []);

    const handleChange = (newColor: string) => {
        setColor(newColor);
        // 发送给 Theme Editor
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
