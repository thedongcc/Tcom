import { Menu, Pin, PinOff } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';

interface TitleBarProps {
  workspaceName?: string | null;
}

// Windows 上 Electron titleBarOverlay 原生按钮（最小化/最大化/关闭）的宽度约为 138px
const NATIVE_CONTROLS_WIDTH = 138;

export const TitleBar = ({ workspaceName }: TitleBarProps) => {
  const { t } = useI18n();
  const [isPinned, setIsPinned] = useState(false);

  // 初始化时读取置顶状态
  useEffect(() => {
    window.windowAPI?.isAlwaysOnTop().then((res) => {
      if (res?.success) setIsPinned(res.alwaysOnTop);
    });
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
    <div
      className="h-[30px] bg-[var(--vscode-titlebar)] flex items-center select-none relative z-50"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* 左侧：菜单图标 + 标题 */}
      <div className="flex items-center h-full px-2 flex-1 min-w-0">
        <div className="mr-3 ml-1">
          <Menu
            size={16}
            className="text-[var(--vscode-fg)] opacity-80 hover:opacity-100 cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          />
        </div>
        <div className="text-xs text-[var(--vscode-fg)] font-medium truncate">{title}</div>
      </div>

      {/* 右侧：置顶按钮，紧靠原生控件左侧 */}
      <div
        className="flex items-center h-full shrink-0"
        style={{
          WebkitAppRegion: 'no-drag',
          marginRight: `${NATIVE_CONTROLS_WIDTH}px`,
        } as any}
      >
        <button
          onClick={togglePin}
          title={isPinned ? t('titleBar.unpinWindow') : t('titleBar.pinWindow')}
          className={[
            'flex items-center justify-center w-[46px] h-full transition-colors duration-150',
            isPinned
              ? 'text-[var(--vscode-focusBorder,#007fd4)] bg-[var(--vscode-toolbar-activeBackground,rgba(255,255,255,0.08))]'
              : 'text-[var(--vscode-fg)] opacity-60 hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground,rgba(255,255,255,0.08))]',
          ].join(' ')}
        >
          {isPinned ? (
            <Pin size={14} className="rotate-45" />
          ) : (
            <PinOff size={14} />
          )}
        </button>
      </div>
    </div>
  );
};
