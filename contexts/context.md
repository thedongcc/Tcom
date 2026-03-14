# Tcom 项目统一开发规范 (v2.0)

> **本文件是 Tcom 项目的唯一权威规范**。融合了 `optimize/`、`design-system/` 及所有架构优化文档。
> 所有新增代码、重构和 UI 开发必须严格遵循本规范。

---

## 一、项目概述

**Tcom** — 一款基于 Electron + React + TypeScript 的专业级串口调试工具。
支持串口通信、MQTT、TCP 桥接、虚拟串口、命令管理、插件系统等功能。

**技术栈**: Electron 28 + React 18 + TypeScript 5 + Vite + TipTap + dnd-kit

---

## 二、核心架构原则

### 2.1 架构质量目标

| 特性 | 要求 | 落地方式 |
|------|------|---------|
| **安全** | 全局异常捕获、硬件资源严格释放 | `SystemCrashHandler` + `try/catch` 边界防护 |
| **可靠** | 串口掉线自动重连、无僵尸进程 | Service 层熔断重试 + `removeAllListeners()` |
| **健壮** | 防御性编程、输入边界校验 | 参数校验 + 类型守卫 + fallback 机制 |
| **解耦** | 业务逻辑与 UI 分离 | Custom Hook 提取 + Service 层隔离 |
| **高内聚** | 单一职责、功能模块化 | 每个 Hook/Service 仅负责一个领域 |
| **低耦合** | 模块间通过接口/事件通信 | EventEmitter + 依赖注入 + Context |
| **稳定** | 快速插拔不崩溃、休眠唤醒不断联 | 端口状态机 + 心跳检测 |
| **多并发** | 高频数据不阻塞 UI | 缓冲队列 + Worker 线程 + libuv 定时器 |
| **实时性** | 串口数据毫秒级显示 | RAF 渲染管理 + 虚拟列表 |
| **动画丝滑** | 过渡动画 60FPS | `transform`/`opacity` GPU 加速 + CSS transitions |

### 2.2 Electron 主进程分层架构

```
electron/
├── main.ts                    # Bootstrap Layer — 仅 App 生命周期 + 窗口创建（≤130行）
├── ipc/                       # Controller Layer — IPC 路由，参数校验，调用 Service
│   ├── serial.ipc.ts
│   ├── monitor.ipc.ts
│   ├── com0com.ipc.ts
│   └── theme.ipc.ts
├── services/                  # Service Layer — 纯业务逻辑，相互隔离
│   ├── SerialService.ts
│   ├── MonitorService.ts
│   └── TcpService.ts
└── utils/                     # Utility Layer — 纯函数、系统调用
    ├── WindowsRegistry.ts
    ├── FileWriteQueue.ts
    └── SystemCrashHandler.ts
```

**铁律**：
- `main.ts` 禁止编写任何业务逻辑
- IPC 层仅做参数校验和 Service 调用
- Service 层相互隔离，通过 EventEmitter 交互
- 每个 Service 文件 ≤ 300 行

### 2.3 渲染进程组件架构

```
src/components/<feature>/
├── FeatureComponent.tsx        # UI 组件 — 仅 JSX 渲染（≤250行）
├── useFeatureState.ts          # 状态 Hook — 状态管理 + UI 状态持久化
├── useFeatureActions.ts        # 操作 Hook — 业务逻辑 + 副作用
├── featureHelpers.ts           # 纯函数 — 数据处理、格式化、计算
└── FeatureSubComponent.tsx     # 子组件 — 复用 UI 片段
```

**铁律**：
- 组件文件 ≤ 250 行，超出必须拆分子组件或 Hook
- 函数体认知复杂度（Cognitive Complexity）≤ 20
- 复杂 `useCallback`/`useEffect` 逻辑提取为自定义 Hook
- 重复代码（≥2处相同逻辑）必须提取为工具函数

---

## 三、代码规范

### 3.1 TypeScript 规范

