/**
 * serialMonitorHelpers.ts
 * 串口监视器纯工具函数 — 从 useSerialMonitorState.ts 中提取。
 * 这些函数不依赖 React，可直接在测试环境中运行。
 */

/** 可用于判断等宽字体的关键词 */
export const MONO_KEYWORDS = ['mono', 'console', 'code', 'courier', 'fixed', 'terminal'] as const;

/** 判断字体名称是否为等宽字体 */
export function isMonospacedFont(fontName: string): boolean {
    const lower = fontName.toLowerCase();
    return MONO_KEYWORDS.some(kw => lower.includes(kw));
}

/** 串口监视器显示状态的默认值类型 */
export interface SerialMonitorDefaults {
    viewMode: 'text' | 'hex' | 'both';
    showTimestamp: boolean;
    showPacketType: boolean;
    showDataLength: boolean;
    showControlChars: boolean;
    mergeRepeats: boolean;
    filterMode: 'all' | 'rx' | 'tx';
    encoding: 'utf-8' | 'gbk' | 'ascii';
    fontSize: number;
    fontFamily: string;
    autoScroll: boolean;
    flashNewMessage: boolean;
    searchOpen: boolean;
}

/**
 * 从 uiState 对象中读取显示状态初始值，未设置时使用系统默认值。
 * 纯函数 — 无副作用。
 */
export function getInitialDisplayState(uiState: Record<string, unknown>): SerialMonitorDefaults {
    return {
        viewMode: (uiState.viewMode as SerialMonitorDefaults['viewMode']) || 'hex',
        showTimestamp: uiState.showTimestamp !== undefined ? !!uiState.showTimestamp : true,
        showPacketType: uiState.showPacketType !== undefined ? !!uiState.showPacketType : true,
        showDataLength: uiState.showDataLength !== undefined ? !!uiState.showDataLength : false,
        showControlChars: uiState.showControlChars !== undefined ? !!uiState.showControlChars : true,
        mergeRepeats: uiState.mergeRepeats !== undefined ? !!uiState.mergeRepeats : false,
        filterMode: (uiState.filterMode as SerialMonitorDefaults['filterMode']) || 'all',
        encoding: (uiState.encoding as SerialMonitorDefaults['encoding']) || 'utf-8',
        fontSize: (uiState.fontSize as number) || 15,
        fontFamily: (uiState.fontFamily as string) || 'AppCoreFont',
        autoScroll: uiState.autoScroll !== undefined ? !!uiState.autoScroll : true,
        flashNewMessage: uiState.flashNewMessage !== false,
        searchOpen: !!uiState.searchOpen,
    };
}

/**
 * 检测 uiState 更新对象与当前状态是否存在实际变化。
 * 使用 JSON 深比较，防止对象引用变化触发无意义的持久化。
 * 纯函数 — 无副作用。
 */
export function hasUIStateChanges(
    updates: Record<string, unknown>,
    current: Record<string, unknown>,
): boolean {
    return Object.keys(updates).some(
        k => JSON.stringify(updates[k]) !== JSON.stringify(current[k]),
    );
}

/**
 * 将字体列表按等宽/比例字体分类，并在顶部插入内置字体选项。
 * 纯函数 — 不修改传入数组。
 */
export function buildFontOptions(fontNames: string[]): Array<{ label: string; value: string; disabled?: boolean }> {
    const mono: Array<{ label: string; value: string }> = [];
    const prop: Array<{ label: string; value: string }> = [];

    for (const name of fontNames) {
        const item = { label: name, value: `"${name}"` };
        if (isMonospacedFont(name)) {
            mono.push(item);
        } else {
            prop.push(item);
        }
    }

    const builtIn = [{ label: '内嵌字体 (Default)', value: 'AppCoreFont' }];

    return [
        { label: '-- Built-in --', value: 'header-built-in', disabled: true },
        ...builtIn,
        ...(mono.length > 0 ? [{ label: '-- Monospaced --', value: 'header-mono', disabled: true }, ...mono] : []),
        ...(prop.length > 0 ? [{ label: '-- Proportional --', value: 'header-prop', disabled: true }, ...prop] : []),
    ];
}
