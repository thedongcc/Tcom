import { ComponentType, ReactNode } from 'react';

/**
 * Interface definition for a Tcom Plugin
 */
export interface Plugin {
    /** Unique identifier for the plugin */
    id: string;
    /** Display name */
    name: string;
    /** Semver version string */
    version: string;
    /** Optional description */
    description?: string;

    /** Lifecycle method: Called when plugin is activated */
    activate: (context: PluginContextApi) => void;
    /** Lifecycle method: Called when plugin is deactivated */
    deactivate: (context: PluginContextApi) => void;

    /** 
     * Extension Point: SideBar Icon and View 
     * If provided, an icon will appear in the ActivityBar, 
     * and this component will render in the SideBar when active.
     */
    sidebarComponent?: ComponentType<any>;
    /** Icon component for ActivityBar (e.g. Lucide Icon) */
    icon?: ComponentType<{ size?: number; className?: string }>;
}

/**
 * specialized interface for Sidebar Props to ensure plugins receive necessary context
 */
export interface PluginSidebarProps {
    // We can inject context here if needed, or plugins can use hooks
    // For now, let's keep it open
    [key: string]: any;
}


/**
 * API exposed to plugins via `activate`
 */
export interface PluginContextApi {
    // Methods to interact with the host system
    registerCommand: (id: string, callback: () => void) => void;
    // ... future expansion: registerView, registerMenu, etc.
}
