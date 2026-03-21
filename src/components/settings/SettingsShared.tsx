/**
 * SettingsShared.tsx
 * 设置编辑器的公共 UI 组件 — Obsidian 风格。
 * Group 容器（深色卡片）、SettingRow（水平布局）、Checkbox。
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

// ─── 分组容器（Obsidian 风格：粗体标题 + 深色圆角卡片） ────────────────────────
export const Group = ({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) => (
    <div className="mb-6" id={id}>
        <h3 className="text-[15px] font-bold text-[var(--st-settings-title-text)] mb-3">
            {title}
        </h3>
        <div className="flex flex-col bg-[var(--settings-editor-bg,var(--input-background))] rounded-lg border border-[var(--border-color)] overflow-hidden">
            {children}
        </div>
    </div>
);

// ─── 设置行（Obsidian 风格：左标签+描述 | 右控件，水平布局） ────────────────────
export const SettingRow = ({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
}) => (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--list-hover-background)] transition-colors">
        <div className="flex flex-col flex-1 min-w-0">
            <label className="text-[13px] text-[var(--st-settings-text)] font-semibold">{label}</label>
            {description && (
                <p className="text-[12px] text-[var(--input-placeholder-color)] mt-0.5 leading-relaxed">{description}</p>
            )}
        </div>
        <div className="flex-shrink-0">{children}</div>
    </div>
);

// ─── 复选框（VSCode 风格圆角蓝色） ─────────────────────────────────────────────
export const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div
        onClick={onChange}
        className={`w-[18px] h-[18px] rounded-[3px] flex items-center justify-center cursor-pointer transition-all ${checked
            ? 'bg-[var(--checkbox-background,#1a7fd4)] border border-[var(--checkbox-border-color,#1a7fd4)]'
            : 'bg-transparent border-2 border-[var(--input-border-color,#6b6b6b)] hover:border-[var(--input-placeholder-color,#999)]'
            }`}
    >
        {checked && <Check size={14} strokeWidth={3} className="text-[var(--checkbox-foreground,#fff)]" />}
    </div>
);

// ─── 通用输入框样式 ─────────────────────────────────────────────────────────
export const INPUT_CLS =
    'bg-[var(--input-background)] text-[var(--input-foreground)] border border-[var(--input-border-color)] text-[13px] px-2 h-7 outline-none focus:border-[var(--focus-border-color)] rounded-[4px]';
