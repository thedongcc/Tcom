
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { SuggestionList, SuggestionListRef } from './SuggestionList';
import { tokenRegistry } from '../../tokens';

export const SuggestionExtension = Extension.create({
    name: 'suggestion',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                command: ({ editor, range, props }: { editor: any, range: any, props: any }) => {
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

/**
 * 通过 tokenRegistry 自动生成 / 快捷菜单条目。
 * 新增 Token 类型只需实现 suggestions() 方法，无需修改本文件。
 */
export const getSuggestionOptions = () => ({
    char: '/',
    allowSpaces: false,
    items: ({ query }: { query: string }) => {
        const items: any[] = [];

        for (const plugin of tokenRegistry.getAll()) {
            const colorValue = `var(${plugin.colorVar}, ${plugin.fallbackColor})`;
            const suggestions = plugin.suggestions?.() ?? [
                { title: plugin.label, config: plugin.defaultConfig() },
            ];

            for (const suggestion of suggestions) {
                items.push({
                    title: suggestion.title,
                    type: plugin.type,
                    config: suggestion.config,
                    icon: suggestion.icon,
                    iconColor: colorValue,
                    command: ({ editor, range }: any) => {
                        editor
                            .chain()
                            .focus()
                            .deleteRange(range)
                            .insertSerialToken({ type: plugin.type, config: suggestion.config })
                            .run();
                    },
                });
            }
        }

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
