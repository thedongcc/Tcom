/**
 * SettingsShared.tsx
 * 设置编辑器的公共 UI 组件 — Group 容器、SettingRow 行、Checkbox。
 * 从 SettingsEditor.tsx 中提炼，供所有设置子组件复用。
 */
import React from 'react';
import { Check } from 'lucide-react';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────
export interface SettingItem {
    label: string;
    description?: string;
    render: () => React.ReactNode;
}

export interface SettingSection {
    title: string;
    items: SettingItem[];
}

// ─── 分组容器 ─────────────────────────────────────────────────────────────────
export const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-8">
        <h3 className="text-[11px] font-bold text-[var(--st-settings-title-text)] opacity-50 uppercase tracking-widest mb-3 px-2 border-l-2 border-[var(--focus-border-color)] ml-[-8px] pl-[6px]">
            {title}
        </h3>
        <div className="flex flex-col bg-[var(--settings-editor-bg)] rounded border border-[var(--border-color)] overflow-hidden">
            {children}
        </div>
    </div>
);

// ─── 普通设置行 ───────────────────────────────────────────────────────────────
export const SettingRow = ({
    label,
    description,
    children,
    stackContent = false,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
    stackContent?: boolean;
}) => (
    <div className={`py-3 border-b border-[var(--settings-row-hover-background)] last:border-0 hover:bg-[var(--list-hover-background)] px-3 ${stackContent ? 'flex flex-col gap-2' : 'flex items-center justify-between'}`}>
        <div className={`flex flex-col ${stackContent ? '' : 'flex-1 mr-4'}`}>
            <label className="text-[13px] text-[var(--st-settings-text)] font-medium">{label}</label>
            {description && (
                <p className="text-[11px] text-[var(--input-placeholder-color)] mt-0.5">{description}</p>
            )}
        </div>
        <div className={stackContent ? '' : 'flex-shrink-0'}>{children}</div>
    </div>
);

// ─── 复选框 ───────────────────────────────────────────────────────────────────
export const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div
        onClick={onChange}
        className={`w-4 h-4 border flex items-center justify-center cursor-pointer transition-colors ${checked
            ? 'bg-[var(--checkbox-background)] border-[var(--checkbox-border-color)]'
            : 'bg-[var(--input-background)] border-[var(--input-border-color)]'
            }`}
    >
        {checked && <Check size={12} className="text-[var(--checkbox-foreground)]" />}
    </div>
);

// ─── 通用输入框样式 ─────────────────────────────────────────────────────────
export const INPUT_CLS =
    'bg-[var(--input-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] text-[13px] px-2 h-7 outline-none focus:border-[var(--focus-border-color)] rounded-[4px]';
