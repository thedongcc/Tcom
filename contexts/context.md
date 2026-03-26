# Tcom 项目统一开发规范 (v3.0 — Tauri v2)

> **本文件是 Tcom 项目的唯一权威规范**。融合了架构设计、UI 设计系统及所有开发规范。
> 所有新增代码、重构和 UI 开发必须严格遵循本规范。

---

## 一、项目概述

**Tcom** — 一款基于 Tauri v2 + React + TypeScript 的专业级串口调试工具。
支持串口通信、MQTT、TCP 桥接、虚拟串口、命令管理、功能模块系统等功能。

**技术栈**: Tauri v2 (Rust) + React 18 + TypeScript 5 + Vite + TipTap + dnd-kit

---

## 二、核心架构原则

### 2.1 架构质量目标

| 特性 | 要求 | 落地方式 |
|------|------|---------| 
| **安全** | CSP 策略 + 最小权限 + 参数校验 | Tauri capabilities + Rust 类型系统 |
| **可靠** | 串口掉线自动检测、无僵尸线程 | Rust `AtomicBool` 信号 + `Arc<Mutex>` |
| **健壮** | 防御性编程、输入边界校验 | Rust `Result<T, String>` + 前端类型守卫 |
| **解耦** | 业务逻辑与 UI 分离 | Custom Hook + Tauri Command 层隔离 |
| **高内聚** | 单一职责、功能模块化 | 每个 Hook/Command 仅负责一个领域 |
| **低耦合** | 模块间通过事件通信 | Tauri `emit`/`listen` + React Context |
| **稳定** | 快速插拔不崩溃、休眠唤醒不断联 | Rust 线程安全 + 超时重试 |
| **多并发** | 高频数据不阻塞 UI | Rust 原生线程 + 前端 RAF 渲染管理 |
| **实时性** | 串口数据毫秒级显示 | Rust 线程直推 `emit` + 虚拟列表 |
| **动画丝滑** | 过渡动画 60FPS | `transform`/`opacity` GPU 加速 |

### 2.2 Tauri Rust 后端分层架构

```
src-tauri/src/
├── main.rs                    # 入口 — 调用 lib::run()
├── lib.rs                     # Bootstrap — 插件注册 + Command 注册 + State 管理
├── snap_layout.rs             # Windows 11 Snap Layout 支持
└── commands/                  # Command Layer — 参数解析 + 业务逻辑
    ├── mod.rs                 # 模块导出
    ├── serial/                # 串口管理（SerialState）
    │   ├── mod.rs             # Command 门面层
    │   ├── state.rs           # 核心状态和数据结构
    │   ├── scanner.rs         # 硬件扫描 + Windows 注册表
    │   ├── connection.rs      # 打开/关闭/读取线程
    │   ├── io.rs              # 数据写入
    │   └── timer.rs           # 定时发送（高精度）
    ├── mqtt.rs                # MQTT 客户端（MqttState + rumqttc）
    ├── monitor/               # 虚拟串口监控（MonitorState）
    │   ├── mod.rs             # Command 门面层
    │   ├── state.rs           # 会话结构体 + 事件类型 + 状态常量
    │   ├── bridge.rs          # 双向数据桥接（四线程读写 + 轮询检测）
    │   └── timer.rs           # 高精度自旋定时器
    ├── tcp.rs                 # TCP 服务器（TcpState）
    ├── profile.rs             # Profile（配置档案）CRUD + Session/命令/自动回复
    ├── backup.rs              # Profile/全量备份导出导入（ZIP）
    ├── theme.rs               # 主题管理 + 编辑器状态 + 取色器
    ├── app/                   # 应用级功能
    │   ├── mod.rs             # Command 门面层
    │   ├── info.rs            # 版本/统计/管理员检测/工厂重置
    │   ├── fonts.rs           # 系统字体列表
    │   └── com0com.rs         # com0com 驱动管理
    ├── shell.rs               # 外部链接 + 文件对话框
    ├── window.rs              # 窗口管理（置顶控制 + 背景色）
    ├── updater.rs             # 应用更新（占位）
    ├── crash_report.rs        # 崩溃上报（飞书 Webhook）
    ├── global_settings.rs     # 全局设置 + 应用状态持久化
    └── fs_utils.rs            # 文件系统工具函数
```

