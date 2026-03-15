import { ComponentType } from 'react';

// ─── 基础工具类型 ──────────────────────────────────────────────────────────────

/** 可释放资源的句柄，调用 dispose() 取消注册/清理 */
export interface Disposable {
    dispose(): void;
}

// ─── 会话信息（只读快照，供模块访问） ──────────────────────────────────────────

export interface SessionInfo {
    id: string;
    name: string;
    type: string;
    isConnected: boolean;
}

// ─── 状态栏贡献 ────────────────────────────────────────────────────────────────

export interface StatusBarItem {
    id: string;
    text: string;
    tooltip?: string;
    onClick?: () => void;
    /** 对齐方向，默认 'right' */
    align?: 'left' | 'right';
}

// ─── 模块侧边栏 Props ──────────────────────────────────────────────────────────

export interface FeatureSidebarProps {
    onNavigate?: (view: string) => void;
    sessionManager?: any;
    editorLayout?: any;
    [key: string]: any;
}

// ─── Toast 选项 ────────────────────────────────────────────────────────────────

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
    message: string;
    type?: ToastType;
    duration?: number;
}

// ─── Confirm 选项 ──────────────────────────────────────────────────────────────

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'info' | 'warning' | 'danger';
}

// ─── 模块 Context API ──────────────────────────────────────────────────────────

/**
 * 模块激活时注入的 API 对象。
 * 模块通过此对象与宿主应用交互。
 */
export interface FeatureContextApi {
    /**
     * UI API — 显示 Toast 通知和确认对话框
     */
    ui: {
        /** 显示一条 Toast 通知 */
        showToast(message: string, type?: ToastType, duration?: number): void;
        /** 显示确认对话框，返回用户是否确认 */
        showConfirm(opts: ConfirmOptions): Promise<boolean>;
    };

    /**
     * 命令 API — 注册可在命令面板中调用的命令
     */
    commands: {
        /**
         * 注册一个命令
         * @param id 命令唯一 ID（建议格式：featureId.commandName）
         * @param label 显示名称
         * @param callback 执行回调
         * @returns Disposable，调用 dispose() 取消注册
         */
        register(id: string, label: string, callback: () => void): Disposable;
    };

    /**
     * 会话 API — 读取当前会话信息（只读）
     */
    sessions: {
        /** 获取所有会话的快照列表 */
        getAll(): SessionInfo[];
        /** 获取当前激活的会话，无则返回 null */
        getActive(): SessionInfo | null;
        /**
         * 监听任意会话的数据接收事件
         * @returns Disposable，调用 dispose() 取消监听
         */
        onDataReceived(callback: (sessionId: string, data: Uint8Array) => void): Disposable;
    };

    /**
     * 存储 API — 模块私有的持久化存储（基于 localStorage，自动命名空间隔离）
     */
    storage: {
        /** 读取值，不存在时返回 null */
        get<T = unknown>(key: string): T | null;
        /** 写入值（自动 JSON 序列化） */
        set(key: string, value: unknown): void;
        /** 删除键 */
        delete(key: string): void;
        /** 清空此模块的所有存储 */
        clear(): void;
    };

    /**
     * 事件总线 — 模块间通信
     */
    events: {
        /**
         * 监听事件
         * @returns Disposable，调用 dispose() 取消监听
         */
        on(event: string, callback: (...args: any[]) => void): Disposable;
        /** 发布事件 */
        emit(event: string, ...args: any[]): void;
    };

    /**
     * 模块自身信息
     */
    featureId: string;
}

// ─── 模块定义接口 ──────────────────────────────────────────────────────────────

/**
 * Tcom 功能模块接口。
 */
export interface Feature {
    // ── 元数据 ──
    /** 模块唯一标识符 */
    id: string;
    /** 显示名称 */
    name: string;
    /** 语义化版本号 */
    version: string;
    /** 模块描述 */
    description?: string;

    // ── 扩展点 ──
    /**
     * 侧边栏组件。
     * 提供后，ActivityBar 中会出现对应图标，点击后在 SideBar 中渲染此组件。
     */
    sidebarComponent?: ComponentType<FeatureSidebarProps>;
    /**
     * ActivityBar 图标组件（Lucide Icon 格式）
     */
    icon?: ComponentType<{ size?: number; className?: string }>;
    /**
     * 状态栏贡献项（可选）。
     * 模块可在状态栏添加自定义文本/按钮。
     */
    statusBarItems?: StatusBarItem[];

    // ── 生命周期 ──
    /**
     * 模块激活时调用。
     * @param ctx 宿主应用注入的 API 对象
     */
    activate(ctx: FeatureContextApi): void | Promise<void>;
    /**
     * 模块停用时调用。
     * @param ctx 宿主应用注入的 API 对象
     */
    deactivate(ctx: FeatureContextApi): void | Promise<void>;
}
