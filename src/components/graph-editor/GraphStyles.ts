export const GraphLayout = {
    NODE_WIDTH: 160,
    HEADER_HEIGHT: 30,
    BODY_PADDING: 10,
    PORT_RADIUS: 5,
    PORT_GAP: 20, // Distance between ports vertically

    // Positioning logic
    // Input Ports: Left side, Vertical stack starting after header
    // Output Ports: Right side, Vertical stack starting after header

    // Offsets
    HANDLE_OFFSET_X: 0, // 0 means centered on the edge line. Negative is outside, Positive inside? 
    // ComfyUI ports are circles ON the border or slightly overlapping.
    // Let's align center of circle with the border.

    // Colors
    COLOR_VIRTUAL: '#4ec9b0',
    COLOR_PHYSICAL: '#ce9178',
    COLOR_PAIR: '#c586c0',
    COLOR_BUS: '#dcdcaa', // Beige/Yellow for Shared/Bus
    COLOR_BG: '#2b2b2b',
    COLOR_BORDER: '#1e1e1e',
    COLOR_BORDER_SELECTED: '#007fd4', // VSCode Focus Border
    COLOR_TEXT_MAIN: '#cccccc',

    // Calculation Helpers
    PORT_Y_OFFSET: 54,

    getPortY: (nodeY: number, index: number, totalHeaderHeight = 30) => {
        // nodeY is top-left of node
        // First port starts at Header + Padding + Radius
        return nodeY + totalHeaderHeight + 10 + (index * 24) + 6; // 10 padding, 24 row height, 6 half-height
    },

    getPortCoordinates: (node: { position: { x: number, y: number } }, type: 'source' | 'target', index: number = 0) => {
        const x = type === 'source'
            ? node.position.x + GraphLayout.NODE_WIDTH // Right edge
            : node.position.x;      // Left edge

        // Use consistent Y offset matching the visual handle position
        return { x, y: node.position.y + GraphLayout.PORT_Y_OFFSET };
    }
};