**铁律**：
- `lib.rs` 禁止编写任何业务逻辑，仅做 Plugin/State/Command 注册
- Command 函数必须返回 `Result<T, String>`，错误信息清晰可读
- 全局状态使用 `tauri::State<T>` + `Mutex<HashMap>` 管理
- 每个模块文件 ≤ 400 行
- 跨线程共享使用 `Arc<Mutex<T>>` + `Arc<AtomicBool>` 信号控制

### 2.3 前端 IPC 适配层架构

```
src/lib/tauri-api/
├── index.ts                   # 注册入口 — registerAllTauriAPIs()
├── serial.ts                  # serialAPI
├── mqtt.ts                    # mqttAPI
├── monitor.ts                 # monitorAPI
├── tcp.ts                     # tcpAPI
├── session.ts                 # sessionAPI
├── com0com.ts                 # com0comAPI
├── theme.ts                   # themeAPI
├── eyedropper.ts              # eyedropperAPI
├── app.ts                     # appAPI
├── update.ts                  # updateAPI
├── shell.ts                   # shellAPI
├── windowApi.ts               # windowAPI
├── profile.ts                 # profileAPI
├── crashReport.ts             # crashReportAPI
└── globalSettings.ts          # globalSettingsAPI
```

**铁律**：
- 适配层通过 `window.xxxAPI = { ... }` 注入全局对象，与 React 组件解耦
- 所有 invoke 调用必须有 `catch` 错误处理
- 事件监听使用 Tauri `listen()` + cleanup 函数模式

### 2.4 渲染进程组件架构

```
src/components/<feature>/
├── FeatureComponent.tsx        # UI 组件 — 仅 JSX 渲染
├── useFeatureState.ts          # 状态 Hook — 状态管理 + UI 状态持久化
├── useFeatureActions.ts        # 操作 Hook — 业务逻辑 + 副作用
├── featureHelpers.ts           # 纯函数 — 数据处理、格式化、计算
└── FeatureSubComponent.tsx     # 子组件 — 复用 UI 片段
```

**`components/` vs `features/` 分界原则**：

| 目录 | 定义 | 典型内容 |
|--------|------|----------|
| `src/components/` | **可复用 UI/业务组件**—可被多个模块引用 | `common/`（通用基础组件）、`serial/`、`mqtt/`、`settings/` 等功能内组件 |
| `src/features/` | **独立功能域模块**—带有完整业务封装（Hook+组件+注册器），内部自治 | `AutoReply`、`CommandMenu`、`VirtualPort`、`serial-monitor` |

**判断准则**：若一个功能模块需要自己的注册器（`registry.ts`）或內部独立状态扩展点，放入 `features/`；否则放入 `components/`。

**`src/services/` 目录定义**：

| 文件 | 职责 |
|--------|------|
| `toastManager.ts` | Toast 命令式 API（可在任意层调用） |
| `confirmManager.ts` | Confirm 对话框 Promise 驱动 |
| `MessagePipeline.ts` | 串口/MQTT 消息处理管道 |
| `GraphService.ts` | 图形软件数据计算服务 |

**铁律**：`services/` 内的模块是纯 TypeScript 类/对象，不引用 React，不使用 Hook API。如果需要访问 Context，应将逻辑提升到 Hook 层。

**铁律**：
- **分级行数限制**（按组件职责分类）：
  - **基础 UI 组件**（Common UI，如 Button/Tooltip/Switch）：**≤ 150 行**
  - **核心业务组件**（Smart Components，如 MonitorTerminal/SerialMonitor）：**≤ 250 行**（超出必须拆分子组件或提取 Hook）
  - **配置面板 / 长表单**（Settings/Forms，如 SettingsEditor）：**豁免至 600 - 800 行**（前提：超出的行数必须是无深层逻辑嵌套的纯声明式 JSX 排版）
  - **工具模块**（`src/lib/` 下的独立工具，如 crashReporter/EventBus）：**≤ 350 行**
