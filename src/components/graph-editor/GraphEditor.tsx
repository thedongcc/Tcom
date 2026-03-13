import { useState, useRef, useEffect } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { graphService, GraphNode as IGraphNode, GraphEdge as IGraphEdge } from '../../services/GraphService';
import { GraphNode } from './GraphNode';
import { GraphCanvas } from './GraphCanvas';
import { Plus, Trash2, Layout, ZoomIn, ZoomOut, Link, Network } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';
import { useGraphActions } from './useGraphActions';

interface GraphEditorProps {
    sessionId?: string;
}

export const GraphEditor = ({ sessionId }: GraphEditorProps) => {
    const { t } = useI18n();
    // 本地 UI 状态，与 Service 同步
    const [nodes, setNodes] = useState<IGraphNode[]>([]);
    const [edges, setEdges] = useState<IGraphEdge[]>([]);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);

    // 临时连线渲染
    const [tempEdge, setTempEdge] = useState<{ sourceX: number, sourceY: number, targetX: number, targetY: number } | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [activeDrag, setActiveDrag] = useState<{ id: string, delta: { x: number, y: number } } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // ── 交互逻辑（委托给 Hook） ──
    const {
        handleDragStart, handleDragMove, handleDragEnd,
        addNode, clearGraph,
        handleHandleMouseDown, handleDeleteKey,
    } = useGraphActions({
        nodes, edges, scale, pan, containerRef,
        setNodes, setEdges, setActiveDrag, setTempEdge,
        setSelectedNodeId, setSelectedEdgeId,
    });

    // 初始化和同步
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

    // 滚轮缩放（Non-passive）
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

    // Delete 键删除
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                handleDeleteKey(selectedNodeId, selectedEdgeId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, selectedEdgeId, handleDeleteKey]);

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
            className="relative w-full h-full bg-[var(--st-graph-canvas-bg)] overflow-hidden"
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
                <div className="flex bg-[var(--st-graph-toolbar-bg)] rounded-md border border-[var(--st-graph-toolbar-border)] overflow-hidden shadow-lg [&_button]:flex">
                    <Tooltip content={t('graph.addVirtual')} position="bottom">
                        <button onClick={() => addNode('virtual')} className="p-2 hover:bg-[var(--st-graph-divider)] text-[var(--st-graph-icon-virtual)]">
                            <Plus size={16} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('graph.addPhysical')} position="bottom">
                        <button onClick={() => addNode('physical')} className="p-2 hover:bg-[var(--st-graph-divider)] text-[var(--st-graph-icon-physical)]">
                            <Plus size={16} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('graph.addPair')} position="bottom">
                        <button onClick={() => addNode('pair')} className="p-2 hover:bg-[var(--st-graph-divider)] text-[var(--st-graph-icon-pair)]">
                            <Link size={16} />
                        </button>
                    </Tooltip>
                    <Tooltip content={t('graph.addBus')} position="bottom">
                        <button onClick={() => addNode('bus')} className="p-2 hover:bg-[var(--st-graph-divider)] text-[var(--st-graph-icon-bus)]">
                            <Network size={16} />
                        </button>
                    </Tooltip>
                    <div className="w-[1px] bg-[var(--st-graph-divider)]"></div>
                    <Tooltip content={t('graph.clearGraph')} position="bottom">
                        <button onClick={clearGraph} className="p-2 hover:bg-red-900/50 text-red-400">
                            <Trash2 size={16} />
                        </button>
                    </Tooltip>
                </div>

                <div className="flex bg-[var(--st-graph-toolbar-bg)] rounded-md border border-[var(--st-graph-toolbar-border)] overflow-hidden shadow-lg ml-4">
                    <button onClick={() => setScale(s => s + 0.1)} className="p-2 hover:bg-[var(--st-graph-divider)] text-gray-400"><ZoomIn size={16} /></button>
                    <span className="p-2 px-3 text-xs text-gray-500 font-mono flex items-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-[var(--st-graph-divider)] text-gray-400"><ZoomOut size={16} /></button>
                    <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} className="p-2 hover:bg-[var(--st-graph-divider)] text-gray-400"><Layout size={16} /></button>
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