```typescript
// ✅ 正确：明确类型，中文注释
interface SerialConfig {
    baudRate: number;    // 波特率
    dataBits: 5 | 6 | 7 | 8;
    path: string;
}

// ❌ 禁止：使用 any
const data: any = getResponse();  // 禁止

// ✅ 正确：类型守卫
function isSerialConfig(obj: unknown): obj is SerialConfig {
    return typeof obj === 'object' && obj !== null && 'baudRate' in obj;
}
```

**规则**：
- 禁止使用 `any`（历史代码除外，新增必须消除）
- 所有导出函数必须有明确返回类型
- 接口优先于 `type`（除联合类型）
- 枚举使用 `const enum` 或字面量联合类型

### 3.2 React 组件规范

```tsx
// ✅ 组件结构（按顺序）
export const MyComponent = ({ prop1, prop2 }: Props) => {
    // 1. Context / Hook 调用
    const { t } = useI18n();
    
    // 2. 状态声明
    const [value, setValue] = useState('');
    
    // 3. 计算值 / useMemo
    const filtered = useMemo(() => items.filter(Boolean), [items]);
    
    // 4. 事件处理 / useCallback
    const handleClick = useCallback(() => { /* handle */ }, []);
    
    // 5. 副作用 / useEffect
    useEffect(() => { /* effect */ }, []);
    
    // 6. 条件渲染辅助
    const showPanel = value.length > 0;
    
    // 7. JSX 返回
    return <div>...</div>;
};
```

**规则**：
- 使用函数组件 + Hooks，禁止 Class 组件
- 高频更新组件使用 `React.memo()` 保护
- Context 按变动频率分片，禁止全局单一 Context
- 组件 Props 超过 5 个时使用接口声明

### 3.3 注释规范

```typescript
// ✅ 中文注释
/**
 * useSerialMonitorSearch.ts
 * 串口监视器搜索/滚动/过滤逻辑 — 从 SerialMonitor.tsx 中提取。
 */

// ✅ 文件头注释（必填）
/**
 * 文件名.ts
 * 功能描述。
 *
 * 子模块：
 * - subModule.ts — 子模块功能描述
 */

// ✅ 关键逻辑注释
// 检查重名冲突
const hasCollision = commands.some(c => c.name === item.name);
```

### 3.4 命名规范

| 类别 | 规则 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `SerialMonitor.tsx` |
| Hook 文件 | camelCase + `use` 前缀 | `useSerialMonitorState.ts` |
| 工具函数文件 | camelCase | `tooltipPositioning.ts` |
| CSS 变量 | `--st-` 前缀 | `--st-monitor-rx-bg` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 事件处理 | `handle` 前缀 | `handleDragEnd` |

### 3.5 Git 提交规范

```
feat: 添加虚拟串口监控功能
fix: 修复 RX 统计始终为 0 的问题
refactor: 提取 useSerialMonitorSearch Hook
perf: 优化日志列表虚拟化渲染
style: 统一 Toast 组件边框颜色
docs: 更新项目规范文档
```

---

## 四、UI/UX 设计规范

### 4.1 主题系统

Tcom 使用 CSS 变量驱动的主题系统，支持自定义主题文件（JSON）。

**核心色彩变量**（由主题文件定义）：

| 角色 | CSS 变量 | 说明 |
|------|---------|------|
| 编辑器背景 | `--editor-background` | 主编辑区背景 |
| 输入框背景 | `--input-background` | 所有输入控件 |
| 输入框边框 | `--input-border-color` | 默认边框 |
| 焦点边框 | `--focus-border-color` | 聚焦高亮 |
| 主文字 | `--st-sidebar-text` | 侧边栏文字 |
| 次要文字 | `--input-placeholder-color` | 占位符/提示文字 |
| 悬停背景 | `--list-hover-background` | 列表项悬停 |
| 选中背景 | `--list-active-selection-background` | 已选中项 |
| 按钮背景 | `--button-background` | 主操作按钮 |
| 边框 | `--border-color` | 通用分割线 |

