import { zhCN, type I18nKeys } from './zh-CN';
import { enUS } from './en-US';

export type Language = 'zh-CN' | 'en-US';

// 语言包映射
const locales: Record<Language, I18nKeys> = {
    'zh-CN': zhCN,
    'en-US': enUS as unknown as I18nKeys,
};

/**
 * 获取指定语言的翻译对象
 */
export function getLocale(lang: Language): I18nKeys {
    return locales[lang] ?? zhCN;
}

/**
 * 深度路径访问工具类型
 * 支持 t('settings.title') 这样的点分隔路径
 */
type PathsToStringProps<T> = T extends string
    ? []
    : {
        [K in Extract<keyof T, string>]: [K, ...PathsToStringProps<T[K]>];
    }[Extract<keyof T, string>];

type Join<T extends string[], D extends string> = T extends []
    ? never
    : T extends [infer F]
    ? F
    : T extends [infer F, ...infer R]
    ? F extends string
    ? R extends string[]
    ? `${F}${D}${Join<R, D>}`
    : never
    : never
    : string;

export type I18nPath = Join<PathsToStringProps<I18nKeys>, '.'>;

/**
 * 根据点分隔路径获取翻译值
 */
function getByPath(obj: any, path: string): string {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return path;
        current = current[part];
    }
    return typeof current === 'string' ? current : path;
}

/**
 * 创建翻译函数
 */
export function createTranslator(lang: Language) {
    const locale = getLocale(lang);
    return function t(path: string, vars?: Record<string, string>): string {
        let result = getByPath(locale, path);
        if (vars) {
            // 替换模板变量，如 {name}
            result = result.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
        }
        return result;
    };
}

export { zhCN, enUS };
