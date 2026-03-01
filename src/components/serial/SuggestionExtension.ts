
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { SuggestionList, SuggestionListRef } from './SuggestionList';
import { Hash, Flag, Clock, Settings } from 'lucide-react';

export const SuggestionExtension = Extension.create({
    name: 'suggestion',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                command: ({ editor, range, props }) => {
                    props.command({ editor, range });
                },
            },
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ];
    },
});

export const getSuggestionOptions = () => ({
    char: '/',
    allowSpaces: false,
    items: ({ query }: { query: string }) => {
        const items = [
            {
                title: 'CRC16-Modbus',
                type: 'crc',
                config: { algorithm: 'modbus-crc16' },
                icon: Hash,
                iconColor: 'text-[var(--st-token-crc)]',
                command: ({ editor, range }: any) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertSerialToken({ type: 'crc', config: { algorithm: 'modbus-crc16' } })
                        .run();
                },
            },
            {
                title: 'CRC16-CCITT',
                type: 'crc',
                config: { algorithm: 'ccitt-crc16' },
                icon: Hash,
                iconColor: 'text-[var(--st-token-crc)]',
                command: ({ editor, range }: any) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertSerialToken({ type: 'crc', config: { algorithm: 'ccitt-crc16' } })
                        .run();
                },
            },
            {
                title: 'CRC32',
                type: 'crc',
                config: { algorithm: 'crc32' },
                icon: Hash,
                iconColor: 'text-[var(--st-token-crc)]',
                command: ({ editor, range }: any) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertSerialToken({ type: 'crc', config: { algorithm: 'crc32' } })
                        .run();
                },
            },
            {
                title: 'Custom',
                type: 'flag',
                config: { hex: 'AA55' }, // Default placeholder
                icon: Flag,
                iconColor: 'text-[var(--st-token-flag)]',
                command: ({ editor, range }: any) => {
                    // Start with empty flag or specialized dialog? 
                    // For now, insert default flag token which user can click to configure
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertSerialToken({ type: 'flag', config: { hex: 'AA55' } })
                        .run();
                },
            },
            {
                title: 'Timestamp (s)',
                type: 'timestamp',
                config: { format: 'seconds' },
                icon: Clock,
                iconColor: 'text-[#4fc1ff]',
                command: ({ editor, range }: any) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertSerialToken({ type: 'timestamp', config: { format: 'seconds' } })
                        .run();
                },
            },
            {
                title: 'Timestamp (ms)',
                type: 'timestamp',
                config: { format: 'milliseconds' }, // Correct type literal
                icon: Clock,
                iconColor: 'text-[#4fc1ff]',
                command: ({ editor, range }: any) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertSerialToken({ type: 'timestamp', config: { format: 'milliseconds' } })
                        .run();
                },
            },
            {
                title: 'Auto',
                type: 'auto_inc',
                config: { bytes: 1, defaultValue: '00', currentValue: '00', step: 1 },
                icon: Settings,
                iconColor: 'text-[#c586c0]',
                command: ({ editor, range }: any) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertSerialToken({ type: 'auto_inc', config: { bytes: 1, defaultValue: '00', currentValue: '00', step: 1 } })
                        .run();
                },
            },
        ];

        return items.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
    },

    render: () => {
        let component: ReactRenderer<SuggestionListRef> | null = null;
        let popup: TippyInstance[] | null = null;

        return {
            onStart: (props: any) => {
                component = new ReactRenderer(SuggestionList, {
                    props,
                    editor: props.editor,
                });

                if (!props.clientRect) {
                    return;
                }

                popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                });
            },

            onUpdate(props: any) {
                component?.updateProps(props);

                if (!props.clientRect) {
                    return;
                }

                popup?.[0].setProps({
                    getReferenceClientRect: props.clientRect,
                });
            },

            onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                    popup?.[0].hide();
                    return true;
                }

                return component?.ref?.onKeyDown(props) || false;
            },

            onExit() {
                popup?.[0].destroy();
                component?.destroy();
            },
        };
    },
});
