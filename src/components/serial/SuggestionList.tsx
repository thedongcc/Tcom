
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Settings, Clock, Flag, Hash } from 'lucide-react';

export interface SuggestionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SuggestionListProps {
    items: any[];
    command: (item: any) => void;
}

export const SuggestionList = forwardRef<SuggestionListRef, SuggestionListProps>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
        const item = props.items[index];
        if (item) {
            props.command(item);
        }
    };

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
        selectItem(selectedIndex);
    };

    useEffect(() => {
        setSelectedIndex(0);
    }, [props.items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (event.key === 'ArrowUp') {
                upHandler();
                return true;
            }

            if (event.key === 'ArrowDown') {
                downHandler();
                return true;
            }

            if (event.key === 'Enter') {
                enterHandler();
                return true;
            }

            if (event.key === 'Tab') {
                enterHandler();
                return true;
            }

            return false;
        },
    }));

    return (
        <div className="bg-[var(--sidebar-background)] border border-[var(--widget-border-color)] rounded-md shadow-lg overflow-hidden min-w-[180px] p-1 flex flex-col gap-0.5">
            {props.items.length > 0 ? (
                props.items.map((item, index) => {
                    const Icon = item.icon || Hash;
                    return (
                        <button
                            key={index}
                            className={`flex items-center gap-2 px-2 py-1.5 text-xs text-left w-full rounded-sm transition-colors ${index === selectedIndex
                                ? 'bg-[var(--button-background)] text-[var(--button-foreground)]'
                                : 'text-[var(--app-foreground)] hover:bg-[var(--list-hover-background)]'
                                }`}
                            onClick={() => selectItem(index)}
                        >
                            <Icon size={14} className={index === selectedIndex ? 'text-[var(--button-foreground)]' : item.iconColor || 'text-[var(--activitybar-inactive-foreground)]'} />
                            <span className="flex-1 font-mono">{item.title}</span>
                            {item.shortcut && <span className="opacity-50 text-[10px]">{item.shortcut}</span>}
                        </button>
                    );
                })
            ) : (
                <div className="px-2 py-1.5 text-xs text-[var(--input-placeholder-color)] italic">No match found</div>
            )}
        </div>
    );
});

SuggestionList.displayName = 'SuggestionList';