- **核心红线**：无论物理行数多少，函数体认知复杂度（Cognitive Complexity）必须严格 **≤ 20**
- 复杂 `useCallback`/`useEffect` 逻辑提取为自定义 Hook
- 重复代码（≥2处相同逻辑）必须提取为工具函数

### 2.5 Tauri 安全规范

**铁律**：
- `tauri.conf.json` 必须配置 CSP（Content Security Policy），严格限制 `script-src`、`connect-src` 等
- `src-tauri/capabilities/default.json` 遵循**最小权限原则**，仅声明必需的 plugin 权限
- 所有 Command 函数的路径参数必须做安全校验（防路径遍历、非空检查、绝对路径验证）
- 禁止在前端直接暴露文件系统操作，必须通过 Command 中转
- Tauri invoke 白名单由 `generate_handler![]` 宏限定，未注册的 Command 前端无法调用

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
- **绝对禁止 `any`** — 包括新增代码和历史代码（须逐步消除）
- 需要宽松类型时使用 `unknown` + 类型守卫，禁止 `any` 作为逃生舱
- 禁止 `[key: string]: any` 索引签名（使用明确的可选属性或 `Record<string, unknown>`）
- 禁止 `as any` 类型断言（可用 `as unknown as TargetType` 双重断言替代）
- 事件回调参数使用 `unknown[]` 而非 `any[]`
- 所有导出函数必须有明确返回类型
- 接口优先于 `type`（除联合类型）
- 枚举使用 `const enum` 或字面量联合类型

### 3.2 Rust 规范

```rust
// ✅ 正确：明确返回类型，中文注释
#[tauri::command]
pub fn serial_open(
    app: tauri::AppHandle,
    connection_id: String,
    options: SerialOpenOptions,
) -> Result<Value, String> {
    // 解析参数并打开串口
}

// ❌ 禁止：unwrap() 直接调用（须使用 ? 或 map_err）
let port = serialport::new(&path, baud).open().unwrap(); // 禁止

// ✅ 正确：错误转换
let port = serialport::new(&path, baud).open().map_err(|e| e.to_string())?;
```

**规则**：
- 禁止 `unwrap()` 用于可能失败的操作（仅允许用于已知安全的初始化）
- `Mutex` 锁获取统一使用 `lock().map_err(lock_err)?` 模式
- 线程退出信号统一使用 `Arc<AtomicBool>` + `Ordering::SeqCst`
- 大块数据传递使用 `Vec<u8>` 而非 `String`
- Windows 特定代码使用 `#[cfg(target_os = "windows")]` 条件编译

### 3.3 React 组件规范

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

### 3.4 注释规范

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

### 3.5 命名规范

| 类别 | 规则 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `SerialMonitor.tsx` |
| Hook 文件 | camelCase + `use` 前缀 | `useSerialMonitorState.ts` |
| 工具函数文件 | camelCase | `tooltipPositioning.ts` |
| CSS 变量 | `--st-` 前缀 | `--st-monitor-rx-bg` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 事件处理 | `handle` 前缀 | `handleDragEnd` |
| Rust Command | snake_case | `serial_list_ports` |
| Rust State | PascalCase + `State` 后缀 | `SerialState` |

### 3.6 Git 提交规范

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

**全局状态同步要求（非常重要！）**：
- 新增任何 CSS 变量后，除了在 `index.css` 定义备用值和在 `componentTokenMap.ts` 注册之外，**必须同步将其默认值添加到 `src-tauri/default-dark.json`、`src-tauri/default-light.json`、`src-tauri/default-mono.json`** 中。如果不加，切换或重置主题时将会丢失这些变量！

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

