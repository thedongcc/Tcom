import { Menu } from 'lucide-react';

interface TitleBarProps {
  workspaceName?: string | null;
}

export const TitleBar = ({ workspaceName }: TitleBarProps) => {
  const title = workspaceName
    ? `Tcom - ${workspaceName}`
    : 'Tcom';

  return (
    <div className="h-[30px] bg-[var(--vscode-titlebar)] flex items-center justify-between select-none relative z-50" style={{ WebkitAppRegion: 'drag' } as any}>
      <div className="flex items-center h-full px-2">
        <div className="mr-3 ml-1">
          <Menu size={16} className="text-[var(--vscode-fg)] opacity-80 hover:opacity-100 cursor-pointer" style={{ WebkitAppRegion: 'no-drag' } as any} />
        </div>
        <div className="text-xs text-[var(--vscode-fg)] font-medium">{title}</div>
      </div>
    </div>
  );
};
