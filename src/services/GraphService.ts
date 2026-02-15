/**
 * 图编辑器数据服务
 * 管理图的节点和边，提供状态订阅和持久化功能
 */

// 图节点接口
export interface GraphNode {
    id: string;
    type: 'physical' | 'virtual' | 'pair' | 'bus';
    title?: string;
    portPath: string;
    position: { x: number; y: number };
}

// 图边接口
export interface GraphEdge {
    id: string;
    sourceStr: string;
    targetStr: string;
    active: boolean;
}

// 图数据接口
export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// 状态变更回调类型
type StateChangeCallback = () => void;

/**
 * 图数据服务类
 * 提供图数据的增删改查、状态订阅和持久化功能
 */
class GraphService {
    private nodes: GraphNode[] = [];
    private edges: GraphEdge[] = [];
    private stateListeners: Set<StateChangeCallback> = new Set();
    private static readonly STORAGE_KEY = 'graph-editor-data';

    constructor() {
        this.load();
    }

    /**
     * 获取当前图数据
     */
    public getGraph(): GraphData {
        return {
            nodes: [...this.nodes],
            edges: [...this.edges]
        };
    }

    /**
     * 更新图数据
     */
    public updateGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
        this.nodes = nodes;
        this.edges = edges;
        this.save();
        this.notifyStateChange();
    }

    /**
     * 添加节点
     */
    public addNode(node: GraphNode): void {
        this.nodes.push(node);
        this.save();
        this.notifyStateChange();
    }

    /**
     * 移除节点（同时移除相关的边）
     */
    public removeNode(nodeId: string): void {
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        this.edges = this.edges.filter(e => e.sourceStr !== nodeId && e.targetStr !== nodeId);
        this.save();
        this.notifyStateChange();
    }

    /**
     * 更新节点
     */
    public updateNode(nodeId: string, updates: Partial<GraphNode>): void {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
            Object.assign(node, updates);
            this.save();
            this.notifyStateChange();
        }
    }

    /**
     * 添加边
     */
    public addEdge(edge: GraphEdge): void {
        // 检查是否已存在相同的边
        const exists = this.edges.some(
            e => e.sourceStr === edge.sourceStr && e.targetStr === edge.targetStr
        );
        if (!exists) {
            this.edges.push(edge);
            this.save();
            this.notifyStateChange();
        }
    }

    /**
     * 移除边
     */
    public removeEdge(edgeId: string): void {
        this.edges = this.edges.filter(e => e.id !== edgeId);
        this.save();
        this.notifyStateChange();
    }

    /**
     * 清空图数据
     */
    public clearGraph(): void {
        this.nodes = [];
        this.edges = [];
        this.save();
        this.notifyStateChange();
    }

    /**
     * 订阅状态变更
     */
    public onStateChange(callback: StateChangeCallback): () => void {
        this.stateListeners.add(callback);
        // 返回取消订阅函数
        return () => {
            this.stateListeners.delete(callback);
        };
    }

    /**
     * 通知所有监听器状态已变更
     */
    private notifyStateChange(): void {
        this.stateListeners.forEach(callback => callback());
    }

    /**
     * 保存图数据到 localStorage
     */
    private save(): void {
        try {
            const data: GraphData = {
                nodes: this.nodes,
                edges: this.edges
            };
            localStorage.setItem(GraphService.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('[GraphService] Failed to save graph data:', error);
        }
    }

    /**
     * 从 localStorage 加载图数据
     */
    public load(): void {
        try {
            const saved = localStorage.getItem(GraphService.STORAGE_KEY);
            if (saved) {
                const data: GraphData = JSON.parse(saved);
                this.nodes = data.nodes || [];
                this.edges = data.edges || [];
                this.notifyStateChange();
            }
        } catch (error) {
            console.error('[GraphService] Failed to load graph data:', error);
            this.nodes = [];
            this.edges = [];
        }
    }
}

// 导出单例实例
export const graphService = new GraphService();

// 监听 storage 事件，处理跨标签页的数据同步
window.addEventListener('storage', (e) => {
    if (e.key === GraphService['STORAGE_KEY']) {
        graphService.load();
    }
});