#### SettingsEditor（设置编辑器）
- 控件区域统一宽度：`w-56`（224px），所有行的输入控件、选择器、按钮组都必须在此宽度内
- 包含辅助按钮时：外容器 `w-56`，输入框 `flex-1 min-w-0`，按钮 `flex-shrink-0`
- 禁止输入框 + 按钮的总宽度超过 `w-56`，否则会导致行间对齐错位

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

### 4.6 国际化（i18n）规范

- **双语强制**：所有面向用户的文本（按钮、标签、提示、错误消息、Toast、Tooltip、Dialog）必须同时在 `zh-CN.ts` 和 `en-US.ts` 中定义
- 禁止在 TSX 中硬编码中文或英文字符串，必须使用 `t('key')` 引用
- 新增 i18n key 必须在 **两个语言文件中同步添加**

### 4.7 Tooltip 统一规范

- **强制使用项目 `<Tooltip>` 组件**（`src/components/common/Tooltip.tsx`）
- ❌ 禁止使用原生 HTML `title=` 属性
- ✅ 正确：`<Tooltip content={t('xxx')}><button>...</button></Tooltip>`
- ❌ 禁止：`<button title="xxx">...</button>`

### 4.8 组件颜色独立性规范

每个 UI 组件必须拥有**专属 CSS 变量**，禁止直接使用功能级变量（如 `--widget-background`）。

**变量命名规则**：`--{component-name}-{property}`

