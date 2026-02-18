/** 主题定义：一组 CSS 变量键值对 */
export interface ThemeDefinition {
    /** 唯一标识符（内置主题使用固定 id，自定义主题由用户指定） */
    id: string;
    /** 显示名称 */
    name: string;
    /** 主题类型，用于决定部分 UI 的默认行为 */
    type: 'dark' | 'light';
    /** CSS 变量键值对，键必须以 `--` 开头 */
    colors: Record<string, string>;
}