### 4.2 字体系统

- **主字体**: `AppCoreFont`（用户可在设置中切换）
- **等宽字体**: `var(--font-mono)` — 用于串口数据显示
- **UI 文字大小**: `11px`（标签）/ `13px`（正文）/ `14px`（标题）

### 4.3 间距系统

| Token | 值 | 用途 |
|-------|------|------|
| `xs` | 4px | 图标间隙 |
| `sm` | 8px | 行内间距 |
| `md` | 16px | 标准内边距 |
| `lg` | 24px | 区块间距 |
| `xl` | 32px | 大区块间距 |

### 4.4 组件交互规范

#### Toast（消息通知）
- 位置：页面顶部居中，距顶 26px
- 颜色：success `#22c55e` / error `#ef4444` / info `#3b82f6` / warning `#eab308`
- 动画：`translateY` + `opacity` + `scale`，1-3 秒自动消失，最多堆叠 3 条

#### Confirm（确认框）
- Promise 驱动：`await confirm({ ... })`
- 焦点控制：默认聚焦"取消"按钮，防误触
- 危险操作按钮：`bg-[#a1260d]`

#### Dialog（业务对话框）
- 宽度：450px / 600px
- 点击遮罩不关闭，必须点取消/关闭
- 快捷键：`Esc` 关闭，`Enter` 提交

#### ContextMenu（右键菜单）
- 智能定位：自动检测边缘防溢出
- 列表项：12px 文字 + 图标，悬停 `#094771`
- 点击外部立即关闭

#### Select（下拉选择器）
- 触发按钮：高度 `h-7`（28px），背景 `#3c3c3c`
- 弹出菜单：背景 `#1f1f1f`，紧贴触发按钮
- 滚动条：悬浮式（Overlay），不占宽度

#### Switch（开关组件）
- 尺寸：`h-4 w-8`，圆点 `h-3 w-3`
- 开启：`#0e639c`，关闭：`#3c3c3c`

### 4.5 动画规范

```css
/* ✅ 所有过渡使用 GPU 加速属性 */
.animated {
    transition: transform 200ms ease, opacity 200ms ease;
    will-change: transform, opacity;
}

/* ❌ 禁止使用会触发回流的属性做动画 */
.bad {
    transition: width 200ms, height 200ms, top 200ms; /* 禁止 */
}
```

| 场景 | 时长 | 缓动 |
|------|------|------|
| 按钮悬停 | 150-200ms | `ease` |
| 面板展开/折叠 | 200-300ms | `ease-out` |
| Toast 出现/消失 | 300ms | `ease-in-out` |
| 拖拽反馈 | 即时 | 无缓动 |

### 4.7 国际化（i18n）规范

- **双语强制**：所有面向用户的文本（按钮、标签、提示、错误消息、Toast、Tooltip、Dialog）必须同时在 `zh-CN.ts` 和 `en-US.ts` 中定义
- 禁止在 TSX 中硬编码中文或英文字符串，必须使用 `t('key')` 引用
- 新增 i18n key 必须在 **两个语言文件中同步添加**

### 4.8 Tooltip 统一规范

- **强制使用项目 `<Tooltip>` 组件**（`src/components/common/Tooltip.tsx`）
- ❌ 禁止使用原生 HTML `title=` 属性
- ✅ 正确：`<Tooltip content={t('xxx')}><button>...</button></Tooltip>`
- ❌ 禁止：`<button title="xxx">...</button>`

### 4.9 组件颜色独立性规范

每个 UI 组件必须拥有**专属 CSS 变量**，禁止直接使用功能级变量（如 `--widget-background`）。

**变量命名规则**：`--{component-name}-{property}`

