/**
 * tokens/core/registry.ts
 * Token 插件注册表（单例）。
 * 所有对 Token 类型的分发逻辑都通过此注册表完成，消灭硬编码 if-else。
 */
import { TokenPlugin } from './types';

class TokenRegistry {
    private plugins = new Map<string, TokenPlugin>();

    /** 注册一个 Token 插件 */
    register(plugin: TokenPlugin): void {
        this.plugins.set(plugin.type, plugin);
    }

    /** 获取 Token 插件（不存在返回 undefined） */
    get(type: string): TokenPlugin | undefined {
        return this.plugins.get(type);
    }

    /** 判断是否存在某类型插件 */
    has(type: string): boolean {
        return this.plugins.has(type);
    }

    /** 获取所有已注册插件（按注册顺序） */
    getAll(): TokenPlugin[] {
        return Array.from(this.plugins.values());
    }

    /** 获取所有动态 Token 类型（isDynamic = true） */
    getDynamicTypes(): string[] {
        return this.getAll()
            .filter(p => p.isDynamic)
            .map(p => p.type);
    }
}

/** 全局唯一注册表实例 */
export const tokenRegistry = new TokenRegistry();
