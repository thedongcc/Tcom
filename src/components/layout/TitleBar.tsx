import { Pin, PinOff, Palette } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

interface TitleBarProps {
  workspaceName?: string | null;
}

// Windows 上 Electron titleBarOverlay 原生按钮（最小化/最大化/关闭）的宽度约为 138px
const NATIVE_CONTROLS_WIDTH = 138;

export const TitleBar = ({ workspaceName }: TitleBarProps) => {
  const { t } = useI18n();
  const [isPinned, setIsPinned] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // 初始化时读取状态
  useEffect(() => {
    window.windowAPI?.isAlwaysOnTop().then((res) => {
      if (res?.success) setIsPinned(res.alwaysOnTop);
    });

    // 监听编辑器开启状态广播
    const unsub = (window as any).themeAPI?.onStatusChanged((isOpen: boolean) => {
      setIsEditorOpen(isOpen);
    });
    return () => unsub?.();
  }, []);

  // 切换置顶状态
  const togglePin = useCallback(async () => {
    const next = !isPinned;
    const res = await window.windowAPI?.setAlwaysOnTop(next);
    if (res?.success) {
      setIsPinned(next);
    }
  }, [isPinned]);

  const title = workspaceName ? `Tcom - ${workspaceName}` : 'Tcom';

  return (
    <>
      <div
        className="h-[30px] bg-[var(--titlebar-background)] flex items-center select-none relative z-50"
        style={{ WebkitAppRegion: 'drag' } as any}
        data-component="titlebar"
      >
        {/* 左侧：菜单图标 + 标题 */}
        <div className="flex items-center h-full px-2 flex-1 min-w-0">
          <div className="text-xs text-[var(--st-titlebar-text)] font-medium truncate ml-2">{title}</div>
        </div>

        {/* 右侧：颜色编辑器 + 置顶按钮，紧靠原生控件左侧 */}
        <div
          className="flex items-center h-full shrink-0"
          style={{
            WebkitAppRegion: 'no-drag',
            marginRight: `${NATIVE_CONTROLS_WIDTH}px`,
          } as any}
        >
          {/* 调色盘图标（主题颜色编辑器入口） */}
          <Tooltip content="主题颜色编辑器" position="bottom" wrapperClassName="h-full">
            <button
              className={[
                'flex items-center justify-center w-[46px] h-full transition-colors duration-150',
                isEditorOpen
                  ? 'text-[var(--focus-border-color,#007fd4)] bg-[var(--vscode-toolbar-activeBackground,rgba(255,255,255,0.08))]'
                  : 'text-[var(--st-titlebar-icon)] opacity-60 hover:text-[var(--st-titlebar-icon-hover)] hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground,rgba(255,255,255,0.08))]',
              ].join(' ')}
              onClick={async () => {
                await (window as any).themeAPI?.openThemeEditor();
                // 再次主动校验状态
                const isOpen = await (window as any).themeAPI?.isWindowOpen();
                setIsEditorOpen(!!isOpen);
              }}
            >
              <Palette size={14} />
            </button>
          </Tooltip>

          {/* 置顶按钮 */}
          <Tooltip content={isPinned ? t('titleBar.unpinWindow') : t('titleBar.pinWindow')} position="bottom" wrapperClassName="h-full">
            <button
              className={[
                'flex items-center justify-center w-[46px] h-full transition-colors duration-150',
                isPinned
                  ? 'text-[var(--focus-border-color,#007fd4)] bg-[var(--vscode-toolbar-activeBackground,rgba(255,255,255,0.08))]'
                  : 'text-[var(--st-titlebar-icon)] opacity-60 hover:text-[var(--st-titlebar-icon-hover)] hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground,rgba(255,255,255,0.08))]',
              ].join(' ')}
              onClick={togglePin}
            >
              {isPinned ? (
                <Pin size={14} className="rotate-45" />
              ) : (
                <PinOff size={14} />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );
};
