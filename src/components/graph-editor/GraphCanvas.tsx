import { GraphNode as IGraphNode, GraphEdge as IGraphEdge } from '../../services/GraphService';
import { GraphLayout } from './GraphStyles';

interface GraphCanvasProps {
    nodes: IGraphNode[];
    edges: IGraphEdge[];
    tempEdge?: { sourceX: number, sourceY: number, targetX: number, targetY: number } | null;
    activeDrag?: { id: string, delta: { x: number, y: number } } | null;
    selectedEdgeId?: string | null;
    onEdgeSelect?: (id: string) => void;
}

export const GraphCanvas = ({ nodes, edges, tempEdge, activeDrag, selectedEdgeId, onEdgeSelect }: GraphCanvasProps) => {



    const getHandlePos = (nodeId: string, type: 'source' | 'target') => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };

        let { x, y } = node.position;

        // Apply drag delta if this is the active node
        if (activeDrag && activeDrag.id === nodeId) {
            x += activeDrag.delta.x;
            y += activeDrag.delta.y;
        }

        // Use strict layout + drag position
        return GraphLayout.getPortCoordinates({ position: { x, y } }, type);
    };

    const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
        // Horizontal Bezier
        const dist = Math.abs(x2 - x1);
        const cp1x = x1 + Math.max(dist * 0.5, 30);
        const cp2x = x2 - Math.max(dist * 0.5, 30);
        // ComfyUI style: smooth S-curve
        return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
    };

    return (
        <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible z-0">
            {edges.map(edge => {
                const src = getHandlePos(edge.sourceStr, 'source');
                const tgt = getHandlePos(edge.targetStr, 'target');
                const isSelected = selectedEdgeId === edge.id;

                return (
                    <g key={edge.id} className="pointer-events-auto">
                        {/* Invisible thick path for easier clicking */}
                        <path
                            d={getBezierPath(src.x, src.y, tgt.x, tgt.y)}
                            stroke="transparent"
                            strokeWidth="15"
                            fill="none"
                            className="cursor-pointer"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onEdgeSelect?.(edge.id);
                            }}
                        />
                        {/* Visible Wire */}
                        <path
                            d={getBezierPath(src.x, src.y, tgt.x, tgt.y)}
                            stroke={isSelected ? "#4ec9b0" : (edge.active ? "var(--vscode-textLink-foreground)" : "#666")}
                            strokeWidth={isSelected ? "3" : "2"}
                            fill="none"
                            className="pointer-events-none transition-colors"
                        />
                    </g>
                );
            })}
            {tempEdge && (
                <path
                    d={getBezierPath(tempEdge.sourceX, tempEdge.sourceY, tempEdge.targetX, tempEdge.targetY)}
                    stroke="var(--vscode-textLink-foreground)"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    fill="none"
                    className="pointer-events-none"
                />
            )}
        </svg>
    );
};
