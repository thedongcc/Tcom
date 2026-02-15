import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Theme = 'dark' | 'light' | 'hc' | 'one-dark-vivid';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    // Initialize from localStorage or default to 'dark'
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('tcom-theme');
        return (saved === 'light' || saved === 'hc' || saved === 'dark') ? saved : 'dark';
    });

    useEffect(() => {
        localStorage.setItem('tcom-theme', theme);

        // Remove old theme classes
        document.body.classList.remove('theme-light', 'theme-dark', 'theme-hc', 'theme-one-dark-vivid');

        // Add new class (default dark usually doesn't need class if variables are root default, but let's be explicit or uses overrides)
        // If we define default variables in :root, then 'dark' might not need a class, 
        // but 'light' and 'hc' will.
        if (theme !== 'dark') {
            document.body.classList.add(`theme-${theme}`);
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => {
            if (prev === 'dark') return 'one-dark-vivid';
            if (prev === 'one-dark-vivid') return 'light';
            if (prev === 'light') return 'hc';
            return 'dark';
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
