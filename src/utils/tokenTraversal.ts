/**
 * tokenTraversal.ts
 * Token 遍历工具 — 从 TipTap 编辑器 JSON 中提取所有 serialToken。
 * 消除 SerialInput.tsx 中重复的 TraverseNode 类型和 traverse 函数。
 */

/** TipTap JSON 节点类型 */
interface TraverseNode {
    type?: string;
    attrs?: any;
    content?: TraverseNode[];
}

/** Token 数据类型 */
interface TokenInfo {
    id: string;
    type: string;
    config: Record<string, any>;
}

/**
 * 从 TipTap JSON 节点树中提取所有 serialToken
 */
export function extractTokensFromJSON(json: TraverseNode): Record<string, TokenInfo> {
    const tokensMap: Record<string, TokenInfo> = {};
    const traverse = (node: TraverseNode) => {
        if (node.type === 'serialToken' && node.attrs) {
            const { id, type, config } = node.attrs as { id: string; type: any; config: any };
            tokensMap[id] = { id, type, config };
        }
        if (node.content) node.content.forEach(traverse);
    };
    traverse(json);
    return tokensMap;
}
