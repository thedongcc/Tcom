/**
 * Generates a unique name from a base name and a list of existing names.
 * Follows the pattern "Base Name 1", "Base Name 2", etc.
 * 
 * @param existingNames List of names that already exist
 * @param base Base name to use (e.g. "Serial", "MQTT")
 * @param suffix Optional initial suffix (e.g. "Copy")
 */
export const generateUniqueName = (existingNames: string[], base: string, suffix?: string): string => {
    let baseWithName = suffix ? `${base} (${suffix})` : base;
    let name = baseWithName;
    let index = 1;

    // Check if the base name itself exists
    const namesSet = new Set(existingNames);

    // If we have a suffix or if the base already exists, we start appending numbers
    // Note: User's request "commandx" suggests they might want the number always?
    // But for sessions, usually "Serial 1" is better than "Serial" for consistency.

    // Pattern for sessions: "Serial 1", "Serial 2"...
    // Pattern for copies: "Session (Copy) 1", "Session (Copy) 2"...

    // If base is purely "Serial", "MQTT", or "Monitor", we ALWAYS want an index for consistency.
    const isGenericBase = ['Serial', 'MQTT', 'Monitor'].includes(base);

    if (isGenericBase && !suffix) {
        name = `${base} ${index}`;
        while (namesSet.has(name)) {
            index++;
            name = `${base} ${index}`;
        }
        return name;
    }

    // For custom names or copies
    if (!namesSet.has(name)) return name;

    while (namesSet.has(`${baseWithName} ${index}`)) {
        index++;
    }
    return `${baseWithName} ${index}`;
};
