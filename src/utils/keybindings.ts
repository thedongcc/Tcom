/**
 * keybindings.ts
 * 快捷键工具 — 序列化、反序列化、匹配判断、格式化显示。
 *
 * 绑定格式：`Ctrl+Shift+F`（修饰键按固定顺序：Ctrl → Shift → Alt → Meta）
 */

/**
 * 将实际按键名转为标准显示名
 */
function normalizeKey(key: string): string {
    const map: Record<string, string> = {
        ' ': 'Space',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
        'Escape': 'Esc',
        'Delete': 'Del',
        'Backspace': 'Backspace',
    };
    // 单字母大写
    if (key.length === 1 && /[a-zA-Z]/.test(key)) return key.toUpperCase();
    return map[key] || key;
}

/**
 * 将 KeyboardEvent 序列化为 `Ctrl+Shift+F` 格式字符串。
 * 仅在按下非修饰键时才生成有效绑定（纯修饰键返回空字符串）。
 */
export function serializeKeyEvent(e: KeyboardEvent): string {
    // 排除纯修饰键
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl'); // Mac ⌘ 映射为 Ctrl
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    parts.push(normalizeKey(e.key));
    return parts.join('+');
}

/**
 * 判断 KeyboardEvent 是否匹配给定的绑定字符串。
 */
export function matchesKeybinding(e: KeyboardEvent, binding: string): boolean {
    if (!binding) return false;
    const serialized = serializeKeyEvent(e);
    return serialized.toLowerCase() === binding.toLowerCase();
}

/**
 * 格式化绑定字符串用于设置页面显示。
 * 将 `Ctrl` 在 Mac 上显示为 `⌘`，其他平台保持原样。
 */
export function formatKeybinding(binding: string): string {
    if (!binding) return '';
    const isMac = navigator.platform?.startsWith('Mac') || false;
    if (!isMac) return binding;

    return binding
        .replace(/Ctrl/g, '⌘')
        .replace(/Alt/g, '⌥')
        .replace(/Shift/g, '⇧')
        .replace(/Meta/g, '⌘');
}

/** 所有可配置的快捷键动作 ID */
export type KeybindingAction = 'toggleSearch' | 'saveCommand';

/** 默认快捷键 */
export const DEFAULT_KEYBINDINGS: Record<KeybindingAction, string> = {
    toggleSearch: 'Ctrl+F',
    saveCommand: 'Ctrl+Enter',
};
