import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// ─── 与 Rust 严格对应的类型定义（多方案版） ───

export type DataType =
    | 'u8' | 'i8'
    | 'u16_le' | 'u16_be'
    | 'i16_le' | 'i16_be'
    | 'u32_le' | 'u32_be'
    | 'i32_le' | 'i32_be'
    | 'f32_le' | 'f32_be';

export interface FieldDef {
    name: string;
    offset: number;
    data_type: DataType;
    multiplier: number;
    /** 可选前端颜色（hex），不传给 Rust 引擎 */
    color?: string;
}

/** 单个解析方案（帧头 + 最小帧长 + 字段列表） */
export interface ParserScheme {
    id: string;
    name: string;
    frame_header: number[];
    /** 可选最小帧长，不填时 = 帧头长度 + 1 */
    min_frame_len?: number | null;
    fields: FieldDef[];
}

/** 解析器全局配置（所有方案 + 激活 ID） */
export interface ParserConfig {
    schemes: ParserScheme[];
    active_id: string | null;
}

// ─── Store 接口 ───────────────────────────────────

export interface ParserState {
    config: ParserConfig | null;
    isLoading: boolean;
    error: string | null;

    // ── 基础操作 ──
    loadConfig: () => Promise<void>;
    saveConfig: (config: ParserConfig) => Promise<void>;

    // ── 方案操作（本地更新，需手动 saveConfig 推送） ──
    addScheme: (name?: string) => void;
    deleteScheme: (id: string) => void;
    setActiveScheme: (id: string) => void;
    updateScheme: (id: string, updater: (s: ParserScheme) => ParserScheme) => void;

    // ── 一键推送当前 config 到引擎 ──
    pushToEngine: () => Promise<void>;
}

// ─── 工具函数 ─────────────────────────────────────

const generateId = () =>
    Math.random().toString(36).slice(2) + Date.now().toString(36);

const defaultScheme = (name = '新建方案'): ParserScheme => ({
    id: generateId(),
    name,
    frame_header: [0xAA, 0x55],
    min_frame_len: 10,
    fields: [],
});

// ─── Store ────────────────────────────────────────

export const useParserStore = create<ParserState>()((set, get) => ({
    config: null,
    isLoading: false,
    error: null,

    loadConfig: async () => {
        set({ isLoading: true, error: null });
        try {
            const config = await invoke<ParserConfig>('get_parser_config');
            set({ config, isLoading: false });
        } catch (err: any) {
            // 向后兼容：若后端尚未升级，尝试旧命令并包装
            try {
                const scheme = await invoke<ParserScheme>('get_parser_schema');
                const config: ParserConfig = {
                    schemes: [scheme],
                    active_id: scheme.id,
                };
                set({ config, isLoading: false });
            } catch {
                set({ error: err.toString(), isLoading: false });
                console.error('[ParserStore] Failed to load config:', err);
            }
        }
    },

    saveConfig: async (config: ParserConfig) => {
        set({ isLoading: true, error: null });
        try {
            await invoke('update_parser_config', { newConfig: config });
            set({ config, isLoading: false });
        } catch (err: any) {
            set({ error: err.toString(), isLoading: false });
            console.error('[ParserStore] Failed to save config:', err);
            throw err;
        }
    },

    addScheme: (name?: string) => {
        const { config } = get();
        const scheme = defaultScheme(name);
        const newConfig: ParserConfig = config
            ? { ...config, schemes: [...config.schemes, scheme] }
            : { schemes: [scheme], active_id: scheme.id };
        set({ config: newConfig });
    },

    deleteScheme: (id: string) => {
        const { config } = get();
        if (!config) return;
        const schemes = config.schemes.filter(s => s.id !== id);
        const active_id = config.active_id === id
            ? (schemes[0]?.id ?? null)
            : config.active_id;
        set({ config: { schemes, active_id } });
    },

    setActiveScheme: (id: string) => {
        const { config } = get();
        if (!config) return;
        set({ config: { ...config, active_id: id } });
    },

    updateScheme: (id: string, updater) => {
        const { config } = get();
        if (!config) return;
        const schemes = config.schemes.map(s => s.id === id ? updater(s) : s);
        set({ config: { ...config, schemes } });
    },

    pushToEngine: async () => {
        const { config, saveConfig } = get();
        if (!config) return;
        // 推送前剔除前端专用的 color 字段，避免 Rust 严格反序列化报错
        const stripped: ParserConfig = {
            ...config,
            schemes: config.schemes.map(s => ({
                ...s,
                fields: s.fields.map(({ color: _c, ...rest }) => rest),
            })),
        };
        await saveConfig(stripped);
    },
}));

// ─── 向后兼容 re-export（渐进迁移用） ─────────────

/** @deprecated 使用 ParserScheme */
export type ProtocolSchema = ParserScheme;

/** @deprecated 使用 useParserStore().config */
export const schemaSelector = (s: ParserState) =>
    s.config?.schemes.find(x => x.id === s.config?.active_id) ?? null;