```css
/* ✅ 正确：组件专属变量 */
--serial-config-bg: var(--sidebar-background);
--serial-config-text: var(--st-monitor-config-text);
--serial-config-label: var(--st-monitor-config-label);

/* ❌ 禁止：组件直接引用功能级变量 */
.my-component {
    background: var(--widget-background); /* 禁止 */
    background: var(--my-component-bg);   /* 正确 */
}
```

**每个组件最少需要的变量**：
- `--{component}-bg` — 背景色
- `--{component}-text` — 文字色
- `--{component}-border` — 边框色
- 按钮/切换类组件额外需要：`--{component}-hover`、`--{component}-active`

### 4.10 反模式（禁止）

- ❌ 使用 Emoji 作为图标 — 统一使用 Lucide React 图标库
- ❌ 可点击元素缺少 `cursor: pointer`
- ❌ `hover` 使用 `scale` 导致布局位移
- ❌ 文字对比度低于 4.5:1
- ❌ 状态变化无过渡动画（必须 150-300ms）
- ❌ 焦点状态不可见
- ❌ 在 JS 层面每帧计算布局做动画
- ❌ 使用原生 `title=` 属性代替 `<Tooltip>` 组件
- ❌ 组件直接使用功能级 CSS 变量（必须通过组件专属变量间接引用）
- ❌ 在 TSX 中硬编码用户可见的中文/英文字符串（必须使用 `t()` 函数）

---

## 五、性能与稳定性规范

### 5.1 渲染性能

- **虚拟列表**：日志超过 100 条时必须使用虚拟化
- **`React.memo`**：高频更新场景（串口日志流）必须使用
- **状态分片**：频繁变化的值（缓冲区数据）与低频状态（主题）分离
- **`useMemo`/`useCallback`**：依赖项明确，避免不必要的重新计算

### 5.2 主进程稳定性

- **防御性编程**：所有硬件操作（`open`/`close`/`write`）必须 `try/catch`
- **资源释放**：串口关闭后必须 `port.removeAllListeners()`
- **内存泄漏防护**：事件解绑、定时器清理、Observer 断开
- **熔断机制**：连续失败 3 次后暂停重试，等待用户手动触发

### 5.3 数据流性能

- **串口写入**：采用缓冲队列管理，降低 I/O 阻塞
- **高频发送**：使用 Node.js `libuv` 定时器实现高精度发送
- **文件写入**：使用 `FileWriteQueue` 解决并发写入竞争

---

## 六、Skill 工具使用指南

### 6.0 SkillHub CLI（已安装）

**安装路径**: `~/.skillhub/`（`skills_store_cli.py`）

```powershell
# 搜索 Skill
python "$env:USERPROFILE\.skillhub\skills_store_cli.py" search "关键词"

# 安装 Skill 到当前项目
python "$env:USERPROFILE\.skillhub\skills_store_cli.py" install <slug>

# 示例：安装 electron 相关 skill
python "$env:USERPROFILE\.skillhub\skills_store_cli.py" install electron-best-practices
```

### 6.1 已安装 Skill 清单（4 个）

#### ① ui-ux-pro-max
- **路径**: `.agent/skills/ui-ux-pro-max/`
- **功能**: 综合 UI/UX 设计智能，含 67 种风格、96 个色板、57 种字体搭配、99 条 UX 准则
- **何时调用**: 新建 UI 组件、设计交互、选择色板字体时
- **调用方式**:
  ```bash
  # 生成完整设计系统
  python3 .agent/skills/ui-ux-pro-max/scripts/search.py "serial IDE dark" --design-system -p "Tcom"
  # 查询 UX 准则
  python3 .agent/skills/ui-ux-pro-max/scripts/search.py "animation accessibility" --domain ux
  # 获取 React 栈指南
  python3 .agent/skills/ui-ux-pro-max/scripts/search.py "performance" --stack react
  ```

#### ② typescript-pro
- **路径**: `.agent/skills/typescript-pro/`
- **功能**: 高级类型系统、泛型、全栈类型安全、tRPC 集成
- **何时调用**: 设计复杂类型、类型守卫、条件类型、映射类型时
- **参考文档**: `references/advanced-types.md`、`type-guards.md`、`utility-types.md`、`patterns.md`、`configuration.md`

