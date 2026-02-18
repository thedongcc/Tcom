import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import { createTranslator, type Language } from '../i18n';

interface I18nContextType {
    /** 翻译函数，支持点分隔路径和模板变量 */
    t: (path: string, vars?: Record<string, string>) => string;
    /** 当前语言 */
    language: Language;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
    const { config } = useSettings();
    const language = config.language as Language;

    // 当语言变化时重新创建翻译函数
    const t = useMemo(() => createTranslator(language), [language]);

    return (
        <I18nContext.Provider value={{ t, language }}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = () => {
    const context = useContext(I18nContext);
    if (context === undefined) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
};
