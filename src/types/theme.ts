export interface ThemeColors {
    // Log Area
    rxTextColor: string;
    txTextColor: string;
    infoColor: string;
    errorColor: string;
    timestampColor: string;
    rxBgColor: string;
    txBgColor: string;

    // Input Area
    inputBgColor: string;
    inputTextColor: string;

    // Tokens
    crcTokenColor: string;
    flagTokenColor: string;

    // Global
    accentColor: string;
}

export interface ThemeImages {
    rxBackground?: string; // Data URL or URL
    txBackground?: string;
    inputBackground?: string;
}

export interface ThemeTypography {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
}

export interface ThemeConfig {
    name: string;
    colors: ThemeColors;
    images: ThemeImages;
    typography: ThemeTypography;
    timestampFormat: string; // e.g. "HH:mm:ss.SSS"
}

export const DEFAULT_THEME: ThemeConfig = {
    name: 'Default Dark',
    colors: {
        rxTextColor: '#cccccc',
        txTextColor: '#ce9178',
        infoColor: '#9cdcfe',
        errorColor: '#f48771',
        timestampColor: '#569cd6',
        rxBgColor: '#1e1e1e', // Monitor BG
        txBgColor: '#1e1e1e', // Unused if Monitor covers all? Monitor has one BG. Input has one BG.
        inputBgColor: '#1e1e1e',
        inputTextColor: '#d4d4d4',
        crcTokenColor: '#4ec9b0', // VSCode Class color
        flagTokenColor: '#c586c0', // VSCode Control color
        accentColor: '#007acc'
    },
    images: {},
    typography: {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.5
    },
    timestampFormat: 'HH:mm:ss.SSS'
};
