import { CommandEntity } from '../types/command';

/**
 * Generates a unique name for a command or group within a specific parent (or root).
 * Tries to follow the pattern "base", "base 1", "base 2" etc.
 * Or if base is "command", tries "command1", "command2".
 * 
 * @param commands All commands
 * @param base Base name (e.g. "New Command" or "command")
 * @param parentId Parent ID to scope uniqueness to
 */
export const generateUniqueName = (commands: CommandEntity[], base: string, parentId?: string): string => {
    const siblings = commands.filter(c => c.parentId === parentId);
    let name = base;
    let index = 1;

    // Logic from CommandListSidebar:
    // Try `${base}${index}`.
    // Note: If base is "New Command", we might want "New Command 1".
    // If base is "command", we want "command1".

    // Check if base itself exists (for the very first one, usually we might want just "New Command" if it doesn't exist? 
    // But the sidebar implementation always appended index 1? 
    // Sidebar logic:
    // let name = base; // "command"
    // let index = 1;
    // while (siblings.some(s => s.name === `${base}${index}`)) index++;
    // return `${base}${index}`;

    // Validating sidebar logic:
    // It ALWAYS returns base + index. e.g. "command1". 
    // It never returns just "command". 
    // It never returns "New Command" (it returns "New Command 1").

    // Let's stick to that for consistency if that's what user agreed on, 
    // OR improve it to allow "New Command" if it doesn't exist.
    // The user mentioned "commandx" format.

    if (base.toLowerCase() === 'command') {
        // Strict commandx format
        while (siblings.some(s => s.name === `${base}${index}`)) {
            index++;
        }
        return `${base}${index}`;
    }

    // For "New Group" or others, maybe we want "New Group" then "New Group 1"?
    // The sidebar logic was simple loop.
    // Let's replicate sidebar logic EXACTLY for now to ensure no regression, 
    // but maybe refine it slightly for "New Command" from SerialMonitor.

    while (siblings.some(s => s.name === `${base}${index}`)) {
        index++;
    }
    return `${base}${index}`;
};
