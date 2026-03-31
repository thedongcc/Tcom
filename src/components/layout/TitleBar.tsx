import { Pin, PinOff, Palette, Minus, Square, X, Copy } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';

/** 调色盘按钮 — 带编辑器窗口打开状态高亮 */
const EditorToggleButton = () => {
  const { t } = useI18n();
  const [isEditorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    // 监听窗口创建和销毁事件
    const unlisteners: (() => void)[] = [];

    // 检查初始状态
    WebviewWindow.getByLabel('theme-editor').then(win => {
      setEditorOpen(win !== null);
    });

    listen('tauri://window-created', () => {
      WebviewWindow.getByLabel('theme-editor').then(win => {
        setEditorOpen(win !== null);
      });
    }).then(fn => unlisteners.push(fn));

    listen('tauri://destroyed', () => {
      // 延迟检查，确保窗口已销毁
      setTimeout(() => {
        WebviewWindow.getByLabel('theme-editor').then(win => {
          setEditorOpen(win !== null);
        });
      }, 100);
    }).then(fn => unlisteners.push(fn));

    return () => { unlisteners.forEach(fn => fn()); };
  }, []);

  return (
    <Tooltip content={t('titleBar.themeEditor')} position="bottom" wrapperClassName="h-full">
      <button
        className={[
          'flex items-center justify-center w-[46px] h-full transition-colors duration-150',
          isEditorOpen
            ? 'text-[var(--focus-border-color,#007fd4)] bg-[var(--st-titlebar-active-bg,rgba(255,255,255,0.08))]'
            : 'text-[var(--st-titlebar-icon)] opacity-60 hover:text-[var(--st-titlebar-icon-hover)] hover:opacity-100 hover:bg-[var(--st-titlebar-hover-bg,rgba(255,255,255,0.08))]',
        ].join(' ')}
        onClick={() => window.themeAPI?.openThemeEditor()}
      >
        <Palette size={14} />
      </button>
    </Tooltip>
  );
};

interface TitleBarProps {
  workspaceName?: string | null;
}

export const TitleBar = ({ workspaceName }: TitleBarProps) => {
  const { t } = useI18n();
  const [isPinned, setIsPinned] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMaxHover, setIsMaxHover] = useState(false);

  // 初始化时读取状态
  useEffect(() => {
    window.windowAPI?.isAlwaysOnTop().then((res) => {
      if (res?.success) setIsPinned(res.alwaysOnTop);
    });
    window.windowAPI?.isMaximized().then(setIsMaximized);

    // 监听窗口 resize 事件以同步最大化状态
    const win = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    win.onResized(() => {
      win.isMaximized().then(setIsMaximized);
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  // 监听 Snap Layout 覆盖窗口的悬浮事件
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<boolean>('snap-maximize-hover', (event) => {
      setIsMaxHover(event.payload);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // 切换置顶状态
  const togglePin = useCallback(async () => {
    const next = !isPinned;
    const res = await window.windowAPI?.setAlwaysOnTop(next);
    if (res?.success) {
      setIsPinned(next);
    }
  }, [isPinned]);

  // 标题栏拖拽：使用 Tauri startDragging()
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-no-drag]')) return;
    // inspector 模式下不拖拽，让选取事件通过
    if (document.body.hasAttribute('data-inspector-active')) return;
    e.preventDefault();
    getCurrentWindow().startDragging();
  }, []);

  // 双击标题栏切换最大化
  const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-no-drag]')) return;
    if (document.body.hasAttribute('data-inspector-active')) return;
    const maximized = await window.windowAPI?.toggleMaximize();
    setIsMaximized(!!maximized);
  }, []);

  const title = workspaceName ? `Tcom - ${workspaceName}` : 'Tcom';

  return (
    <>
      <div
        className="h-[30px] bg-[var(--titlebar-background)] flex items-center select-none relative z-50 border-b border-[var(--border-color)]"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        data-component="titlebar"
      >
        {/* 左侧：标题 */}
        <div className="flex items-center h-full px-2 flex-1 min-w-0">
          <div className="text-xs text-[var(--st-titlebar-text)] font-medium truncate ml-2">{title}</div>
        </div>

        {/* 右侧：功能按钮 + 窗口控件 */}
        <div className="flex items-center h-full shrink-0" data-no-drag>
          {/* 调色盘图标（主题颜色编辑器入口） */}
          <EditorToggleButton />

          {/* 置顶按钮 */}
          <Tooltip content={isPinned ? t('titleBar.unpinWindow') : t('titleBar.pinWindow')} position="bottom" wrapperClassName="h-full">
            <button
              className={[
                'flex items-center justify-center w-[46px] h-full transition-colors duration-150',
                isPinned
                  ? 'text-[var(--focus-border-color,#007fd4)] bg-[var(--st-titlebar-active-bg,rgba(255,255,255,0.08))]'
                  : 'text-[var(--st-titlebar-icon)] opacity-60 hover:text-[var(--st-titlebar-icon-hover)] hover:opacity-100 hover:bg-[var(--st-titlebar-hover-bg,rgba(255,255,255,0.08))]',
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

          {/* ── 窗口控件分隔 ── */}
          <div className="w-px h-3.5 bg-[var(--st-titlebar-icon)] opacity-20 mx-0.5" />

          {/* 最小化 */}
          <button
            className="flex items-center justify-center w-[46px] h-full text-[var(--st-titlebar-icon)] opacity-60 hover:opacity-100 hover:bg-[var(--st-titlebar-hover-bg,rgba(255,255,255,0.08))] transition-colors duration-150"
            onClick={() => window.windowAPI?.minimize()}
          >
            <Minus size={16} />
          </button>

          {/* 最大化 / 还原 */}
          <button
            className={`flex items-center justify-center w-[46px] h-full text-[var(--st-titlebar-icon)] transition-colors duration-150 ${
              isMaxHover
                ? 'opacity-100 bg-[var(--st-titlebar-hover-bg,rgba(255,255,255,0.08))]'
                : 'opacity-60 hover:opacity-100 hover:bg-[var(--st-titlebar-hover-bg,rgba(255,255,255,0.08))]'
            }`}
            onClick={async () => {
              const maximized = await window.windowAPI?.toggleMaximize();
              setIsMaximized(!!maximized);
            }}
          >
            {isMaximized ? <Copy size={12} /> : <Square size={12} />}
          </button>

          {/* 关闭 */}
          <button
            className="flex items-center justify-center w-[46px] h-full text-[var(--st-titlebar-icon)] opacity-60 hover:opacity-100 hover:bg-[#e81123] hover:text-white transition-colors duration-150"
            onClick={() => window.windowAPI?.close()}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </>
  );
};
