/**
 * Tauri 插件类型声明
 * @tauri-apps/plugin-dialog 和 @tauri-apps/plugin-fs 的类型定义
 */

declare module '@tauri-apps/plugin-dialog' {
    interface SaveDialogOptions {
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        title?: string;
    }

    interface OpenDialogOptions {
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        title?: string;
        multiple?: boolean;
        directory?: boolean;
    }

    export function save(options?: SaveDialogOptions): Promise<string | null>;
    export function open(options?: OpenDialogOptions): Promise<string | string[] | null>;
}

declare module '@tauri-apps/plugin-fs' {
    export function writeTextFile(path: string, contents: string): Promise<void>;
    export function readTextFile(path: string): Promise<string>;
    export function writeFile(path: string, contents: Uint8Array): Promise<void>;
    export function readFile(path: string): Promise<Uint8Array>;
    export function exists(path: string): Promise<boolean>;
    export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    export function remove(path: string, options?: { recursive?: boolean }): Promise<void>;
}
