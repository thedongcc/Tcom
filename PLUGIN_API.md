# Tcom Plugin API 文档

Tcom 支持用户开发和安装自定义插件，扩展软件功能。

## 快速开始

### 1. 创建插件文件

将以下内容保存为 `my-plugin.tpkg`（本质是 JSON 文件）：

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "我的第一个 Tcom 插件",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/my-plugin",
  "code": "module.exports = { activate(ctx) { ctx.ui.showToast('Hello from My Plugin!', 'success'); }, deactivate(ctx) {} }"
}
```

### 2. 安装插件

在 Tcom 中，点击左侧 **Extensions** 图标 → **从文件安装 (.tpkg)** → 选择你的 `.tpkg` 文件。

---

## 插件结构

```typescript
module.exports = {
  // 插件激活时调用（必须）
  activate(ctx) {
    // 在此注册命令、监听事件、初始化 UI 等
  },

  // 插件停用时调用（必须）
  deactivate(ctx) {
    // 清理资源（已注册的 Disposable 会自动清理）
  }
};
```

---

## API 参考

### `ctx.ui` — UI 交互

```javascript
// 显示 Toast 通知
ctx.ui.showToast(message, type?, duration?)
// type: 'info' | 'success' | 'warning' | 'error'（默认 'info'）
// duration: 毫秒（默认 3000）

// 显示确认对话框，返回 Promise<boolean>
const confirmed = await ctx.ui.showConfirm({
  title: '确认操作',
  message: '你确定要执行此操作吗？',
  confirmText: '确认',   // 可选
  cancelText: '取消',    // 可选
  type: 'warning',       // 'info' | 'warning' | 'danger'
});
```

### `ctx.commands` — 命令注册

```javascript
// 注册命令，返回 Disposable
const disposable = ctx.commands.register(
  'my-plugin.hello',   // 命令 ID（建议格式：pluginId.commandName）
  '打招呼',             // 显示名称
  () => {              // 执行回调
    ctx.ui.showToast('Hello!');
  }
);

// 取消注册
disposable.dispose();
```

### `ctx.sessions` — 会话信息（只读）

```javascript
// 获取所有会话列表
const sessions = ctx.sessions.getAll();
// 返回: [{ id, name, type, isConnected }, ...]

// 获取当前激活会话
const active = ctx.sessions.getActive();
// 返回: { id, name, type, isConnected } | null

// 监听数据接收（任意会话）
const disposable = ctx.sessions.onDataReceived((sessionId, data) => {
  // data 是 Uint8Array
  const text = new TextDecoder().decode(data);
  console.log(`[${sessionId}] Received: ${text}`);
});
```

### `ctx.storage` — 持久化存储

每个插件有独立的命名空间，互不干扰。

```javascript
// 写入
ctx.storage.set('config', { threshold: 100 });

// 读取（不存在时返回 null）
const config = ctx.storage.get('config');

// 删除
ctx.storage.delete('config');

// 清空此插件的所有存储
ctx.storage.clear();
```

### `ctx.events` — 事件总线（插件间通信）

```javascript
// 监听事件，返回 Disposable
const disposable = ctx.events.on('my-plugin.data', (payload) => {
  console.log('Received:', payload);
});

// 发布事件
ctx.events.emit('my-plugin.data', { value: 42 });
```

### `ctx.pluginId` — 插件 ID

```javascript
console.log(ctx.pluginId); // "my-plugin"
```

---

## Disposable 机制

注册命令、监听事件等操作都返回 `Disposable` 对象。插件停用时，所有未手动释放的 `Disposable` 会**自动清理**，无需手动管理。

```javascript
activate(ctx) {
  // 自动管理：插件停用时自动清理
  ctx.commands.register('my-plugin.cmd', '命令', () => {});
  ctx.events.on('some-event', handler);

  // 手动管理：提前释放
  const d = ctx.sessions.onDataReceived(handler);
  setTimeout(() => d.dispose(), 5000); // 5秒后停止监听
}
```

---

## 完整示例

### 示例 1：会话数据监控插件

```json
{
  "id": "data-monitor",
  "name": "数据监控",
  "version": "1.0.0",
  "description": "统计接收到的数据量",
  "author": "Your Name",
  "code": "module.exports = { activate(ctx) { let totalBytes = 0; const saved = ctx.storage.get('totalBytes'); if (saved) totalBytes = saved; ctx.sessions.onDataReceived((sessionId, data) => { totalBytes += data.length; ctx.storage.set('totalBytes', totalBytes); }); ctx.commands.register('data-monitor.stats', '查看数据统计', () => { ctx.ui.showToast(`累计接收: ${totalBytes} 字节`, 'info', 4000); }); ctx.ui.showToast('数据监控已启动', 'success', 2000); }, deactivate(ctx) { ctx.ui.showToast('数据监控已停止', 'info', 2000); } }"
}
```

### 示例 2：自动响应插件

```json
{
  "id": "auto-reply",
  "name": "自动响应",
  "version": "1.0.0",
  "description": "收到特定数据时自动回复",
  "author": "Your Name",
  "code": "module.exports = { activate(ctx) { ctx.sessions.onDataReceived((sessionId, data) => { const text = new TextDecoder().decode(data).trim(); if (text === 'ping') { ctx.events.emit('serial.write', { sessionId, data: 'pong\\n' }); } }); }, deactivate(ctx) {} }"
}
```

---

## .tpkg 文件格式

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一标识符（kebab-case） |
| `name` | string | ✅ | 显示名称 |
| `version` | string | ✅ | 语义化版本号（如 "1.0.0"） |
| `description` | string | ❌ | 插件描述 |
| `author` | string | ❌ | 作者名称 |
| `homepage` | string | ❌ | 主页或仓库链接 |
| `code` | string | ✅ | 插件代码（CommonJS 格式字符串） |

> **注意**：`code` 字段中的代码以 CommonJS 格式编写，必须通过 `module.exports` 导出包含 `activate` 和 `deactivate` 函数的对象。

---

## 注意事项

1. **安全性**：插件代码在应用内直接执行，请只安装来源可信的插件
2. **命名空间**：命令 ID 建议使用 `pluginId.commandName` 格式，避免冲突
3. **存储限制**：基于 `localStorage`，单个插件存储建议不超过 5MB
4. **异步支持**：`activate` 和 `deactivate` 支持 `async/await`
