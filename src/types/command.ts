import { Token } from './token';

export interface CommandCommon {
    id: string;
    name: string;
    parentId: string | null; // null for root
}

export interface CommandItem extends CommandCommon {
    type: 'command';
    payload: string; // The text content
    html?: string; // HTML content for token preservation
    mode: 'text' | 'hex';
    tokens: Record<string, Token>; // Tokens used in this command
    lineEnding?: '' | '\n' | '\r' | '\r\n';
}

export interface CommandGroup extends CommandCommon {
    type: 'group';
    isOpen?: boolean; // For UI expansion state
}

export type CommandEntity = CommandItem | CommandGroup;

// For state management (flat list is easier for lookup, but tree might be better for recursion)
// Let's stick to a flat list with parentId for flexibility in moving things around.
// Or maybe a nested structure is easier for ordering?
// The user said "default groups on top, then commands".
// If we use a flat list, we need to sort it every time.
// Let's use a flat list for storage, and build a tree for rendering.
