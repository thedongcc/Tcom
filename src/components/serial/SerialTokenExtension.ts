import { Node, mergeAttributes } from '@tiptap/core';
import { tokenRegistry } from '../../tokens';
import { createTranslator, type Language } from '../../i18n';

export const SERIAL_TOKEN_CLICK_EVENT = 'serial-token-click';

// 非 React 上下文中获取当前翻译函数
const getT = () => {
    try {
        const raw = localStorage.getItem('tcom-settings');
        const lang = raw ? (JSON.parse(raw)?.language as Language) : 'zh-CN';
        return createTranslator(lang || 'zh-CN');
    } catch {
        return createTranslator('zh-CN');
    }
};

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

            const dom = document.createElement('span');
            dom.className = 'inline select-none mx-[0.1em] align-baseline';

            const span = document.createElement('span');
            span.className = `
                inline-block
                rounded-[0.2em] text-[1em] font-[family-name:var(--font-mono)] font-normal leading-none
                cursor-pointer transition-colors
            `;

            // ─── 通过 registry 获取颜色，直接用 style.color 避免 Tailwind JIT 漏扫动态类 ───
            const updateColors = (type: string) => {
                const plugin = tokenRegistry.get(type);
                const colorVar = plugin?.colorVar ?? '--st-token-flag';
                const fallback = plugin?.fallbackColor ?? '#c586c0';
                // 使用 var(--xxx, 兜底色) 确保 CSS 变量未注入时仍能正确显示
                span.style.color = `var(${colorVar}, ${fallback})`;
            };

            // ─── 通过 registry 获取显示标签 ─────────────────────────────
            const updateLabel = (attrs: any) => {
                const { type, config } = attrs;
                const plugin = tokenRegistry.get(type);
                const label = plugin ? plugin.getLabel(config) : 'Unknown';
                const isBold = plugin?.isBold ?? false;
                span.innerHTML = `<span class="opacity-50 mr-[0.1em]">/</span><span class="${isBold ? 'font-medium' : ''}">${label}</span>`;
            };

            updateColors(node.attrs.type);
            updateLabel(node.attrs);

            // ─── 自定义 Tooltip（与项目 Tooltip 组件样式一致） ──────────
            let tooltipEl: HTMLDivElement | null = null;
            let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

            const showDomTooltip = () => {
                tooltipTimer = setTimeout(() => {
                    if (tooltipEl) return;

                    // 获取操作提示文案（auto_inc 额外显示右键重置）
                    const t = getT();
                    const isAutoInc = currentNode.attrs.type === 'auto_inc';
                    const tooltipText = isAutoInc
                        ? t('serial.tokenAutoIncHint')
                        : t('serial.tokenClickHint');

                    tooltipEl = document.createElement('div');
                    tooltipEl.className = 'fixed z-[99999] pointer-events-none';

                    const inner = document.createElement('div');
                    inner.className = 'px-2 py-1 text-[12px] font-medium rounded shadow-lg border max-w-[300px] w-max whitespace-normal break-words text-left leading-snug backdrop-blur-md';
                    inner.style.cssText = 'background: var(--st-tooltip-bg); color: var(--st-tooltip-text); border-color: var(--st-tooltip-border); animation: fadeIn 120ms ease-out;';
                    inner.textContent = tooltipText;
                    tooltipEl.appendChild(inner);
                    document.body.appendChild(tooltipEl);

                    // 定位：显示在 token 正上方
                    const rect = span.getBoundingClientRect();
                    const tooltipRect = tooltipEl.getBoundingClientRect();
                    const offset = 4;
                    let top = rect.top - offset - tooltipRect.height;

                    // 顶部溢出则翻转到下方
                    if (top < 4) top = rect.bottom + offset;

                    tooltipEl.style.top = `${top}px`;
                    tooltipEl.style.left = `${Math.max(4, rect.left + rect.width / 2 - tooltipRect.width / 2)}px`;
                }, 300);
            };

            const hideDomTooltip = () => {
                if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
                if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
            };

            span.addEventListener('mouseenter', showDomTooltip);
            span.addEventListener('mouseleave', hideDomTooltip);

            // ─── 点击打开配置弹窗 ───────────────────────────────────────
            span.onclick = (e) => {
                e.stopPropagation();
                hideDomTooltip();
                const { id, type, config } = currentNode.attrs;
                const rect = span.getBoundingClientRect();
                const event = new CustomEvent(SERIAL_TOKEN_CLICK_EVENT, {
                    detail: { id, type, config, x: rect.left, y: rect.top, pos: getPos() }
                });
                window.dispatchEvent(event);
            };

            // ─── 右键通过 registry 处理 ─────────────────────────────────
            span.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const plugin = tokenRegistry.get(currentNode.attrs.type);
                if (!plugin?.onContextMenu) return;
                const newConfig = plugin.onContextMenu(currentNode.attrs.config);
                if (newConfig === null) return;
                const newConfigCopy = JSON.parse(JSON.stringify(newConfig));
                editor.chain().focus().command(({ tr }) => {
                    tr.setNodeAttribute(getPos() as number, 'config', newConfigCopy);
                    return true;
                }).run();
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
                },
                destroy: () => {
                    hideDomTooltip();
                    span.removeEventListener('mouseenter', showDomTooltip);
                    span.removeEventListener('mouseleave', hideDomTooltip);
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
