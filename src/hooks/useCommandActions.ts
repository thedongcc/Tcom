/**
 * useCommandActions.ts
 * 命令的递归克隆逻辑和文件导入/导出操作。
 * 从 CommandContext.tsx 中拆分出来，降低 Context 的复杂度。
 */
import { CommandEntity, CommandItem } from '../types/command';

/**
 * 递归克隆一个 CommandEntity 及其所有子节点。
 * 用于 duplicateEntity 操作。
 */
export function cloneRecursive(
    item: CommandEntity,
    parentId: string | null,
    allCommands: CommandEntity[],
    allEntities: CommandEntity[],
): CommandEntity[] {
    const newId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // 在目标 parent 下生成唯一名称
    const siblings = allCommands.filter(c => c.parentId === parentId);
    let baseName = item.name;
    let uniqueName = baseName;
    let counter = 1;
    while (siblings.some(s => s.name === uniqueName)) {
        uniqueName = `${baseName}_${counter}`;
        counter++;
    }

    let clone = { ...item, id: newId, parentId, name: uniqueName };

    if (clone.type === 'command') {
        const cmd = clone as CommandItem;
        if (cmd.tokens) {
            clone = { ...clone, tokens: JSON.parse(JSON.stringify(cmd.tokens)) } as CommandItem;
        }
    }

    let result = [clone];

    // 若是分组，递归克隆子元素
    if (item.type === 'group') {
        const children = allEntities.filter(c => c.parentId === item.id);
        children.forEach(child => {
            result = [...result, ...cloneRecursive(child, newId, [...allCommands, ...result], allEntities)];
        });
    }
    return result;
}

/**
 * 触发浏览器文件选择对话框并读取 JSON 文件内容。
 * 返回 Promise<CommandEntity[] | null>。
 */
export function readCommandsFromFile(): Promise<CommandEntity[] | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) { resolve(null); return; }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string);
                    if (Array.isArray(imported)) {
                        resolve(imported);
                    } else {
                        alert('Invalid format');
                        resolve(null);
                    }
                } catch {
                    alert('Failed to parse file');
                    resolve(null);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}

/**
 * 将命令列表导出为 JSON 文件并触发浏览器下载。
 */
export function downloadCommandsAsJson(commands: CommandEntity[]) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(commands, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "serial_tool_commands.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
