
// Utility to interact with com0com via setupc.exe
// Requires window.com0comAPI (which executes shell commands)

export interface PairInfo {
    portA: string;
    portB: string;
    id: string;
}

export const Com0Com = {
    // Parse output of 'setupc list'
    parsePairs: (output: string): PairInfo[] => {
        const pairs: PairInfo[] = [];
        // Example output:
        //       CNCA0 PortName=COM1
        //       CNCB0 PortName=COM101
        //       CNCA1 PortName=COM2
        //       CNCB1 PortName=COM102

        // We need to group them. Usually strict order or by ID (CNCAx/CNCBx).

        const lines = output.split('\n').map(l => l.trim()).filter(l => l);
        const map = new Map<string, string>(); // ID -> PortName

        lines.forEach(line => {
            // Match PortName and stop at comma or space (parameters separator)
            // Example: CNCA0 PortName=COM1,EmuBR=yes -> Match COM1
            const match = line.match(/^([A-Z0-9]+)\s+PortName=([^,\s]+)/i);
            if (match) {
                map.set(match[1], match[2]);
            }
        });

        // Group by index
        map.forEach((portName, id) => {
            if (id.startsWith('CNCA')) {
                const index = id.substring(4);
                const idB = `CNCB${index}`;
                if (map.has(idB)) {
                    pairs.push({
                        portA: portName,
                        portB: map.get(idB)!,
                        id: index
                    });
                }
            }
        });

        return pairs;
    },

    listPairs: async (setupcPath: string): Promise<PairInfo[]> => {
        if (!window.com0comAPI) throw new Error('com0comAPI not available');
        // Command: setupc list
        // We need to quote path if it has spaces
        const cmd = `"${setupcPath}" list`;
        const res = await window.com0comAPI.exec(cmd);
        if (!res.success) throw new Error(res.error || res.stderr);
        return Com0Com.parsePairs(res.stdout || '');
    },

    // install PortName=COM# PortName=COM#
    // Create a specific pair. Returns success/error.
    // If successful, tries to set friendly names.
    createPair: async (setupcPath: string, portA: string, portB: string): Promise<{ success: boolean; error?: string }> => {
        if (!window.com0comAPI) throw new Error('com0comAPI not available');

        // Note: parameters are key=value. Quotes needed if spaces.
        const cmd = `"${setupcPath}" install PortName=${portA} PortName=${portB}`;

        console.log('[Com0Com] Executing:', cmd);
        const res = await window.com0comAPI.exec(cmd);
        if (!res.success) {
            const combinedError = (res.stderr || '') + (res.stdout || '') + (res.error || '');
            console.error('[Com0Com] Create failed:', combinedError);
            return { success: false, error: combinedError };
        }

        console.log('[Com0Com] createPair success, setting names...');

        // Try to set friendly names immediately
        if (window.com0comAPI?.setFriendlyName) {
            // External Port (App visible) -> "Tcom Virtual Port (COMx)"
            await window.com0comAPI.setFriendlyName(portA, `Tcom Virtual Port (${portA})`);
            // Internal Port (App hidden) -> "Tcom Internal Interface (COMx)"
            await window.com0comAPI.setFriendlyName(portB, `Tcom Internal Interface (${portB})`);
        }

        return { success: true };
    },

    removePair: async (setupcPath: string, indexOrPort: string): Promise<boolean> => {
        if (!window.com0comAPI) throw new Error('com0comAPI not available');
        const cmd = `"${setupcPath}" remove ${indexOrPort}`;
        console.log('[Com0Com] Executing:', cmd);
        const res = await window.com0comAPI.exec(cmd);
        return res.success;
    },

    // Helper to find valid internal port for a selected external port from EXISTING pairs
    // Returns the paired port name if found, null otherwise.
    findPairedPort: async (setupcPath: string, externalPort: string): Promise<string | null> => {
        try {
            const pairs = await Com0Com.listPairs(setupcPath);
            const existing = pairs.find(p => p.portA === externalPort || p.portB === externalPort);
            if (existing) {
                return existing.portA === externalPort ? existing.portB : existing.portA;
            }
            return null;
        } catch (e) {
            console.error(e);
            return null;
        }
    }
};
