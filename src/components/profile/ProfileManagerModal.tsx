/**
 * ProfileManagerModal.tsx
 * 配置档案管理弹窗 — 列表展示所有 Profile，支持新建/重命名/删除/导出/导入。
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, User, Plus, Pencil, Trash2, Download, Upload, Check, Loader2, Copy } from 'lucide-react';
import { useProfile } from '../../context/ProfileContext';
import { confirm } from '../../services/confirmManager';

interface ProfileManagerModalProps {
    onClose: () => void;
}

export const ProfileManagerModal: React.FC<ProfileManagerModalProps> = ({ onClose }) => {
    const {
        activeProfile, profiles, refreshProfiles,
        createProfile, deleteProfile, renameProfile, switchProfile, duplicateProfile,
    } = useProfile();

    const [newName, setNewName] = useState('');
    const [showNewInput, setShowNewInput] = useState(false);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState<string | null>(null);
    const newInputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    // 新建输入框自动聚焦
    useEffect(() => {
        if (showNewInput) newInputRef.current?.focus();
    }, [showNewInput]);

    // 编辑输入框自动聚焦
    useEffect(() => {
        if (editingName) editInputRef.current?.focus();
    }, [editingName]);

    // ESC 关闭
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showNewInput) { setShowNewInput(false); setNewName(''); }
                else if (editingName) { setEditingName(null); setEditValue(''); }
                else onClose();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose, showNewInput, editingName]);

    // 新建 Profile
    const handleCreate = useCallback(async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;

        // 检查重名
        if (profiles.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
            setError(`"${trimmed}" 已存在`);
            return;
        }

        setLoading('create');
        const ok = await createProfile(trimmed);
        setLoading(null);
        if (ok) {
            setNewName('');
            setShowNewInput(false);
            setError('');
        } else {
            setError('创建失败');
        }
    }, [newName, profiles, createProfile]);

    // 重命名
    const handleRename = useCallback(async (oldName: string) => {
        const trimmed = editValue.trim();
        if (!trimmed || trimmed === oldName) {
            setEditingName(null);
            return;
        }

        if (profiles.some(p => p.name.toLowerCase() === trimmed.toLowerCase() && p.name !== oldName)) {
            setError(`"${trimmed}" 已存在`);
            return;
        }

        setLoading(`rename-${oldName}`);
        const ok = await renameProfile(oldName, trimmed);
        setLoading(null);
        if (ok) {
            setEditingName(null);
            setEditValue('');
            setError('');
        } else {
            setError('重命名失败');
        }
    }, [editValue, profiles, renameProfile]);

    // 复制 Profile
    const handleDuplicate = useCallback(async (name: string) => {
        // 自动生成 "副本" 名称
        let newName = `${name} 副本`;
        let count = 2;
        while (profiles.some(p => p.name.toLowerCase() === newName.toLowerCase())) {
            newName = `${name} 副本 ${count}`;
            count++;
        }

        setLoading(`duplicate-${name}`);
        const ok = await duplicateProfile(name, newName);
        setLoading(null);
        if (ok) {
            setError('');
        } else {
            setError('复制失败');
        }
    }, [profiles, duplicateProfile]);

    // 删除（带确认）
    const handleDelete = useCallback(async (name: string) => {
        if (name === activeProfile) return; // 禁止删除活跃 Profile

        const confirmed = await confirm({
            title: '删除配置档案',
            message: `确定要删除配置档案 "${name}" 吗？\n\n此操作不可撤销，该档案下的所有会话、命令和自动回复规则都会被永久删除。`,
            confirmText: '删除',
            type: 'danger',
        });
        if (!confirmed) return;

        setLoading(`delete-${name}`);
        await deleteProfile(name);
        setLoading(null);
    }, [activeProfile, deleteProfile]);

    // 导出单个 Profile
    const handleExport = useCallback(async (name: string) => {
        setLoading(`export-${name}`);
        try {
            const res = await window.globalSettingsAPI?.exportProfile(name);
            if (res?.success && !res.canceled) {
                setError('');
            }
        } catch (e) {
            console.error('导出失败:', e);
            setError('导出失败');
        }
        setLoading(null);
    }, []);

    // 导入 Profile
    const handleImport = useCallback(async () => {
        setLoading('import');
        try {
            const res = await window.globalSettingsAPI?.importProfile();
            if (res?.success && !res.canceled) {
                await refreshProfiles();
                setError('');
            }
        } catch (e) {
            console.error('导入失败:', e);
            setError('导入失败');
        }
        setLoading(null);
    }, [refreshProfiles]);

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-[var(--st-dialog-content-bg)] border border-[var(--st-dialog-border)] shadow-2xl w-[480px] max-h-[70vh] flex flex-col rounded-md overflow-hidden animate-in zoom-in-95 fade-in duration-300"
                onClick={e => e.stopPropagation()}
                data-component="profile-manager-modal"
            >
                {/* 头部 */}
                <div className="flex items-center justify-between p-2.5 border-b border-[var(--st-dialog-border)] bg-[var(--st-dialog-header-bg)]">
                    <span className="text-[11px] font-bold text-[var(--st-dialog-text)] uppercase tracking-wider">
                        管理配置档案
                    </span>
                    <div className="flex items-center gap-1">
                        {/* 导入按钮 */}
                        <button
                            onClick={handleImport}
                            disabled={loading === 'import'}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--st-dialog-text)] hover:bg-[var(--st-dialog-header-bg)] rounded-sm transition-colors disabled:opacity-50"
                            title="从 ZIP 文件导入配置档案"
                        >
                            {loading === 'import' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            <span>导入</span>
                        </button>
                        <button onClick={onClose} className="text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-icon-hover)] transition-colors p-1">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* 错误提示 */}
                {error && (
                    <div className="px-3 py-1.5 bg-[var(--st-settings-danger-bg)] text-white text-[11px] flex items-center justify-between">
                        <span>{error}</span>
                        <button onClick={() => setError('')} className="hover:opacity-70"><X size={12} /></button>
                    </div>
                )}

                {/* Profile 列表 */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {profiles.map(profile => (
                        <div
                            key={profile.name}
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
                                            if (e.key === 'Enter') handleRename(profile.name);
                                            if (e.key === 'Escape') { setEditingName(null); setEditValue(''); }
                                        }}
                                        className="flex-1 bg-[var(--input-bg)] text-[var(--input-fg)] border border-[var(--input-border)] rounded-sm px-2 py-0.5 text-[12px] outline-none focus:border-[var(--st-status-info)]"
                                    />
                                    <button
                                        onClick={() => handleRename(profile.name)}
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
                                            onDoubleClick={() => { switchProfile(profile.name); }}
                                        >
                                            {profile.name}
                                        </span>
                                        {profile.name === activeProfile && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--st-status-info)]/20 text-[var(--st-status-info)] font-medium shrink-0">
                                                当前
                                            </span>
                                        )}
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {/* 重命名 */}
                                        <button
                                            onClick={() => { setEditingName(profile.name); setEditValue(profile.name); setError(''); }}
                                            className="p-1 hover:bg-[var(--list-hover-background)] rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-text)]"
                                            title="重命名"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                        {/* 复制 */}
                                        <button
                                            onClick={() => handleDuplicate(profile.name)}
                                            disabled={loading === `duplicate-${profile.name}`}
                                            className="p-1 hover:bg-[var(--list-hover-background)] rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-text)]"
                                            title="复制为新配置档案"
                                        >
                                            {loading === `duplicate-${profile.name}` ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                                        </button>
                                        {/* 导出 */}
                                        <button
                                            onClick={() => handleExport(profile.name)}
                                            disabled={loading === `export-${profile.name}`}
                                            className="p-1 hover:bg-[var(--list-hover-background)] rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-dialog-text)]"
                                            title="导出为 ZIP"
                                        >
                                            {loading === `export-${profile.name}` ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                        </button>
                                        {/* 删除（非活跃时才显示） */}
                                        {profile.name !== activeProfile && (
                                            <button
                                                onClick={() => handleDelete(profile.name)}
                                                disabled={loading === `delete-${profile.name}`}
                                                className="p-1 hover:bg-[var(--st-settings-danger-bg)]/20 rounded-sm text-[var(--activitybar-inactive-foreground)] hover:text-[var(--st-settings-danger-bg)]"
                                                title="删除"
                                            >
                                                {loading === `delete-${profile.name}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* 底部：新建 */}
                <div className="border-t border-[var(--st-dialog-border)] bg-[var(--st-dialog-footer-bg)] p-2.5">
                    {showNewInput ? (
                        <div className="flex items-center gap-2">
                            <input
                                ref={newInputRef}
                                value={newName}
                                onChange={e => { setNewName(e.target.value); setError(''); }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') { setShowNewInput(false); setNewName(''); setError(''); }
                                }}
                                placeholder="输入名称..."
                                className="flex-1 bg-[var(--input-bg)] text-[var(--input-fg)] border border-[var(--input-border)] rounded-sm px-2 py-1 text-[12px] outline-none focus:border-[var(--st-status-info)]"
                            />
                            <button
                                onClick={handleCreate}
                                disabled={loading === 'create' || !newName.trim()}
                                className="px-3 py-1 bg-[var(--st-status-info)] hover:bg-[#1177bb] text-white rounded-sm text-[11px] transition-colors disabled:opacity-50"
                            >
                                {loading === 'create' ? <Loader2 size={12} className="animate-spin" /> : '创建'}
                            </button>
                            <button
                                onClick={() => { setShowNewInput(false); setNewName(''); setError(''); }}
                                className="px-2 py-1 text-[var(--st-dialog-text)] hover:bg-[var(--st-dialog-header-bg)] rounded-sm text-[11px]"
                            >
                                取消
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowNewInput(true)}
                            className="flex items-center gap-1.5 text-[12px] text-[var(--st-status-info)] hover:text-[#1177bb] transition-colors cursor-pointer"
                        >
                            <Plus size={14} />
                            <span>新建配置档案</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
