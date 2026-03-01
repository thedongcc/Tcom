import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Network, Monitor, Link } from 'lucide-react';
import { GraphLayout } from './GraphStyles';
import { Tooltip } from '../common/Tooltip';
import { useI18n } from '../../context/I18nContext';

interface GraphNodeProps {
    id: string;
    type: 'physical' | 'virtual' | 'pair' | 'bus';
    portPath: string;
    x: number;
    y: number;
    scale?: number;
    isSelected?: boolean;
    onSelect?: (id: string) => void;
    // Handlers for starting connections
    onHandleMouseDown?: (nodeId: string, type: 'source' | 'target') => void;
}

export const GraphNode = ({ id, type, portPath, x, y, scale = 1, isSelected, onSelect, onHandleMouseDown }: GraphNodeProps) => {
    const { t } = useI18n();
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: id,
        data: { type: 'node', id } // Identify as node for DND
    });

    const adjustedTransform = transform ? {
        ...transform,
        x: transform.x / scale,
        y: transform.y / scale
    } : null;

    const style = {
        transform: CSS.Translate.toString(adjustedTransform),
        left: x,
        top: y,
        width: GraphLayout.NODE_WIDTH,
    };

    const headerColor = type === 'virtual' ? GraphLayout.COLOR_VIRTUAL :
        type === 'pair' ? GraphLayout.COLOR_PAIR :
            type === 'bus' ? GraphLayout.COLOR_BUS :
                GraphLayout.COLOR_PHYSICAL;

    // Use centralized constant for port alignment
    const portY = GraphLayout.PORT_Y_OFFSET;

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={`absolute flex flex-col rounded-[6px] shadow-xl cursor-grab active:cursor-grabbing select-none text-[11px]
                 border transition-colors duration-200
            `}
            style={{
                ...style,
                backgroundColor: GraphLayout.COLOR_BG,
                borderColor: isSelected ? GraphLayout.COLOR_BORDER_SELECTED : GraphLayout.COLOR_BORDER,
                boxShadow: isSelected ? `0 0 0 2px ${GraphLayout.COLOR_BORDER_SELECTED}` : '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
                zIndex: 10,
            }}
            onPointerDown={(e) => {
                onSelect?.(id);
                listeners?.onPointerDown?.(e);
            }}
        >
            {/* Header */}
            <div
                className="h-[30px] px-3 flex items-center gap-2 rounded-t-[5px] font-bold text-[#e0e0e0]"
                style={{ backgroundColor: '#1a1a1a', borderBottom: `1px solid ${GraphLayout.COLOR_BORDER}` }}
            >
                <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: headerColor }} />
                <span className="truncate flex-1 tracking-wide opacity-90">{type.toUpperCase()}</span>
            </div>

            {/* Body */}
            <div className="p-3 flex flex-col gap-2 relative">
                {/* Port Row */}
                <div className="flex items-center justify-between h-[24px]">
                    <span className="font-mono text-[10px] uppercase opacity-50" style={{ color: GraphLayout.COLOR_TEXT_MAIN }}>In</span>

                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#111] border border-[#333]">
                        <Tooltip content={portPath} position="bottom" wrapperClassName="flex">
                            <span className="font-bold truncate max-w-[90px]" style={{ color: GraphLayout.COLOR_TEXT_MAIN }}>
                                {type === 'pair' ? 'Bridge' : type === 'bus' ? 'Shared Bus' : portPath}
                            </span>
                        </Tooltip>
                    </div>

                    <span className="font-mono text-[10px] uppercase opacity-50" style={{ color: GraphLayout.COLOR_TEXT_MAIN }}>Out</span>
                </div>
            </div>

            {/* Input Handle (Left) */}
            <div className="absolute z-20" style={{ left: -6, top: portY, marginTop: -6 }}>
                <Tooltip content={t('graph.portInput')} position="left" wrapperClassName="flex">
                    <div
                        className="w-[12px] h-[12px] rounded-full border border-[#666] hover:border-white hover:bg-[#555] cursor-crosshair transition-all"
                        style={{ backgroundColor: '#222' }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onHandleMouseDown?.(id, 'target');
                        }}
                        data-handle-id={id}
                        data-handle-type="target"
                    />
                </Tooltip>
            </div>


            {/* Output Handle (Right) - Circle Overlay */}
            <div className="absolute z-20" style={{ left: GraphLayout.NODE_WIDTH - 6, top: portY, marginTop: -6 }}>
                <Tooltip content={t('graph.portOutput')} position="right" wrapperClassName="flex">
                    <div
                        className="w-[12px] h-[12px] rounded-full border border-[#666] hover:border-white hover:bg-[#555] cursor-crosshair transition-all"
                        style={{ backgroundColor: '#222' }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onHandleMouseDown?.(id, 'source');
                        }}
                        data-handle-id={id}
                        data-handle-type="source"
                    />
                </Tooltip>
            </div>
        </div>
    );
};