```css
/* ✅ 正确：组件专属变量 */
--serial-config-bg: var(--sidebar-background);
--serial-config-text: var(--st-monitor-config-text);

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

**历史命名前缀说明（`--st-` 前缀）**：

项目历史遗留了 `--st-` 前缀的变量（如 `--st-sidebar-text`、`--st-monitor-rx-bg`），这是早期约定的「样式令牌」简称。
**当前规范的新增变量统一使用 `--{component}-{property}` 格式**，与 `--st-` 并存。
迁移策略：**新变量不再沿用 `--st-` 前缀**；历史 `--st-` 变量暂不强制重命名，但重构时遇到应顺手迁移。

### 4.9 反模式（禁止）

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
- ❌ `App.tsx` 中 Provider 嵌套超过 5 层（须使用 `composeProviders` 工具函数扁平化）
- ❌ 使用 `any` 类型或 `as any` 断言（须使用 `unknown` + 类型守卫）
- ❌ 在周期性调用（`setInterval` / 定时器）触发的 Rust Command 中 spawn 外部进程（须用 Win32 API / Rust 原生库替代）

---

## 五、性能与稳定性规范

### 5.1 渲染性能

- **虚拟列表**：日志超过 100 条时必须使用虚拟化
- **`React.memo`**：高频更新场景（串口日志流）必须使用
- **状态分片**：频繁变化的值（缓冲区数据）与低频状态（主题）分离
- **`useMemo`/`useCallback`**：依赖项明确，避免不必要的重新计算

### 5.2 Rust 后端稳定性

- **防御性编程**：所有硬件操作（`open`/`close`/`write`）必须 `map_err` 转换错误
- **资源释放**：串口关闭后通过 `AtomicBool` 信号停止读取线程
- **内存安全**：使用 `Arc<Mutex<T>>` 管理共享状态，避免裸指针
- **线程退出**：所有后台线程必须通过 `AtomicBool` 标志位优雅退出
- **锁竞争**：持锁时间尽可能短，重操作在锁外执行

### 5.3 数据流性能

- **串口读取**：Rust 原生线程 + 4096 字节缓冲区，通过 `emit` 直推前端
- **定时发送**：`Instant` + `thread::sleep` 实现高精度定时
- **MQTT 事件循环**：独立 tokio 运行时 + 专用线程

### 5.4 资源释放规范

- **串口关闭顺序**：停止定时发送 → `alive.store(false)` 停止读取线程 → `emit` 关闭事件 → `HashMap.remove()`
- **TCP Server 关闭**：`alive.store(false)` → listener 自然退出 → 客户端线程结束 → `HashMap.remove()`
- **Monitor 关闭**：设置 `STATE_STOPPING` → `alive.store(false)` → 双向线程退出 → `emit` 关闭事件
- **MQTT 断开**：`try_disconnect()` → 事件循环退出 → `HashMap.remove()`
- **前端事件监听**：组件 `useEffect` 返回的清理函数中必须调用 `unlisten`

### 5.5 残留文件清理规则

- 重构后旧文件必须删除，不得保留在原位置
- 同一模块不得在多个位置存在副本
- 定期检查项目各子目录是否有不属于当前架构的孤立文件

### 5.6 启动性能

- **窗口隐藏启动**：`tauri.conf.json` 主窗口 `visible: false`，前端就绪后 `getCurrentWindow().show()`
- **模块懒加载**：`App.tsx` → `FullApp.tsx`（React.lazy），确保首帧仅加载最小模块
- **IPC 预注册**：`registerAllTauriAPIs()` 在 React 渲染前完成，避免运行时查找
- **主题预注入**：`boot-theme.js` 在 HTML 中同步执行，避免主题闪烁

### 5.7 IPC / 定时任务性能守则

> ⚠️ **历史教训**：`get_stats()` 每 3 秒通过 `Command::new("powershell.exe")` spawn 进程获取内存使用量，
> 导致整个应用每 3 秒卡顿一次（串口数据、拖拽、动画全受影响）。
> 修复：改用 Win32 API `K32GetProcessMemoryInfo`（微秒级完成）。

**铁律**：
- ❌ **禁止在周期性任务（`setInterval` / 定时器循环）中调用会 spawn 外部进程的 Rust Command**
  - 包括但不限于：`Command::new("powershell.exe")`、`Command::new("cmd.exe")`、`Command::new("wmic")`
  - ✅ 替代方案：使用 Win32 API（FFI）、Rust 原生库、注册表读取等零开销方式
- ❌ **禁止 Tauri Command 同步阻塞超过 10ms**
  - `Command::new().output()` 是同步阻塞的，每次启动 PowerShell 需 200-2000ms
  - 如必须调用外部进程，应在独立 `tokio::spawn` 中执行并通过 `emit` 返回结果
- **周期性 IPC 调用自检清单**：
  - `setInterval(fn, N)` 中的 `fn` 是否触发 Tauri `invoke`？
  - 该 `invoke` 对应的 Rust Command 是否有 `Command::new` / 文件 I/O / 网络请求？
  - 如有，是否可用缓存、增量查询或原生 API 替代？

### 5.8 全局错误处理规范

**Rust 后端**：
- 所有 Tauri Command 必须返回 `Result<T, String>`，错误信息面向用户可读
- `Mutex` 锁获取统一使用 `lock().map_err(lock_err)?` 模式（`lock_err` 函数定义在各模块 state.rs 中）
- 硬件操作（串口/网络）错误统一用 `map_err(|e| format!("模块: {}", e))?` 转换
- 禁止在 Command 中使用 `unwrap()` / `expect()` 处理可能失败的操作

**前端错误分层**：

| 层级 | 机制 | 覆盖范围 |
|------|------|---------|
| 组件级 | `ErrorBoundary` 包裹 | React 渲染错误，显示 Fallback UI |
| IPC 级 | `invoke().catch()` | Tauri Command 调用失败 → Toast 提示 |
| 全局级 | `window.onerror` + `crashReporter` | 未捕获异常 → 崩溃上报 |

**铁律**：
- `ErrorBoundary` 必须包裹在 `App.tsx` 的 Provider 链中，位于 `I18nProvider` 之后
- IPC 适配层中所有 `invoke` 调用必须有 `.catch` 错误处理，禁止静默吞错
- 崩溃上报（`crashReporter.ts`）仅在用户授权（`enableCrashReport`）后启用

### 5.9 测试策略与基准

**测试框架**：
- 前端：Vitest（`vitest.config.ts`）
- Rust：`cargo test`（标准 Rust 测试）

**覆盖范围**：

| 层级 | 必须测试 | 可选测试 |
|------|---------|---------|
| 工具函数 | `src/utils/` 中的纯函数（格式化、CRC、命名、Token 遍历等） | — |
| 数据转换 | Hex/ASCII/Unicode 编解码、字节格式化 | 复杂嵌套场景 |
| 类型守卫 | 所有 `is*` 类型守卫函数 | — |
| Rust Command | 参数校验逻辑、错误路径 | 硬件交互（需 mock） |

**铁律**：
- `src/utils/` 中新增的纯函数必须附带 `__tests__/` 中的测试文件
- 测试文件命名：`<module>.test.ts`
- 运行命令：`npm run test`（Vitest）/ `cd src-tauri && cargo test`（Rust）

### 5.10 CSS 文件组织策略

`index.css` 为 `@import` 聚合入口（~19 行），所有样式拆分至 `src/styles/` 下：

```
src/styles/
├── variables.css      # Dark 默认 CSS 变量 + 组件级语义映射（~557 行）
├── themes.css         # Light/Mono 主题覆盖（~527 行）
├── vendors.css        # 字体声明 + 第三方库覆盖（~115 行）
├── reset.css          # body/滚动条/焦点/表单重置（~110 行）
├── animations.css     # 动画关键帧 + 工具类（~120 行）
└── glass.css          # Pic 毛玻璃 + Ghost Peek 模式（~90 行）
```

**拆分原则**：
- 每个 CSS 文件 ≤ 400 行（**纯声明式文件豁免**：仅含 CSS 变量声明、无嵌套逻辑的文件可至 600 行）
- 组件专属 CSS 变量定义在 `variables.css`（Dark 默认值）和 `themes.css`（Light/Mono 覆盖）中
- 在 `index.css` 中通过 `@import` 聚合

**铁律**：
- 新增全局 CSS 变量时，同步在 `variables.css`（默认值）和 `themes.css`（主题覆盖）中添加
- 禁止在 TSX 中使用内联 `style={}` 硬编码颜色值（CSS 变量引用 `var(--xxx)` 除外）

### 5.11 API 版本与废弃管理

**Tauri Command 变更流程**：

| 操作 | 要求 |
|------|------|
| **新增 Command** | 在 `lib.rs` 的 `generate_handler![]` 中注册 + 同步前端 IPC 适配层 + 更新本规范 §2.2/§2.3 |
| **修改签名** | 前后端同步修改 + 确保现有调用点全部更新 |
| **废弃 Command** | 先标记 `#[deprecated]` 并保留一个版本周期，再在下一版本中移除 |
| **删除模块** | 同步更新 `mod.rs`、`lib.rs`、IPC 适配层、本规范文档 |

