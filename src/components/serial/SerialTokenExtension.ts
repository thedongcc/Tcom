import { Node, mergeAttributes } from '@tiptap/core';

export const SERIAL_TOKEN_CLICK_EVENT = 'serial-token-click';

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
        return ({ node, getPos, editor }) => {
            let currentNode = node;

            // Create container
            const dom = document.createElement('span');
            dom.className = 'inline select-none mx-[1px] align-baseline';

            // Create content wrapper
            const span = document.createElement('span');
            span.className = `
                inline-block
                rounded-[2px] text-[13px] font-[family-name:var(--font-mono)] font-normal leading-none
                cursor-pointer transition-colors
            `;

            // Apply type-specific colors
            const updateColors = (type: string) => {
                span.classList.remove('text-[#4ec9b0]', 'text-[#4fc1ff]', 'text-[#c586c0]', 'text-[#f48771]');
                if (type === 'crc') span.classList.add('text-[#4ec9b0]');
                else if (type === 'timestamp') span.classList.add('text-[#4fc1ff]');
                else if (type === 'auto_inc') span.classList.add('text-[#c586c0]');
                else span.classList.add('text-[#f48771]');
            };

            updateColors(node.attrs.type);
            span.title = 'Click to configure';

            // Helper to update label
            const updateLabel = (attrs: any) => {
                const { type, config } = attrs;
                let label = 'Unknown';

                if (type === 'crc') {
                    if (config.algorithm === 'modbus-crc16') label = 'CRC16-Modbus';
                    else if (config.algorithm === 'ccitt-crc16') label = 'CRC16-CCITT';
                    else label = `CRC:${config.algorithm}`;
                } else if (type === 'flag') {
                    const hex = config.hex || '';
                    const display = hex.length > 20 ? hex.substring(0, 20) + '...' : hex;
                    label = config.name ? `${config.name}: ${display}` : (hex ? `Flag:${display}` : 'Flag');
                } else if (type === 'timestamp') {
                    label = config.format === 'milliseconds' ? 'Time:Unix_ms' : 'Time:Unix_s';
                } else if (type === 'auto_inc') {
                    label = `Val:${config.currentValue || config.defaultValue || '00'}`;
                }

                span.innerHTML = `<span class="opacity-50 mr-[1px]">/</span><span class="${type === 'crc' ? 'font-medium' : ''}">${label}</span>`;
            };

            updateLabel(node.attrs);

            // Click Handler
            const SERIAL_TOKEN_CLICK_EVENT = 'serial-token-click';
            span.onclick = (e) => {
                e.stopPropagation();
                const { id, type, config } = currentNode.attrs;
                const rect = span.getBoundingClientRect();
                const event = new CustomEvent(SERIAL_TOKEN_CLICK_EVENT, {
                    detail: { id, type, config, x: rect.left, y: rect.bottom, pos: getPos() }
                });
                window.dispatchEvent(event);
            };

            // Right Click / Context Menu Handler (Reset)
            span.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Use editor.commands to ensure we follow the framework's way
                if (currentNode.attrs.type === 'auto_inc') {
                    const currentConfig = currentNode.attrs.config;
                    const newConfig = JSON.parse(JSON.stringify({
                        ...currentConfig,
                        currentValue: currentConfig.defaultValue
                    }));

                    editor.chain().focus().command(({ tr }) => {
                        tr.setNodeAttribute(getPos(), 'config', newConfig);
                        return true;
                    }).run();
                }
            };

            dom.appendChild(span);

            return {
                dom,
                update: (updatedNode) => {
                    if (updatedNode.type.name !== this.name) return false;
                    currentNode = updatedNode;
                    updateColors(currentNode.attrs.type);
                    updateLabel(currentNode.attrs);
                    return true;
                },
                selectNode: () => {
                    span.classList.add('ring-1', 'ring-[var(--focus-border-color)]');
                },
                deselectNode: () => {
                    span.classList.remove('ring-1', 'ring-[var(--focus-border-color)]');
                }
            };
        };
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