#### ③ typescript-lsp
- **路径**: `.agent/skills/typescript-lsp/`
- **功能**: TypeScript LSP 诊断、实时代码检查、错误检测
- **何时调用**: 代码审查、提交前检查、类型错误诊断时

#### ④ afrexai-react-production
- **路径**: `.agent/skills/afrexai-react-production/`
- **功能**: 生产级 React 应用架构、组件设计、状态管理、性能优化、测试、部署
- **何时调用**: 组件重构、性能优化、Hooks 设计、状态提升策略时

### 6.2 Skill 调用时机表

| 开发场景 | 应调用的 Skill | 具体操作 |
|---------|---------------|---------|
| **新建 UI 组件** | `ui-ux-pro-max` | 1. 运行 `--design-system` 获取设计建议<br>2. 运行 `--domain ux` 获取 UX 准则<br>3. 对照本规范 §4 交付检查清单 |
| **组件样式设计** | `ui-ux-pro-max` | 运行 `--domain style "dark IDE developer"` 获取风格推荐 |
| **复杂类型设计** | `typescript-pro` | 查阅 `references/advanced-types.md` 和 `utility-types.md` |
| **组件重构** | `afrexai-react-production` | 参考 Hooks 重构模式、状态提升策略、渲染优化 |
| **性能优化** | `ui-ux-pro-max` + `afrexai-react-production` | 1. `--domain ux "animation"` 获取动画准则<br>2. 参考 React Production 性能章节 |
| **代码审查** | `typescript-lsp` | 提交前执行 LSP 静态检查，确保类型安全 |
| **类型错误诊断** | `typescript-lsp` | 实时代码检查和错误定位 |

### 6.4 新建组件完整工作流

当需要新建一个组件时，按以下流程操作：

```
步骤 1: 设计（调用 ui-ux-pro-max）
─────────────────────────────────
python3 .agent/skills/ui-ux-pro-max/scripts/search.py \
  "serial IDE developer tool dark" --design-system -p "Tcom"

→ 获取：色板、字体、间距、动画规范
→ 对照本规范 §4.1~§4.6 确认一致性

步骤 2: 架构（遵循本规范 §2.3）
─────────────────────────────────
src/components/<feature>/
├── NewComponent.tsx        # ≤250 行
├── useNewComponentState.ts # 状态管理 Hook
├── useNewComponentActions.ts # 操作逻辑 Hook
└── newComponentHelpers.ts  # 纯函数

步骤 3: 编码（遵循本规范 §3）
─────────────────────────────────
- 中文注释
- 明确类型（禁止 any）
- 组件结构按 §3.2 顺序
- 事件处理用 useCallback

步骤 4: 交付前检查
─────────────────────────────────
☐ 无 Emoji 图标（使用 Lucide）
☐ 可点击元素有 cursor:pointer
☐ hover 有 150-300ms 过渡动画
☐ 文字对比度 ≥ 4.5:1
☐ 焦点状态可见
☐ TypeScript 零错误
☐ 组件 ≤ 250 行
☐ 函数复杂度 ≤ 20
```

---

## 七、验证标准

所有代码变更必须满足：

1. **编译通过**: `npx tsc --noEmit` 零新增错误
2. **构建通过**: `npm run build:app` 成功
3. **复杂度**: 所有函数认知复杂度 ≤ 20
4. **文件大小**: 组件 ≤ 250 行、Service ≤ 300 行
5. **运行稳定**: 快速插拔虚拟串口不崩溃、休眠唤醒不断联

---

## 八、文档更新规则

- 新增模块/Hook 时，更新模块注释中的 `子模块` 列表
- 修改架构（如新增 Service）时，更新本文件 §2
- 新增交互组件时，更新本文件 §4.4
- 引入新 Skill 时，更新本文件 §6