**铁律**：
- 任何 Command 新增/删除/重命名，必须在**同一次提交**中同步更新 `context.md` 的 §2.2 和 §2.3
- 前端 IPC 适配层文件数量必须与后端 Command 模块一一对应

---

## 六、Skill 工具使用指南

### 6.0 SkillHub CLI（已安装）

**安装路径**: `~/.skillhub/`（`skills_store_cli.py`）

```powershell
# 搜索 Skill
python "$env:USERPROFILE\.skillhub\skills_store_cli.py" search "关键词"

# 安装 Skill 到当前项目
python "$env:USERPROFILE\.skillhub\skills_store_cli.py" install <slug>
```

### 6.1 已安装 Skill 清单（4 个）

#### ① ui-ux-pro-max
- **路径**: `.agent/skills/ui-ux-pro-max/`
- **功能**: 综合 UI/UX 设计智能，含 67 种风格、96 个色板、57 种字体搭配、99 条 UX 准则
- **何时调用**: 新建 UI 组件、设计交互、选择色板字体时

#### ② typescript-pro
- **路径**: `.agent/skills/typescript-pro/`
- **功能**: 高级类型系统、泛型、全栈类型安全
- **何时调用**: 设计复杂类型、类型守卫、条件类型时

#### ③ typescript-lsp
- **路径**: `.agent/skills/typescript-lsp/`
- **功能**: TypeScript LSP 诊断、实时代码检查
- **何时调用**: 代码审查、提交前检查时

