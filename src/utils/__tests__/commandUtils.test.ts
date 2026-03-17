/**
 * commandUtils.test.ts
 * 命令工具函数测试
 */
import { describe, it, expect } from 'vitest';
import { generateUniqueName } from '../commandUtils';
import { CommandEntity } from '../../types/command';

// 辅助：创建最小命令实体
// 注意：generateUniqueName 使用 `c.parentId === parentId` 做过滤
// 不传 parentId 时，第三参数为 undefined，所以 cmd 也需保持 undefined
const cmd = (name: string, parentId?: string): CommandEntity => ({
    id: `id-${name}`, type: 'command', name, payload: '', mode: 'text',
    tokens: {}, parentId: parentId === undefined ? (undefined as unknown as string | null) : parentId,
});

describe('generateUniqueName (命令)', () => {
    it('空列表应返回 command1', () => {
        expect(generateUniqueName([], 'command')).toBe('command1');
    });

    it('存在 command1 时应返回 command2', () => {
        expect(generateUniqueName([cmd('command1')], 'command')).toBe('command2');
    });

    it('应在指定 parentId 下检查唯一性', () => {
        const commands = [cmd('command1', 'g1'), cmd('command1', 'g2')];
        // 在 g1 下已有 command1，应返回 command2
        expect(generateUniqueName(commands, 'command', 'g1')).toBe('command2');
        // 在 g3 下无冲突，应返回 command1
        expect(generateUniqueName(commands, 'command', 'g3')).toBe('command1');
    });

    it('非 command 基名存在冲突时应递增', () => {
        // generateUniqueName 使用 `${base}${index}` 格式
        const commands = [cmd('NewGroup1')];
        expect(generateUniqueName(commands, 'NewGroup')).toBe('NewGroup2');
    });

    it('非 command 基名无冲突时返回索引 1', () => {
        expect(generateUniqueName([], 'NewGroup')).toBe('NewGroup1');
    });
});
