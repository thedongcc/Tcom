export interface ThemeDefinition {
    id: string;
    name: string;
    /** 图片主题标识：true = 需要背景图；普通主题不写此字段 */
    image?: true;
    colors: Record<string, string>;
}

/**
 * 判断一个 CSS 变量名是否为「面板/区域背景」类型
 */
function isBgKey(key: string): boolean {
    return key.endsWith('-bg') || key.endsWith('-background');
}

/**
 * 排除规则：这些变量即使是背景色，也不应参与透明度令牌混合。
 * 弹出层需保持可读、交互按钮保持实色。
 */
const JIT_EXCLUDE_PATTERNS = [
    'dialog', 'menu', 'dropdown', 'toast', 'popover', 'tooltip', // 弹出层
    'overlay',                                                     // 遮罩层
    'button', 'btn',                                               // 按钮
    'selection', 'highlight', 'match',                             // 选区
    'scrollbar',                                                    // 滚动条
    'checkbox', 'switch',                                          // 表单控件
    'badge', 'label-bg', 'tag-bg',                                 // 小型标记
    'debugging',                                                    // 调试态
    'conn-start', 'conn-stop', 'conn-disabled',                    // 连接按钮
    'progress',                                                     // 进度条
    'danger',                                                       // 危险操作
    'success-bg', 'error-bg', 'warning-bg', 'info-bg',            // 状态色
];

/**
 * 后缀排除：以这些结尾的变量名排除（交互态按钮背景）
 */
const JIT_EXCLUDE_SUFFIXES = [
    '-hover-bg',       // 悬停态背景（按钮/列表项）
    '-focus-bg',       // 聚焦态背景
    '-pressed-bg',     // 按下态背景
];

function isJitExcluded(key: string): boolean {
    const k = key.toLowerCase();
    // 后缀精确匹配
    if (JIT_EXCLUDE_SUFFIXES.some(s => k.endsWith(s))) return true;
    // 子串模糊匹配
    return JIT_EXCLUDE_PATTERNS.some(p => k.includes(p));
}

/**
 * 将主题的所有 CSS 变量注入到 :root
 * 切换时先清除上一个主题的所有 CSS 变量，避免残留
 *
 * 【JIT 拦截器模式】：
 * 对背景色 hex 值自动包上 color-mix(in srgb, hex calc(var(--tcom-ui-opacity,100)*1%), transparent)
 * 当没有背景图时 --tcom-ui-opacity 默认 100，等同于纯色。
 * 当开启背景图且滑块拖动时，浏览器 GPU 自动让所有背景变半透明！
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

    // 注入新主题的所有 CSS 变量（JIT 拦截器模式）
    Object.entries(theme.colors).forEach(([key, value]) => {
        // 是背景色 + 值为纯色 hex + 不在排除列表 → 包上全局透明度令牌
        if (isBgKey(key) && !isJitExcluded(key) && value.startsWith('#')) {
            root.style.setProperty(
                key,
                `color-mix(in srgb, ${value} calc(var(--tcom-ui-opacity, 100) * 1%), transparent)`
            );
        } else {
            root.style.setProperty(key, value);
        }
    });

    // 标记当前主题 ID，供 CSS 选择器匹配
    root.setAttribute('data-theme', theme.id);

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
            typeof parsed.colors === 'object' &&
            parsed.colors !== null
        ) {
            const result: ThemeDefinition = {
                id: parsed.id,
                name: typeof parsed.name === 'string' ? parsed.name : parsed.id,
                colors: parsed.colors,
            };
            // image 字段：true 表示图片主题
            if (parsed.image === true || parsed.type === 'image') result.image = true;
            return result;
        }
    } catch {
        // 解析失败
    }
    return null;
}
