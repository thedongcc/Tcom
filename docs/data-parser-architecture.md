# Tcom 数据解析架构文档

> 最后更新：2026-03-30  
> 作者：Antigravity AI（代码自动生成）

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [数据流完整链路](#2-数据流完整链路)
3. [各层详细说明](#3-各层详细说明)
   - [3.1 配置数据结构（前端类型）](#31-配置数据结构前端类型)
   - [3.2 后端数据结构（Rust）](#32-后端数据结构rust)
   - [3.3 配置持久化层](#33-配置持久化层)
   - [3.4 切帧引擎（Framer）](#34-切帧引擎framer)
   - [3.5 解码引擎（Decoder）](#35-解码引擎decoder)
   - [3.6 数据总线 Store（前端）](#36-数据总线-store前端)
4. [UI 组件与解析的关联位置](#4-ui-组件与解析的关联位置)
   - [4.1 ParserSidebar（方案管理入口）](#41-parsersidebar方案管理入口)
   - [4.2 SerialConfigPanel（串口方案绑定）](#42-serialconfigpanel串口方案绑定)
   - [4.3 DataViewPanel（实时数据展示）](#43-dataviewpanel实时数据展示)
5. [配置、修改操作指南](#5-配置修改操作指南)
6. [当前已知问题与架构缺陷](#6-当前已知问题与架构缺陷)
7. [未来扩展方向建议](#7-未来扩展方向建议)

---

## 1. 整体架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                      前端（React + Zustand）                         │
│                                                                     │
│  ParserSidebar          SerialConfigPanel           DataViewPanel  │
│  （方案编辑管理）         （串口↔方案绑定）           （实时数值展示）    │
│        │                       │                          ↑        │
│        ▼                       ▼                          │        │
│   useParserStore          Session Config           useDataBusStore  │
│   （Zustand Store）       parserSchemeIds           （Zustand Store） │
└──────────────┬────────────────────────────────────────────┬─────────┘
               │ Tauri IPC                                  │ Tauri IPC Event
               │ invoke()                                   │ listen('tcom-parsed-data')
               ▼                                            │
┌─────────────────────────────────────────────────────────────────────┐
│                        后端（Rust + Tauri）                          │
│                                                                     │
│  parser/api.rs           serial/connection.rs                      │
│  ┌──────────────┐        ┌──────────────────────────────────────┐  │
│  │ ParserState  │ ←读取─ │   spawn_reader_thread()              │  │
│  │ (内存状态)    │        │   - Framer（切帧，处理粘包/半包）      │  │
│  │ Mutex<Config>│        │   - Decoder（字节 → 物理量）          │  │
│  └──────────────┘        │   - emit('tcom-parsed-data')         │  │
│                          └──────────────────────────────────────┘  │
│  parser/storage.rs                                                  │
│  parser_config.json（AppData目录，磁盘持久化）                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据流完整链路

### 配置流（用户修改方案 → 持久化 → 生效）

```
用户在 ParserSidebar 增/改/删字段
        │
        ▼
useParserStore.updateScheme() 更新本地 Zustand 状态
        │ 防抖 600ms
        ▼
useParserStore.pushToEngine()
        │
        ▼ Tauri IPC: invoke('update_parser_config', { newConfig })
        │
        ▼
Rust: update_parser_config()
  ├── 更新 ParserState.config（内存 Mutex）
  └── storage::save_config() → parser_config.json（原子写入）
```

### 实时数据流（串口数据 → 解析 → 前端展示）

```
物理串口设备发送二进制帧
        │
        ▼
serialport::read() 读到 buf[..n]
        │
        ├──────────────────────────────────────┐
        ▼                                      ▼
A轨：emit('serial:data')               B轨：每个绑定方案的 Framer.append(data)
（Raw Hex，供终端显示）                         │
                                        Framer.extract_frames()
                                        （解决粘包/半包，切出完整帧）
                                               │
                                        decoder::decode_frame()
                                        （字节数组 → HashMap<字段名, f64值>）
                                               │
                                     parsed_batch.push(result)
                                               │
                                   节流：每 16ms（~60Hz）发报一次
                                               │
                                   emit('tcom-parsed-data', { session_id, batch })
                                               │
        ┌──────────────────────────────────────┘
        ▼
useDataBusListener.ts 监听 'tcom-parsed-data'
        │
        ▼
useDataBusStore.ingestBatch(sessionId, batch)
  ├── 更新 sessionsData[sessionId].latestValues（最新值，驱动 DataViewPanel）
  └── 追加到 dataBusHistory[sessionId][fieldName]（波形历史，驱动 Dashboard 图表）
        │
        ▼
DataViewPanel（实时数值展示）、Dashboard 图表（历史波形）自动重渲染
```

---

## 3. 各层详细说明

### 3.1 配置数据结构（前端类型）

**文件位置：** `src/store/useParserStore.ts`

```typescript
// 数据类型枚举（与 Rust 严格对应）
type DataType =
  | 'u8' | 'i8'
  | 'u16_le' | 'u16_be'
  | 'i16_le' | 'i16_be'
  | 'u32_le' | 'u32_be'
  | 'i32_le' | 'i32_be'
  | 'f32_le' | 'f32_be';

// 单个字段定义
interface FieldDef {
  name: string;       // 字段名（用作 DataBus 的 key）
  offset: number;     // 字节偏移量（相对帧起始，含帧头）
  data_type: DataType;
  multiplier: number; // 换算系数（原始值 × multiplier = 物理量）
  color?: string;     // 前端颜色（hex，仅前端显示用，也持久化到 Rust 侧）
}

// 单个解析方案
interface ParserScheme {
  id: string;
  name: string;
  frame_header: number[];    // 帧头字节数组，如 [0xAA, 0x55]
  min_frame_len?: number;    // 完整帧最小长度（含帧头），默认 10
  fields: FieldDef[];
}

// 全局配置（包含所有方案）
interface ParserConfig {
  schemes: ParserScheme[];
  active_ids: string[];  // 当前"激活"方案（目前仅用于 ParserSidebar 高亮显示，不影响解析生效）
}
```

> **注意：** `active_ids` 是 UI 层的概念（高亮显示当前关注的方案），**并不决定哪个端口使用哪个方案**。实际生效的绑定关系存储在 Session 配置的 `parserSchemeIds` 字段中。

**Zustand Store 方法：**

| 方法 | 说明 |
|------|------|
| `loadConfig()` | 向 Rust 读取配置（首次调用从磁盘读取） |
| `saveConfig(config)` | 向 Rust 写入配置（同时更新内存 + 磁盘） |
| `addScheme(name?)` | 新建方案（本地，需手动 `pushToEngine` 或等自动保存） |
| `deleteScheme(id)` | 删除方案（本地） |
| `toggleActiveScheme(id)` | 切换 UI 高亮激活状态 |
| `updateScheme(id, updater)` | 更新方案（本地） |
| `reorderSchemes(from, to)` | 拖拽排序（本地） |
| `duplicateScheme(scheme)` | 复制方案（本地） |
| `pushToEngine()` | 将当前全量 config 推送到 Rust 并落盘 |

---

### 3.2 后端数据结构（Rust）

**文件位置：** `src-tauri/src/commands/parser/schema.rs`

```rust
pub struct FieldDef {
    pub name: String,
    pub offset: usize,
    pub data_type: DataType,
    pub multiplier: f64,
    pub color: Option<String>,  // 前端颜色，Rust 存储但不用于解析逻辑
}

pub struct ParserScheme {
    pub id: String,
    pub name: String,
    pub frame_header: Vec<u8>,
    pub min_frame_len: Option<usize>,
    pub fields: Vec<FieldDef>,
}

pub struct ParserConfig {
    pub schemes: Vec<ParserScheme>,
    pub active_ids: Vec<String>,
}
```

**Tauri IPC Commands：**

| 命令 | 说明 |
|------|------|
| `get_parser_config` | 读取配置（首次从磁盘，后续从内存） |
| `update_parser_config` | 覆盖全量配置并原子落盘 |
| `get_parser_schema` | ⚠️ Deprecated，请用 `get_parser_config` |
| `update_parser_schema` | ⚠️ Deprecated，请用 `update_parser_config` |

---

### 3.3 配置持久化层

**文件位置：** `src-tauri/src/commands/parser/storage.rs`

- **存储路径：** `{AppData}/tcom/parser_config.json`
- **格式：** JSON，`serde_json::to_string_pretty`
- **写入方式：** 原子写入（先写 `.tmp`，成功后 `rename` 覆盖），防崩溃数据丢失
- **加载时机：** 第一次调用 `get_parser_config` 时（由 `ParserState.initialized: AtomicBool` 控制，防止重复覆盖）
- **默认内容：** 若文件不存在，返回 `ParserConfig::default_config()`（包含一个预置的测试方案）

---

### 3.4 切帧引擎（Framer）

**文件位置：** `src-tauri/src/commands/parser/framer.rs`

解决串口常见的**粘包**（多帧粘在一起）和**半包**（一帧被拆成多次收到）问题。

**切帧算法：**
1. 将新收到的字节追加到内部缓冲区（`Vec<u8>`）
2. 在缓冲区中搜索帧头字节序列（如 `[0xAA, 0x55]`）
3. 丢弃帧头之前的所有脏数据
4. 等待缓冲区累积至 `min_frame_len` 字节
5. 切出完整帧，从缓冲区 `drain`，继续循环
6. 无完整帧时退出，保留跨包倒数部分（防帧头跨 `append` 丢失）

**热更新机制：** 每次收到串口数据时，通过**指纹比对**（`scheme.id + name + fields.len()`）检测方案是否变更，变更时重建 Framer 实例并清空脏数据缓冲区，确保方案修改立即生效。

---

### 3.5 解码引擎（Decoder）

**文件位置：** `src-tauri/src/commands/parser/decoder.rs`

无状态函数，输入一帧完整字节数组 + 方案定义，输出 `HashMap<字段名, f64物理量值>`。

**解码逻辑：**
- 按 `field.offset` + `field.data_type.byte_size()` 定位字节范围
- 支持所有端序的整型和 IEEE 754 浮点型
- 越界字段**静默跳过**（`continue`），不影响其他字段解码
- 原始数值 × `field.multiplier` = 最终物理量（已在 Rust 侧换算）

---

### 3.6 数据总线 Store（前端）

**文件位置：** `src/store/useDataBusStore.ts`

**结构：**
```
sessionsData: {
  [sessionId: string]: {
    latestValues: { [fieldName: string]: number }  // 最新值，用于 DataViewPanel 展示
  }
}

dataBusHistory (模块级变量，不在 Zustand 中): {
  [sessionId: string]: {
    [fieldName: string]: { t: number[], v: number[] }  // 最多 2000 个历史点，用于图表
  }
}
```

> `dataBusHistory` 刻意脱离 Zustand 管理（直接操作模块变量），避免高频写入（60Hz）触发 React 全局重渲染造成性能问题。

**监听入口：** `src/hooks/useDataBusListener.ts`  
在 `src/components/layout/Layout.tsx` 中挂载，**应用生命周期内常驻**。

---

## 4. UI 组件与解析的关联位置

### 4.1 ParserSidebar（方案管理入口）

**位置：** 左侧 Activity Bar → 数据解析图标（波形图标）  
**文件：** `src/components/parser/ParserSidebar.tsx`

**功能：**
- 显示所有解析方案列表，支持折叠/展开
- **新建方案：** 点击"+ 新建"创建默认方案（帧头 `AA 55`，最小帧长 10）
- **编辑方案：** 点击方案展开编辑区，可修改名称、帧头、帧长、字段列表
- **激活切换：** 点击方案左侧圆点，切换 UI 高亮状态（**注意：此激活与端口绑定无关**）
- **运行中标签：** 若方案被某个串口绑定且正在连接，显示 `·N口` 绿色标签
- **字段编辑：** 可配置字段名、字节偏移、数据类型、换算比例、颜色
- **拖拽排序：** 拖动方案左侧手柄调整顺序
- **右键菜单：** 复制方案、删除方案
- **实时数据开关：** 顶部 Switch 控制右侧 `DataViewPanel` 的显示/隐藏
- **自动保存：** 配置变更后 600ms 防抖自动调用 `pushToEngine()` 落盘

**样式特点：**
- 深色系，与整体 Obsidian 主题风格一致
- 方案激活状态：蓝色圆点 + 蓝色边框
- 方案展开后边框高亮为 `--focus-border-color`
- 字段卡头部有 14×14 的圆形颜色纽扣（点击可打开高级颜色选择器）

---

### 4.2 SerialConfigPanel（串口方案绑定）

**位置：** 每个串口标签页的配置侧边栏 → 最底部"解析引擎绑定"区域  
**文件：** `src/components/serial/SerialConfigPanel.tsx`

**功能：**
- 显示所有可用方案（pill 按钮形式，多选）
- 点击选中/取消选中，对应 `parserSchemeIds` 字段更新到 Session Config
- **连接状态时禁用**（不允许修改绑定方案，防止运行中切换造成数据混乱）

**生效时机：**
- 绑定关系在**建立连接时**（调用 `serial_open`）传入 Rust 后端
- 连接中途修改绑定**不会生效**，需断开重连
- `parserSchemeIds` 通过 `serial_open(connectionId, options, parserSchemeIds)` 传入 Rust
- Rust 中每个 `connectionId` 对应独立的后台读取线程和 Framer 实例集合

**方案选择联动：**
- SerialConfigPanel 在挂载时会自动触发 `loadConfig()` 确保方案列表已加载（防止冷启动时列表为空的报错状态）

---

### 4.3 DataViewPanel（实时数据展示）

**位置：** 应用最右侧面板（由 ParserSidebar 中的"实时数据"开关控制显隐）  
**文件：** `src/components/parser/DataViewPanel.tsx`

**功能：**
- 以卡片形式实时展示当前激活 Session 的所有解析字段值
- 字段按绑定的**方案分组**，每组显示方案名称横线分隔
- 活跃字段（有接收到值）显示 `LIVE` 绿色标签
- 大字体显示当前值（保留 3 位小数）
- 下方显示数据类型、字节偏移、换算系数元信息
- 字段名旁边有 14px 圆形颜色纽扣（点击可打开高级颜色选择器）
- **颜色更改会立即持久化**（调用 `updateScheme` → `pushToEngine`），与 ParserSidebar 的颜色圆点完全联动
- 未映射到方案定义的字段（Raw / Unmapped）另外分组展示
- 内含**悬浮滚动条**（不占布局空间，仅在滚动时显示）

**数据来源：**
- 从 `useSession()` 获取当前激活 Session 的 `parserSchemeIds`
- 从 `useDataBusStore` 订阅当前 Session 的 `latestValues`
- 从 `useParserStore` 获取方案定义（用于显示字段名/颜色/类型元信息）

---

## 5. 配置、修改操作指南

### 如何创建一个新的解析方案

1. 点击左侧 Activity Bar 的**数据解析图标**（波形线），打开 ParserSidebar
2. 点击右上角 **`+ 新建`** 按钮，生成默认方案（默认帧头 `AA 55`，帧长 10）
3. 展开刚创建的方案，修改：
   - **方案名称**：填入可识别的名字
   - **帧头 HEX**：填入你的协议帧头（空格分隔，如 `AA 55`）
   - **总帧长**：填入完整帧的字节数（含帧头）
4. 点击右侧 **`+ 添加字段`** 添加要解析的字段：
   - **名称**：字段标识符（英文，用于 DataBus key）
   - **字节偏移**：该字段数据在帧中的起始字节位置（从 0 开始，含帧头字节）
   - **数据类型**：选择正确的端序和位宽
   - **换算比例**：原始值 × 系数 = 物理量（如 `0.1` 表示整型值 ÷ 10）
   - **颜色**：点击颜色圆点选择显示颜色
5. 配置完成后，**600ms 自动保存**到磁盘，无需手动保存

### 如何将方案绑定到串口

1. 打开目标串口标签页的**配置侧边栏**（点击串口信息栏或侧边栏图标）
2. 在底部**解析引擎绑定**区域，点击要绑定的方案按钮（变蓝表示已绑定）
3. 同一个串口可以绑定**多个方案**（并发解析，适用于多种帧头共存的场景）
4. **断开并重新连接**，方案才会真正生效

### 如何查看实时解析结果

1. 在 ParserSidebar 顶部开启**实时数据**开关
2. 右侧会弹出 `DataViewPanel` 面板
3. 连接串口后，符合帧格式的数据会自动显示对应字段名和数值

---

## 6. 当前已知问题与架构缺陷

### 🔴 严重问题

#### P1：同一方案可被多个串口同时绑定（无排他锁）

**现象：** 在串口 A 的配置中选中方案 X，在串口 B 的配置中也可以选中方案 X。  
**风险：** 两个串口会各自向同一个 `DataBus` 命名空间写入同名字段，数值会互相覆盖，无法区分数据来源。  
**根因：** `parserSchemeIds` 是存储在每个 Session Config 中的独立数组，没有全局校验机制。  
**建议修复：** 在 `SerialConfigPanel` 的方案选择界面，标记已被其他 Session 绑定的方案（加 tooltip 警告），或直接禁止重复绑定。

#### P2：MQTT 完全不支持数据解析

**现象：** MQTT 会话没有任何方案绑定 UI，收到的二进制消息无法被解析为物理量。  
**根因：**

1. **前端层（`MqttSessionConfig` 类型）：** 没有 `parserSchemeIds` 字段的 UI 绑定区域（`SerialConfigPanel` 的对等物 `MqttConfigPanel` 未实现解析绑定）
2. **后端层（`mqtt.rs`）：** MQTT 消息到达后没有经过 Framer + Decoder 流水线，也没有 `emit('tcom-parsed-data')` 推送
3. `MqttSessionConfig` 类型虽继承了 `BaseSessionConfig`（含 `parserSchemeIds? `字段），但没有任何调用链实际使用它

**建议修复：**
- 前端：在 `MqttConfigPanel` 底部添加与 `SerialConfigPanel` 完全相同的方案绑定 UI
- 后端：在 MQTT 消息接收处理函数中，按 `parserSchemeIds` 读取方案，调用 Framer + Decoder，并 `emit('tcom-parsed-data')`

---

### 🟡 中等问题

#### P3：`active_ids` 语义混乱，与实际解析生效无关

**现象：** 用户在 ParserSidebar 中点击激活某方案后，误以为"激活"意味着该方案会应用到某个连接，但实际只是 UI 高亮效果。  
**根因：** `active_ids` 最初设计为全局激活方案，后来演进为会话级 `parserSchemeIds` 绑定，但 `active_ids` 未被废弃，造成语义上的混淆。  
**建议修复：** 明确 UI 上"激活"圆点的含义（改为"查看模式/当前关注"），或彻底移除 `active_ids`，将 ParserSidebar 中的方案激活状态改为显示"哪些方案正被使用"的状态汇总。

#### P4：方案配置修改后连接中不自动热应用

**现象：** 连接中途在 ParserSidebar 修改了某方案的帧头或字段后，Rust 侧的热更新机制（指纹比对）仅检测 `id + name + fields.len()`，**不检测 offset、data_type、multiplier 的变化**。  
**根因：** `framer.rs` 中的指纹字符串 = `{id}_{name}_{fields.len()}`，字段内容变更不触发 Framer 重建，可能导致解析结果短暂错误。  
**建议修复：** 指纹应包含字段内容的哈希（如 JSON 序列化后的摘要）。

#### P5：冷启动时 `SerialConfigPanel` / `DataViewPanel` 的方案列表有短暂闪烁

**现象：** 重启应用后，直接进入串口配置页面时，底部方案列表会短暂显示"无可用方案"，然后迅速刷新为正常状态。  
**根因：** `ParserStore` 采用懒加载机制，仅在组件首次挂载时触发 `loadConfig()`，存在一个 React 渲染周期的空窗期。  
**已有缓解：** 已在 `SerialConfigPanel` 和 `DataViewPanel` 的 `useEffect` 中添加 `loadConfig()` 兜底调用。  
**完美修复：** 在 `App.tsx` 或 `Layout.tsx` 根组件中预加载 `parser_config`，彻底消除空窗期。

---

### 🟢 低优先级问题

#### P6：字段名冲突无校验

多个方案中可以存在同名字段（如两个方案都有 `temp`），解析结果写入 `latestValues` 时后者覆盖前者，无任何警告。

#### P7：颜色字段持久化路径冗余

`FieldDef.color` 同时存储在：
1. Rust `parser_config.json`（方案级别，随方案持久化）
2. 通过 `updateScheme → pushToEngine` 触发写入

由于 Rust `FieldDef` 现在也包含 `color: Option<String>`，颜色设置会持久化并在重启后恢复，功能正确，无需额外处理。

#### P8：解析结果的历史窗口固定为 2000 个点

`dataBusHistory` 每个字段最多保存 2000 个时间点，当数据更新频率高时可能不够用；过低时会浪费内存。目前无用户可配置的选项。

---

## 7. 未来扩展方向建议

### MQTT 解析支持（P2 修复路径）

在 `MqttConfigPanel.tsx` 添加与 `SerialConfigPanel` 相同的绑定 UI（复制该段代码），更新 `useSessionConnection.ts` 中的 MQTT 连接逻辑传递 `parserSchemeIds`，并在 Rust 的 MQTT 消息处理函数中添加 Framer + Decoder 调用链。

### 串口排他绑定（P1 修复路径）

在 `ParserSidebar` 的"运行中"标签和 `SerialConfigPanel` 的方案按钮中加入互斥提示，当方案已被其他 Session 绑定时显示占用信息和警告 tooltip。

### 多字段同名合并策略

增加字段合并策略配置（如：取最新值、取平均值、区分命名空间），避免跨方案同名字段互相覆盖。

### 数据解析结果导出

利用 `dataBusHistory` 中已有的历史数据，添加 CSV/JSON 导出功能。

### 自定义帧切割策略

目前仅支持"帧头+固定帧长"的切帧模式，未来可考虑支持：分隔符模式、长度字段内嵌模式（帧头 + 长度字节 + 数据）等。
