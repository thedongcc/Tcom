export interface ThemeDefinition {
    id: string;
    name: string;
    type: 'light' | 'dark';
    colors: Record<string, string>;
}

/**
 * 将主题的所有 CSS 变量注入到 :root
 * 切换时先清除上一个主题的所有 CSS 变量，避免残留
 */
export function applyTheme(theme: ThemeDefinition): void {
    const root = document.documentElement;

    // 清除 :root 上所有以 -- 开头的 CSS 变量（上一个主题的残留）
    const inlineStyle = root.style;
    const toRemove: string[] = [];
    for (let i = 0; i < inlineStyle.length; i++) {
        const prop = inlineStyle[i];
        if (prop.startsWith('--')) {
            toRemove.push(prop);
        }
    }
    toRemove.forEach(prop => inlineStyle.removeProperty(prop));

    // 注入新主题的所有 CSS 变量
    Object.entries(theme.colors).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });

    // 标记当前主题类型（dark/light），供 CSS 选择器匹配
    root.setAttribute('data-theme', theme.type);

    // 清除所有旧的主题 class
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
    if (theme.id !== 'dark') {
        const safeClassName = theme.id.replace(/[^a-zA-Z0-9-]/g, '-');
        if (safeClassName) {
            document.body.classList.add(`theme-${safeClassName}`);
        }
    }
}

/**
 * 将主题定义序列化为 JSON 字符串（用于导出）
 */
export function exportTheme(theme: ThemeDefinition): string {
    return JSON.stringify(theme, null, 2);
}

/**
 * 从 JSON 字符串解析主题定义（用于导入）
 * 返回 null 表示格式无效
 */
export function importTheme(json: string): ThemeDefinition | null {
    try {
        const parsed = JSON.parse(json);
        if (
            typeof parsed.id === 'string' &&
            typeof parsed.name === 'string' &&
            typeof parsed.colors === 'object' &&
            parsed.colors !== null
        ) {
            return {
                id: parsed.id,
                name: parsed.name,
                type: parsed.type === 'light' ? 'light' : 'dark',
                colors: parsed.colors,
            };
        }
    } catch {
        // 解析失败
    }
    return null;
}
