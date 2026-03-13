/**
 * editorLayoutTypes.ts
 * 编辑器布局的类型定义和树操作工具函数。
 * 从 useEditorLayout.ts 中拆分出来。
 */

// ── 类型定义 ──

export type Direction = 'horizontal' | 'vertical';

export interface SplitNode {
    type: 'split';
    id: string;
    direction: Direction;
    children: LayoutNode[];
    size?: number;
}

export interface LeafNode {
    type: 'leaf';
    id: string;
    views: string[];
    activeViewId: string | null;
    size?: number;
}

export type LayoutNode = SplitNode | LeafNode;

export interface EditorLayoutState {
    root: LayoutNode | null;
    activeGroupId: string | null;
}

// ── 树操作工具函数 ──

// 根据 ID 查找节点
export const findNode = (node: LayoutNode, id: string): LayoutNode | null => {
    if (node.id === id) return node;
    if (node.type === 'split') {
        for (const child of node.children) {
            const result = findNode(child, id);
            if (result) return result;
        }
    }
    return null;
};

// 查找节点的父节点
export const findParent = (root: LayoutNode, nodeId: string): { parent: SplitNode, index: number } | null => {
    if (root.type !== 'split') return null;
    for (let i = 0; i < root.children.length; i++) {
        const child = root.children[i];
        if (child.id === nodeId) return { parent: root, index: i };
        if (child.type === 'split') {
            const result = findParent(child, nodeId);
            if (result) return result;
        }
    }
    return null;
};

// 获取所有叶子节点
export const getAllLeaves = (node: LayoutNode): LeafNode[] => {
    if (node.type === 'leaf') return [node];
    return node.children.flatMap(getAllLeaves);
};

// 标准化树（移除空分割、合并单子节点分割）
export const normalizeTree = (node: LayoutNode): LayoutNode | null => {
    if (node.type === 'leaf') {
        return node;
    }

    const newChildren = node.children
        .map(normalizeTree)
        .filter((c): c is LayoutNode => c !== null);

    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) return newChildren[0];

    return { ...node, children: newChildren };
};
