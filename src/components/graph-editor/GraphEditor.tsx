import { useState, useRef, useEffect } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, DragEndEvent } from '@dnd-kit/core';
import { graphService, GraphNode as IGraphNode, GraphEdge as IGraphEdge } from '../../services/GraphService';
import { GraphNode } from './GraphNode';
import { useConfirm } from '../../context/ConfirmContext';
import { GraphCanvas } from './GraphCanvas';
import { GraphLayout } from './GraphStyles';
import { Plus, Trash2, Layout, ZoomIn, ZoomOut, Link, Network } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';

interface GraphEditorProps {
    sessionId?: string;
}

export const GraphEditor = ({ sessionId }: GraphEditorProps) => {
    const { confirm } = useConfirm();
    const { t } = useI18n();
    // Local state for UI responsiveness, synced with Service
    const [nodes, setNodes] = useState<IGraphNode[]>([]);
    const [edges, setEdges] = useState<IGraphEdge[]>([]);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const tempEdgeRef = useRef<{ sourceNode: string, type: 'source' | 'target' } | null>(null);

    // Temp edge for visual rendering
    const [tempEdge, setTempEdge] = useState<{ sourceX: number, sourceY: number, targetX: number, targetY: number } | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [activeDrag, setActiveDrag] = useState<{ id: string, delta: { x: number, y: number } } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // Initial Load & Sync using graphService
    useEffect(() => {
        const update = () => {
            const g = graphService.getGraph();
            setNodes(g.nodes);
            setEdges(g.edges);
        };
        update();
        const unsub = graphService.onStateChange(update);
        return () => unsub();
    }, [sessionId]);

    // Zoom Wheel Logic (Non-passive)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const zoomDelta = e.deltaY * -0.001;
                setScale(s => Math.min(Math.max(0.1, s + zoomDelta), 5));
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    // Handle Delete Key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
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
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, selectedEdgeId, nodes, edges]);

    // Drag State for smooth lines

    const handleDragStart = (event: any) => {
        setActiveDrag({ id: event.active.id, delta: { x: 0, y: 0 } });
    };

    const handleDragMove = (event: any) => {
        const { active, delta } = event;
        setActiveDrag({ id: active.id, delta: { x: delta.x / scale, y: delta.y / scale } });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { id } = event.active;
        const { delta } = event;

        const newNodes = nodes.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    position: {
                        x: n.position.x + delta.x / scale, // Adjust for zoom
                        y: n.position.y + delta.y / scale
                    }
                };
            }
            return n;
        });

        setNodes(newNodes);
        graphService.updateGraph(newNodes, edges);
        setActiveDrag(null);
    };

    const addNode = (type: 'physical' | 'virtual' | 'pair' | 'bus') => {
        const id = `node-${Date.now()}`;
        const newNode: IGraphNode = {
            id,
            type,
            title: type === 'pair' ? 'Pairing Node' : type === 'bus' ? 'Shared Bus' : `New ${type}`,
            portPath: type === 'pair' ? 'Bridge' : type === 'bus' ? 'Bus' : type === 'physical' ? 'COM1' : `COM${nodes.length + 10}`,
            position: { x: 100 + Math.abs(pan.x / scale), y: 100 + Math.abs(pan.y / scale) } // Center(ish)
        };
        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        graphService.updateGraph(newNodes, edges);
    };

    // Helper to get handle position
    const getHandlePos = (nodeId: string, type: 'source' | 'target') => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };
        return GraphLayout.getPortCoordinates(node, type);
    };

    const handleHandleMouseDown = (nodeId: string, type: 'source' | 'target') => {
        tempEdgeRef.current = { sourceNode: nodeId, type };

        const startPos = getHandlePos(nodeId, type);
        // Initialize temp edge
        setTempEdge({
            sourceX: startPos.x,
            sourceY: startPos.y,
            targetX: startPos.x,
            targetY: startPos.y
        });

        // Add specific mouse move/up listeners for the wire drag
        window.addEventListener('mousemove', handleWireMouseMove);
        window.addEventListener('mouseup', handleWireMouseUp);
    };

    const handleWireMouseMove = (e: MouseEvent) => {
        if (!tempEdgeRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / scale;
        const y = (e.clientY - rect.top - pan.y) / scale;

        setTempEdge(prev => {
            if (!prev) return null;
            return { ...prev, targetX: x, targetY: y };
        });
    };

    const handleWireMouseUp = (e: MouseEvent) => {
        // Check if we dropped on a handle
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        // Traverse up to find handle
        let handleEl = targetEl;
        while (handleEl && !handleEl.hasAttribute('data-handle-id')) {
            handleEl = handleEl.parentElement;
            if (handleEl === document.body) { handleEl = null; break; }
        }

        if (handleEl && tempEdgeRef.current) {
            const targetId = handleEl.getAttribute('data-handle-id');
            const targetType = handleEl.getAttribute('data-handle-type');

            if (targetId && targetType && targetId !== tempEdgeRef.current.sourceNode) {
                // Determine Source vs Target based on Types
                let sourceNodeId = tempEdgeRef.current.sourceNode;
                let targetNodeId = targetId;

                let isValid = false;
                if (tempEdgeRef.current.type === 'source' && targetType === 'target') {
                    isValid = true;
                } else if (tempEdgeRef.current.type === 'target' && targetType === 'source') {
                    // Swapped
                    sourceNodeId = targetId;
                    targetNodeId = tempEdgeRef.current.sourceNode;
                    isValid = true;
                }

                if (isValid) {
                    // Check duplicates
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

        // Cleanup
        window.removeEventListener('mousemove', handleWireMouseMove);
        window.removeEventListener('mouseup', handleWireMouseUp);
        setTempEdge(null);
        tempEdgeRef.current = null;
    };

    const clearGraph = async () => {
        const ok = await confirm({
            title: '清空图形',
            message: '确定要清空整个图形吗？所有节点和连接都将丢失。',
            type: 'danger',
            confirmText: '继续清空'
        });
        if (ok) {
            graphService.updateGraph([], []);
        }
    };


    // --- Pan / Zoom / Drag Logic ---
    const [isPanning, setIsPanning] = useState(false);
    const lastPanObj = useRef({ x: 0, y: 0 });

    const handlePointerDown = (e: React.PointerEvent) => {
        // Right click or Middle click - Pan
        if (e.button === 2 || e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            lastPanObj.current = { x: e.clientX, y: e.clientY };
            (e.target as Element).setPointerCapture(e.pointerId);
        }
        // Left click on background - Deselect
        else if (e.button === 0) {
            const target = e.target as HTMLElement;
            // Check if clicking on the main container or the graph surface
            if (target === e.currentTarget || target.getAttribute('data-id') === 'graph-surface') {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isPanning) {
            e.preventDefault();
            const dx = e.clientX - lastPanObj.current.x;
            const dy = e.clientY - lastPanObj.current.y;
            lastPanObj.current = { x: e.clientX, y: e.clientY };
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isPanning) {
            setIsPanning(false);
            (e.target as Element).releasePointerCapture(e.pointerId);
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-[#1e1e1e] overflow-hidden"
            onContextMenu={e => e.preventDefault()} // Block context menu
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {/* Grid Background */}
            <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)',
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                }}
            />

            {/* Toolbar */}
            <div className="absolute top-4 left-4 z-50 flex gap-2">
                <div className="flex bg-[#252526] rounded-md border border-[#3c3c3c] overflow-hidden shadow-lg [&_button]:flex">
                    <Tooltip content={t('graph.addVirtual')} position="bottom">
                        <button onClick={() => addNode('virtual')} className="p-2 hover:bg-[#3c3c3c] text-[#4ec9b0]">
                            <Plus size={16} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('graph.addPhysical')} position="bottom">
                        <button onClick={() => addNode('physical')} className="p-2 hover:bg-[#3c3c3c] text-[#ce9178]">
                            <Plus size={16} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('graph.addPair')} position="bottom">
                        <button onClick={() => addNode('pair')} className="p-2 hover:bg-[#3c3c3c] text-[#c586c0]">
                            <Link size={16} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('graph.addBus')} position="bottom">
                        <button onClick={() => addNode('bus')} className="p-2 hover:bg-[#3c3c3c] text-[#dcdcaa]">
                            <Network size={16} />
                        </button>
                    </Tooltip>
                    <div className="w-[1px] bg-[#3c3c3c]"></div>
                    <Tooltip content={t('graph.clearGraph')} position="bottom">
                        <button onClick={clearGraph} className="p-2 hover:bg-red-900/50 text-red-400">
                            <Trash2 size={16} />
                        </button>
                    </Tooltip>
                </div>

                <div className="flex bg-[#252526] rounded-md border border-[#3c3c3c] overflow-hidden shadow-lg ml-4">
                    <button onClick={() => setScale(s => s + 0.1)} className="p-2 hover:bg-[#3c3c3c] text-gray-400"><ZoomIn size={16} /></button>
                    <span className="p-2 px-3 text-xs text-gray-500 font-mono flex items-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-[#3c3c3c] text-gray-400"><ZoomOut size={16} /></button>
                    <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} className="p-2 hover:bg-[#3c3c3c] text-gray-400"><Layout size={16} /></button>
                </div>
            </div>

            {/* Graph Content */}
            <div
                className="absolute inset-0 origin-top-left touch-none"
                data-id="graph-surface"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >

                <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                >
                    <GraphCanvas
                        nodes={nodes}
                        edges={edges}
                        tempEdge={tempEdge}
                        activeDrag={activeDrag}
                        selectedEdgeId={selectedEdgeId}
                        onEdgeSelect={(id) => {
                            setSelectedEdgeId(id);
                            setSelectedNodeId(null); // Deselect nodes when edge selected
                        }}
                    />

                    {nodes.map(node => {
                        return (
                            <GraphNode
                                key={node.id}
                                {...node}
                                x={node.position.x}
                                y={node.position.y}
                                isSelected={selectedNodeId === node.id}
                                onSelect={(id) => {
                                    setSelectedNodeId(id);
                                    setSelectedEdgeId(null);
                                }}
                                onHandleMouseDown={handleHandleMouseDown}
                                scale={scale}
                            />
                        )
                    })}
                </DndContext>
            </div>
        </div>
    );
};
