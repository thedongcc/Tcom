import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SerialTokenComponent } from './SerialTokenComponent'; // We will create this next

export interface SerialTokenOptions {
    HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        serialToken: {
            insertSerialToken: (options: { type: string; config: any }) => ReturnType;
        };
    }
}

export const SerialToken = Node.create<SerialTokenOptions>({
    name: 'serialToken',

    group: 'inline',

    inline: true,

    atom: true,

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-token-id'),
                renderHTML: attributes => ({
                    'data-token-id': attributes.id,
                }),
            },
            type: {
                default: 'flag',
                parseHTML: element => element.getAttribute('data-token-type'),
                renderHTML: attributes => ({
                    'data-token-type': attributes.type,
                }),
            },
            config: {
                default: {},
                parseHTML: element => {
                    const attr = element.getAttribute('data-token-config');
                    try {
                        return attr ? JSON.parse(decodeURIComponent(attr)) : {};
                    } catch {
                        return {};
                    }
                },
                renderHTML: attributes => ({
                    'data-token-config': encodeURIComponent(JSON.stringify(attributes.config)),
                }),
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-token-type]' },
            { tag: 'span[data-token-id]' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(SerialTokenComponent);
    },

    addCommands() {
        return {
            insertSerialToken:
                ({ type, config }) =>
                    ({ chain }) => {
                        const id = `token-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                        return chain()
                            .insertContent({
                                type: this.name,
                                attrs: { id, type, config },
                            })
                            .run();
                    },
        };
    },
});
