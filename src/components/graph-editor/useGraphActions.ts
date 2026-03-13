/**
 * useGraphActions.ts
 * 图编辑器的节点/连线/拖放交互逻辑。
 * 从 GraphEditor.tsx 中拆分出来。
 */
import { useCallback, useRef } from 'react';
import { DragEndEvent } from '@dnd-kit/core';
import { graphService, GraphNode as IGraphNode, GraphEdge as IGraphEdge } from '../../services/GraphService';
import { GraphLayout } from './GraphStyles';
import { useConfirm } from '../../context/ConfirmContext';

interface UseGraphActionsParams {
    nodes: IGraphNode[];
    edges: IGraphEdge[];
    scale: number;
    pan: { x: number; y: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
    setNodes: React.Dispatch<React.SetStateAction<IGraphNode[]>>;
    setEdges: React.Dispatch<React.SetStateAction<IGraphEdge[]>>;
    setActiveDrag: React.Dispatch<React.SetStateAction<{ id: string; delta: { x: number; y: number } } | null>>;
    setTempEdge: React.Dispatch<React.SetStateAction<{ sourceX: number; sourceY: number; targetX: number; targetY: number } | null>>;
    setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
    setSelectedEdgeId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useGraphActions = ({
    nodes, edges, scale, pan, containerRef,
    setNodes, setEdges, setActiveDrag, setTempEdge,
    setSelectedNodeId, setSelectedEdgeId,
}: UseGraphActionsParams) => {
    const { confirm } = useConfirm();
    const tempEdgeRef = useRef<{ sourceNode: string; type: 'source' | 'target' } | null>(null);

    // ─── 拖放处理 ──────────────────────────────────────────────────────
    const handleDragStart = useCallback((event: any) => {
        setActiveDrag({ id: event.active.id, delta: { x: 0, y: 0 } });
    }, [setActiveDrag]);

    const handleDragMove = useCallback((event: any) => {
        const { active, delta } = event;
        setActiveDrag({ id: active.id, delta: { x: delta.x / scale, y: delta.y / scale } });
    }, [scale, setActiveDrag]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { id } = event.active;
        const { delta } = event;

        const newNodes = nodes.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    position: {
                        x: n.position.x + delta.x / scale,
                        y: n.position.y + delta.y / scale
                    }
                };
            }
            return n;
        });

        setNodes(newNodes);
        graphService.updateGraph(newNodes, edges);
        setActiveDrag(null);
    }, [nodes, edges, scale, setNodes, setActiveDrag]);

    // ─── 节点操作 ──────────────────────────────────────────────────────
    const addNode = useCallback((type: 'physical' | 'virtual' | 'pair' | 'bus') => {
        const id = `node-${Date.now()}`;
        const newNode: IGraphNode = {
            id,
            type,
            title: type === 'pair' ? 'Pairing Node' : type === 'bus' ? 'Shared Bus' : `New ${type}`,
            portPath: type === 'pair' ? 'Bridge' : type === 'bus' ? 'Bus' : type === 'physical' ? 'COM1' : `COM${nodes.length + 10}`,
            position: { x: 100 + Math.abs(pan.x / scale), y: 100 + Math.abs(pan.y / scale) }
        };
        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        graphService.updateGraph(newNodes, edges);
    }, [nodes, edges, scale, pan, setNodes]);

    const clearGraph = useCallback(async () => {
        const ok = await confirm({
            title: '清空图形',
            message: '确定要清空整个图形吗？所有节点和连接都将丢失。',
            type: 'danger',
            confirmText: '继续清空'
        });
        if (ok) {
            graphService.updateGraph([], []);
        }
    }, [confirm]);

    // ─── 连线逻辑 ──────────────────────────────────────────────────────
    const getHandlePos = useCallback((nodeId: string, type: 'source' | 'target') => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };
        return GraphLayout.getPortCoordinates(node, type);
    }, [nodes]);

    // 连线鼠标移动
    const handleWireMouseMove = useCallback((e: MouseEvent) => {
        if (!tempEdgeRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / scale;
        const y = (e.clientY - rect.top - pan.y) / scale;

        setTempEdge(prev => {
            if (!prev) return null;
            return { ...prev, targetX: x, targetY: y };
        });
    }, [pan, scale, containerRef, setTempEdge]);

    // 连线鼠标释放
    const handleWireMouseUp = useCallback((e: MouseEvent) => {
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        let handleEl = targetEl as HTMLElement | null;
        while (handleEl && !handleEl.hasAttribute('data-handle-id')) {
            handleEl = handleEl.parentElement;
            if (handleEl === document.body) { handleEl = null; break; }
        }

        if (handleEl && tempEdgeRef.current) {
            const targetId = handleEl.getAttribute('data-handle-id');
            const targetType = handleEl.getAttribute('data-handle-type');

            if (targetId && targetType && targetId !== tempEdgeRef.current.sourceNode) {
                let sourceNodeId = tempEdgeRef.current.sourceNode;
                let targetNodeId = targetId;

                let isValid = false;
                if (tempEdgeRef.current.type === 'source' && targetType === 'target') {
                    isValid = true;
                } else if (tempEdgeRef.current.type === 'target' && targetType === 'source') {
                    sourceNodeId = targetId;
                    targetNodeId = tempEdgeRef.current.sourceNode;
                    isValid = true;
                }

                if (isValid) {
                    if (!edges.some(edge => edge.sourceStr === sourceNodeId && edge.targetStr === targetNodeId)) {
                        const newEdge: IGraphEdge = {
                            id: `edge-${Date.now()}`,
                            sourceStr: sourceNodeId,
                            targetStr: targetNodeId,
                            active: true
                        };
                        const newEdges = [...edges, newEdge];
                        setEdges(newEdges);
                        graphService.updateGraph(nodes, newEdges);
                    }
                }
            }
        }

        window.removeEventListener('mousemove', handleWireMouseMove);
        window.removeEventListener('mouseup', handleWireMouseUp);
        setTempEdge(null);
        tempEdgeRef.current = null;
    }, [nodes, edges, handleWireMouseMove, setEdges, setTempEdge]);

    // 连线开始（从节点 handle）
    const handleHandleMouseDown = useCallback((nodeId: string, type: 'source' | 'target') => {
        tempEdgeRef.current = { sourceNode: nodeId, type };

        const startPos = getHandlePos(nodeId, type);
        setTempEdge({
            sourceX: startPos.x,
            sourceY: startPos.y,
            targetX: startPos.x,
            targetY: startPos.y
        });

        window.addEventListener('mousemove', handleWireMouseMove);
        window.addEventListener('mouseup', handleWireMouseUp);
    }, [getHandlePos, handleWireMouseMove, handleWireMouseUp, setTempEdge]);

    // ─── 键盘删除 ─────────────────────────────────────────────────────
    const handleDeleteKey = useCallback((selectedNodeId: string | null, selectedEdgeId: string | null) => {
        if (selectedNodeId) {
            const newNodes = nodes.filter(n => n.id !== selectedNodeId);
            const newEdges = edges.filter(e => e.sourceStr !== selectedNodeId && e.targetStr !== selectedNodeId);
            setNodes(newNodes);
            setEdges(newEdges);
            graphService.updateGraph(newNodes, newEdges);
            setSelectedNodeId(null);
        }
        if (selectedEdgeId) {
            const newEdges = edges.filter(e => e.id !== selectedEdgeId);
            setEdges(newEdges);
            graphService.updateGraph(nodes, newEdges);
            setSelectedEdgeId(null);
        }
    }, [nodes, edges, setNodes, setEdges, setSelectedNodeId, setSelectedEdgeId]);

    return {
        handleDragStart, handleDragMove, handleDragEnd,
        addNode, clearGraph,
        handleHandleMouseDown, handleDeleteKey,
    };
};