#### ④ afrexai-react-production
- **路径**: `.agent/skills/afrexai-react-production/`
- **功能**: 生产级 React 应用架构、性能优化
- **何时调用**: 组件重构、Hooks 设计时

### 6.2 新建组件完整工作流

```
步骤 1: 设计（调用 ui-ux-pro-max）
步骤 2: 架构（遵循本规范 §2.4）
步骤 3: 编码（遵循本规范 §3）
步骤 4: Rust Command（如需后端交互，遵循 §2.2）
步骤 5: 交付前检查
☐ 无 Emoji 图标（使用 Lucide）
☐ 可点击元素有 cursor:pointer
☐ hover 有 150-300ms 过渡动画
☐ TypeScript 零错误
☐ Rust cargo check 零错误
☐ 组件 ≤ 250 行
```

---

## 七、验证标准

所有代码变更必须满足：

1. **TypeScript 编译通过**: `npx tsc --noEmit` 零新增错误
2. **Rust 编译通过**: `cd src-tauri && cargo check` 零错误
3. **Vite 构建通过**: `npm run build` 成功
4. **Tauri 构建通过**: `npm run tauri build` 成功（可选，发布前必须）
5. **复杂度**: 所有函数认知复杂度 ≤ 20
6. **文件大小**: 基础 UI 组件 ≤ 150 行、业务组件 ≤ 250 行、配置面板 ≤ 800 行、Rust Command 模块 ≤ 400 行
7. **运行稳定**: 快速插拔虚拟串口不崩溃、休眠唤醒不断联

---

## 八、文档更新规则

- 新增模块/Hook 时，更新模块注释中的 `子模块` 列表
- 修改架构（如新增 Command 模块）时，更新本文件 §2
- 新增交互组件时，更新本文件 §4.4
- 引入新 Skill 时，更新本文件 §6
- 新增 Rust crate 依赖时，在 `Cargo.toml` 添加注释说明用途

### 5.12 调试信息管理规范

当遇到问题且**首次修改无法解决**时，应在可能出问题的代码中添加详细调试信息，直至用户确认功能正常后再删除。

**统一标记格式**：所有调试信息必须包含 `[DBG]` 标记，便于快速搜索和批量清理。

```rust
// Rust — 使用 log::info! / log::error! + [DBG] 前缀
log::info!("[DBG][模块名] 阶段描述: var1={var1}, var2={var2}");
log::error!("[DBG][模块名] 异常描述: {err}");

// 示例：
log::info!("[DBG][color_picker_open] build() 前: x={x}, y={y}");
log::info!("[DBG][color_picker_open] build() 后: success={}", win.is_some());
```

```typescript
// TypeScript — 使用 console.log + [DBG] 前缀
console.log('[DBG][组件名] 阶段描述:', { var1, var2 });

// 示例：
console.log('[DBG][ColorPickerApp] hideSelf called, hasClosed=', hasClosed.current);
```

**流程规范**：
1. **插入时机**：首次修复尝试失败后，在相关代码路径的每个关键节点添加 `[DBG]` 日志
2. **信息要求**：每条日志必须包含 `[DBG][模块/函数名]` + 当前阶段 + 关键变量值
3. **保留期限**：用户确认功能正常后，**必须立即清理所有 `[DBG]` 日志**
4. **清理方式**：全局搜索 `[DBG]` 标记，删除所有包含该标记的日志行
5. **扫描命令**：
   - Rust: `grep -rn "\[DBG\]" src-tauri/src/`
   - TypeScript: `grep -rn "\[DBG\]" src/`

**铁律**：
- ❌ 禁止不带 `[DBG]` 标记的临时调试日志（`console.log("test")` / `log::info!("here")` 等）
- ❌ 禁止将 `[DBG]` 日志提交到 Git（提交前必须清理）
- ✅ 正式的运行日志（不含 `[DBG]`）可保留，如 `log::info!("[color_picker_open] 创建成功")`

