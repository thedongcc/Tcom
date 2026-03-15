/**
 * tokens/core/types.ts
 * Token 插件系统核心类型定义。
 * 每种 Token 类型都必须实现 TokenPlugin 接口后注册到 TokenRegistry。
 */
import type React from 'react';
import { Segment as _Segment, Token as _Token } from '../../types/token';

/** 编译上下文，compile 函数通过此对象访问当前字节偏移信息 */
export interface CompileContext {
    /** 当前字节流长度（用于 CRC 等需要知道前方字节数的 Token） */
    currentTotalLength: number;
    /** 当前已积累的字节块（用于 CRC 计算） */
    parts: Uint8Array[];
}

/** 配置表单组件的 Props */
export interface ConfigFormProps {
    config: any;
    setConfig: (c: any) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

/**
 * 定时发送行为（动态 Token 专用）。
 * 通过此接口暴露定时发送所需的状态和槽位信息，
 * 使 useSerialInputLogic 无需关心 Token 内部细节。
 */
export interface WorkerSlot {
    byteOffset: number;
    byteSize: number;
    byteOrder: string;
    format: string;
}

/**
 * 动态 Token 的定时发送状态（如 auto_inc 的当前值快照）。
 * 由各 Token 插件创建和维护，与 useSerialInputLogic 解耦。
 */
export interface TokenTimedState {
    /** 获取当前值（用于编辑器显示同步） */
    getCurrentValue(): string;
    /** 实际发送了一帧后调用，更新内部状态 */
    onFrameSent(): void;
    /** 获取下一帧发送的 config 副本（用于批量预计算时重置起点） */
    getBatchStartConfig(): any;
    /** 以当前状态更新 config，供 computeFrames 使用 */
    applyToConfig(config: any): void;
}

/**
 * / 快捷菜单条目描述
 */
export interface SuggestionItem {
    /** 菜单显示标题 */
    title: string;
    /** 插入时的 Token 配置 */
    config: any;
    /** Lucide 图标组件 */
    icon?: React.FC<any>;
}

/**
 * 工具栏按钮描述
 */
export interface ToolbarButton {
    /** 按钮短标签（如 "CRC", "Auto", "Rand"） */
    shortLabel: string;
    /** Tooltip 文本 */
    tooltip: string;
    /** 图标类型：lucide 组件 或 字母方块 */
    icon:
    | { kind: 'lucide'; component: React.FC<any>; colorClass: string }
    | { kind: 'letter'; letter: string; borderColorClass: string; textColorClass: string };
}

/**
 * Token 插件接口。
 * 每种 Token 类型实现此接口后通过 TokenRegistry.register() 注册。
 */
export interface TokenPlugin {
    /** Token 类型唯一标识，与 Token.type 一致 */
    type: string;
    /** 展示给用户的标签（用于配置弹窗标题、插入菜单等） */
    label: string;
    /** 编辑器 NodeView 颜色 CSS 变量名，如 --st-token-flag */
    colorVar: string;
    /** CSS 变量未定义时的兜底颜色（hex），避免颜色白色回退 */
    fallbackColor: string;

    /** 插入时的默认配置 */
    defaultConfig(): any;

    /** 编辑器 NodeView 中显示的文字标签 */
    getLabel(config: any): string;

    /**
     * 编译 Token 为字节。
     * 对于 CRC 这类需要知道前方字节的 Token，通过 context 访问。
     * 函数必须在返回前将结果推入 context.parts 并更新 context.currentTotalLength。
     */
    compile(config: any, context: CompileContext): void;

    /**
     * 是否为动态 Token（每次发送值不同，需要高精度定时发送路径）。
     * 默认 false。
     */
    isDynamic?: boolean;

    /** 编辑器 NodeView 中标签是否加粗显示（默认 false） */
    isBold?: boolean;

    /**
     * 创建定时发送状态（仅有状态 Token 需要实现，如 auto_inc）。
     * 无状态的动态 Token（random_bytes / timestamp）不实现此方法。
     */
    createTimedState?(config: any): TokenTimedState;

    /**
     * 提取 Worker 实时填充槽位（仅需要 Worker 实时填充字节的 Token 实现）。
     * 返回槽位信息，Worker 在发送瞬间实时填充这些字节位置。
     */
    getWorkerSlot?(config: any, byteOffset: number): WorkerSlot | null;

    /** 配置表单 React 组件（在 TokenConfigPopover 中渲染） */
    ConfigForm: React.FC<ConfigFormProps>;

    /** 保存前规范化配置（可选） */
    normalizeConfig?(config: any): any;

    /** 右键菜单行为（可选）。返回新 config 或 null */
    onContextMenu?(config: any): any | null;

    /**
     * 工具栏按钮描述（可选）。
     * 不提供则不显示工具栏按钮，仅可通过 / 菜单插入。
     */
    toolbar?: ToolbarButton;

    /**
     * / 快捷菜单条目列表。
     * 同一 Token 类型可有多个条目（如 CRC 有 Modbus/CCITT/CRC32 三个）。
     * 不提供则使用默认：标题=label，配置=defaultConfig()。
     */
    suggestions?(): SuggestionItem[];
}
