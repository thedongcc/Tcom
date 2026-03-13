/**
 * tokens/index.ts
 * Token 插件系统统一入口：导出 registry 并完成所有插件注册。
 * 导入此文件即可使 tokenRegistry 包含所有内置 Token 插件。
 */
export { tokenRegistry } from './core/registry';
export type { TokenPlugin, CompileContext, ConfigFormProps, WorkerSlot, TokenTimedState, SuggestionItem, ToolbarButton } from './core/types';

// 导入并注册所有内置 Token 插件
import { tokenRegistry } from './core/registry';
import { flagPlugin } from './plugins/flag';
import { crcPlugin } from './plugins/crc';
import { timestampPlugin } from './plugins/timestamp';
import { autoIncPlugin } from './plugins/auto-inc';
import { randomBytesPlugin } from './plugins/random-bytes';

// 按显示顺序注册
tokenRegistry.register(flagPlugin);
tokenRegistry.register(crcPlugin);
tokenRegistry.register(timestampPlugin);
tokenRegistry.register(autoIncPlugin);
tokenRegistry.register(randomBytesPlugin);
