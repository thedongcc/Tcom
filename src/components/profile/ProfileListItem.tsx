import React from 'react';
import { User, Pencil, Copy, Download, Trash2, Check, Loader2 } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';

export interface ProfileListItemProps {
    profile: { name: string };
    activeProfile: string | null;
    editingName: string | null;
    editValue: string;
    loading: string | null;
    editInputRef: React.RefObject<HTMLInputElement>;
    setEditValue: (val: string) => void;
    setEditingName: (name: string | null) => void;
    setError: (err: string) => void;
    onRename: (name: string) => void;
    onSwitch: (name: string) => void;
    onDuplicate: (name: string) => void;
    onExport: (name: string) => void;
    onDelete: (name: string) => void;
}

export const ProfileListItem: React.FC<ProfileListItemProps> = ({
    profile, activeProfile, editingName, editValue, loading,
    editInputRef, setEditValue, setEditingName, setError,
    onRename, onSwitch, onDuplicate, onExport, onDelete
}) => {
    const { t } = useI18n();
    
    return (
        <div
            className={`flex items-center gap-2 px-3 py-2.5 border-b border-[var(--st-dialog-border)]/30 hover:bg-[var(--list-hover-background)] group transition-colors ${
                profile.name === activeProfile ? 'bg-[var(--list-hover-background)]/50' : ''
            }`}
        >
            {/* 图标 */}
            <User size={14} className={`shrink-0 ${profile.name === activeProfile ? 'text-[var(--st-status-info)]' : 'opacity-50'}`} />

            {/* 名称（编辑模式） */}
            {editingName === profile.name ? (
                <div className="flex-1 flex items-center gap-1">
                    <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') onRename(profile.name);
                            if (e.key === 'Escape') { setEditingName(null); setEditValue(''); }
                        }}
                        className="flex-1 bg-[var(--input-bg)] text-[var(--input-fg)] border border-[var(--input-border)] rounded-sm px-2 py-0.5 text-[12px] outline-none focus:border-[var(--st-status-info)]"
                    />
                    <button
                        onClick={() => onRename(profile.name)}
                        disabled={loading === `rename-${profile.name}`}
                        className="p-0.5 hover:bg-[var(--list-hover-background)] rounded-sm text-[var(--st-status-info)]"
                    >
                        {loading === `rename-${profile.name}` ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    </button>
                </div>
            ) : (
                <>
                    {/* 名称（展示模式） */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span
                            className={`text-[12px] truncate ${profile.name === activeProfile ? 'font-semibold text-[var(--st-dialog-text)]' : 'text-[var(--st-dialog-text)] opacity-80'}`}
                            onDoubleClick={() => { onSwitch(profile.name); }}
                        >
                            {profile.name}
                        </span>
                        {profile.name === activeProfile && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--st-status-info)]/20 text-[var(--st-status-info)] font-medium shrink-0">
                                {t('profile.current')}
                            </span>
                        )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {/* 重命名 */}
                        <Tooltip content={t('profile.rename')} position="top" offset={4}>
                            <button
                                onClick={() => { setEditingName(profile.name); setEditValue(profile.name); setError(''); }}
                                className="p-1 hover:bg-[var(--list-hover-background)] rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-text)]"
                            >
                                <Pencil size={12} />
                            </button>
                        </Tooltip>
                        {/* 复制 */}
                        <Tooltip content={t('profile.duplicateAsNew')} position="top" offset={4}>
                            <button
                                onClick={() => onDuplicate(profile.name)}
                                disabled={loading === `duplicate-${profile.name}`}
                                className="p-1 hover:bg-[var(--list-hover-background)] rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-text)]"
                            >
                                {loading === `duplicate-${profile.name}` ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                            </button>
                        </Tooltip>
                        {/* 导出 */}
                        <Tooltip content={t('profile.exportZip')} position="top" offset={4}>
                            <button
                                onClick={() => onExport(profile.name)}
                                disabled={loading === `export-${profile.name}`}
                                className="p-1 hover:bg-[var(--list-hover-background)] rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-text)]"
                            >
                                {loading === `export-${profile.name}` ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                            </button>
                        </Tooltip>
                        {/* 删除（非活跃时才显示） */}
                        {profile.name !== activeProfile && (
                            <Tooltip content={t('profile.delete')} position="top" offset={4}>
                                <button
                                    onClick={() => onDelete(profile.name)}
                                    disabled={loading === `delete-${profile.name}`}
                                    className="p-1 hover:bg-[var(--st-settings-danger-bg)]/20 rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-settings-danger-bg)]"
                                >
                                    {loading === `delete-${profile.name}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                </button>
                            </Tooltip>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
