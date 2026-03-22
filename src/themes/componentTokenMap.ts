export interface ComponentThemeMeta {
  label: string;
  tokens: Array<{
    var: string; // CSS 变量名
    label: string; // 易读中文描述
  }>;
}

/**
 * 组件-Token 映射表
 * 我们已剔除大量自动生成的无用变量名，将依然在真实代码中引用的 token 进行科学分类。
 */
export const componentTokenMap: Record<string, ComponentThemeMeta> = {
  // ====================================================
  // === System Semantic Colors (全局生效) ===
  // ====================================================
  'sys-colors': {
    label: "✨ 系统级核心语义色",
    tokens: [
      // 背景语义
      { var: "--sys-bg-base", label: "基础底色（最暗，内容区/编辑器）" },
      { var: "--sys-bg-surface", label: "表面底色（侧栏/面板/状态栏）" },
      { var: "--sys-bg-elevated", label: "抬升底色（标题栏/活动栏）" },
      { var: "--sys-bg-overlay", label: "悬浮层底色（弹窗/菜单/对话框）" },
      { var: "--sys-bg-hover", label: "全局悬浮态背景" },
      { var: "--sys-bg-active", label: "全局激活态背景" },
      // 文本语义
      { var: "--sys-text-primary", label: "主要文本色" },
      { var: "--sys-text-secondary", label: "次要文本色" },
      { var: "--sys-text-muted", label: "弱化文本色" },
      { var: "--sys-text-inverse", label: "反色文本（用于亮色按钮上）" },
      // 边框语义
      { var: "--sys-border-base", label: "全局基础边框色" },
      { var: "--sys-border-divider", label: "全局分隔线色" },
      // 品牌色
      { var: "--sys-color-primary", label: "全局强调色/品牌色" },
      { var: "--accent-color", label: "强调色（选中/指示器）" },
      { var: "--focus-border-color", label: "焦点边框色" },
      // 顶层布局兼容色
      { var: "--app-background", label: "应用全局背景" },
      { var: "--app-foreground", label: "应用全局前景" },
      { var: "--editor-background", label: "编辑器/内容区背景" },
      { var: "--sidebar-background", label: "侧边栏背景" },
      { var: "--activitybar-background", label: "活动栏背景" },
      { var: "--statusbar-background", label: "状态栏背景" },
      { var: "--titlebar-background", label: "标题栏背景" },
      { var: "--panel-background", label: "面板背景" },
      { var: "--widget-background", label: "小部件背景" },
      // 全局交互色
      { var: "--border-color", label: "全局边框色" },
      { var: "--widget-border-color", label: "小部件边框色" },
      { var: "--hover-background", label: "悬浮背景色" },
      { var: "--selection-background", label: "选区背景色" },
    ],
  },
  // ====================================================
  // === Layout Components ===
  // ====================================================
  titlebar: {
    label: "顶部标题栏 (TitleBar)",
    tokens: [
      { var: "--titlebar-background", label: "背景色" },
      { var: "--st-titlebar-text", label: "文本颜色" },
      { var: "--st-titlebar-icon", label: "图标颜色" },
      { var: "--st-titlebar-icon-hover", label: "图标悬停颜色" },
    ],
  },
  activitybar: {
    label: "左侧活动栏 (ActivityBar)",
    tokens: [
      { var: "--activitybar-background", label: "背景色" },
      { var: "--activitybar-inactive-foreground", label: "非激活图标颜色" },
      { var: "--st-activitybar-icon-hover", label: "图标悬停颜色" },
      { var: "--st-activitybar-icon-active", label: "活动图标颜色" },
      { var: "--activitybar-active-border", label: "活动项高亮边框" },
      { var: "--st-activitybar-menu-text", label: "菜单文本颜色" },
    ],
  },
  sidebar: {
    label: "侧边栏容器 (SideBar)",
    tokens: [
      { var: "--sidebar-background", label: "背景色" },
      { var: "--st-sidebar-title-text", label: "标题文本颜色" },
      { var: "--st-sidebar-text", label: "普通文本颜色" },
      { var: "--st-sidebar-muted-text", label: "弱化文本颜色" },
      { var: "--st-sidebar-action-hover", label: "操作按钮悬停颜色" },
      { var: "--st-sidebar-panel-bg", label: "子面板背景色" },
    ],
  },
  statusbar: {
    label: "底部状态栏 (StatusBar)",
    tokens: [
      { var: "--statusbar-background", label: "背景色" },
      { var: "--statusbar-debugging-background", label: "调试模式背景色" },
      { var: "--st-statusbar-text", label: "文本颜色" },
      { var: "--st-statusbar-divider", label: "分隔线颜色" },
      { var: "--st-statusbar-btn-bg", label: "按钮及版本区背景" },
      { var: "--st-statusbar-btn-hover", label: "按钮悬停背景" },
      { var: "--st-statusbar-success-text", label: "更新就绪强调字" },
      { var: "--st-statusbar-icon", label: "常态图标色" },
    ],
  },
  "editor-area": {
    label: "编辑器主区域 (EditorArea)",
    tokens: [
      { var: "--editor-area-bg", label: "主区域容器背景" },
      { var: "--editor-area-tabs-bg", label: "标签栏外层背景" },
      { var: "--st-menu-bg", label: "菜单底色" },
    ],
  },
  "editor-tabs": {
    label: "编辑器标签页 (EditorTabs)",
    tokens: [
      { var: "--st-editor-tabs-bg", label: "标签栏容器背景" },
      { var: "--st-tab-active-bg", label: "选中标签背景" },
      { var: "--st-tab-inactive-bg", label: "未选中标签背景" },
      { var: "--st-tab-active-text", label: "选中标签文字" },
      { var: "--st-tab-inactive-text", label: "未选中标签文字" },
      { var: "--st-tab-border", label: "标签右侧分隔线" },
    ],
  },

  // ====================================================
  // === 会话列表 ===
  // ====================================================
  "session-list-sidebar": {
    label: "会话列表侧边栏",
    tokens: [
      { var: "--session-list-sidebar-bg", label: "侧边栏背景色" },
      { var: "--session-list-sidebar-text", label: "普通文本颜色" },
      { var: "--session-list-sidebar-muted", label: "弱化文本颜色" },
      { var: "--session-list-sidebar-border", label: "分隔线颜色" },
      { var: "--session-list-sidebar-header-bg", label: "标题区背景色" },
    ],
  },
  "session-list-item": {
    label: "会话列表项卡片",
    tokens: [
      { var: "--st-list-item-bg", label: "项默认背景" },
      { var: "--session-item-hover-bg", label: "悬停背景" },
      { var: "--session-item-active-bg", label: "选中背景" },
      { var: "--session-item-active-border", label: "选中左侧边框" },
      { var: "--session-item-foreground", label: "文本颜色" },
    ],
  },

  // ====================================================
  // === 监视器 (Serial / MQTT / Terminal) ===
  // ====================================================
  "serial-monitor": {
    label: "串口监视器主区域",
    tokens: [
      { var: "--st-monitor-rx-bg", label: "数据接收区底图背景色" },
      { var: "--st-monitor-log-bg", label: "监视器日志层背景" },
      { var: "--st-toolbar-bg", label: "顶部工具栏背景色" },
      { var: "--st-monitor-toolbar-border", label: "工具栏边框" },
      { var: "--st-monitor-toolbar-foreground", label: "工具栏文本" },

      // 各种过滤/视图/设置按钮
      { var: "--st-serial-filter-group-bg", label: "过滤按钮组背景" },
      { var: "--st-serial-filter-group-border", label: "过滤按钮组边框" },
      { var: "--st-serial-filter-group-divider", label: "过滤按钮组隔离线" },
      { var: "--st-serial-btn-filter-tx-bg", label: "过滤TX按钮常态背景" },
      {
        var: "--st-serial-btn-filter-tx-active-bg",
        label: "过滤TX按钮激活态背景",
      },
      { var: "--st-serial-btn-filter-tx-text", label: "过滤TX按钮文本" },
      {
        var: "--st-serial-btn-filter-tx-active-text",
        label: "过滤TX按钮激活文本",
      },
      { var: "--st-serial-btn-filter-rx-bg", label: "过滤RX按钮常态背景" },
      {
        var: "--st-serial-btn-filter-rx-active-bg",
        label: "过滤RX按钮激活态背景",
      },
      { var: "--st-serial-btn-filter-rx-text", label: "过滤RX按钮文本" },
      {
        var: "--st-serial-btn-filter-rx-active-text",
        label: "过滤RX按钮激活文本",
      },

      { var: "--st-serial-view-group-bg", label: "视图按钮组背景" },
      { var: "--st-serial-view-group-border", label: "视图按钮组边框" },
      { var: "--st-serial-btn-view-bg", label: "视图按钮常态背景" },
      { var: "--st-serial-btn-view-active-bg", label: "视图按钮激活态背景" },
      { var: "--st-serial-btn-view-text", label: "视图按钮文本" },
      { var: "--st-serial-btn-view-active-text", label: "视图按钮激活文本" },

      { var: "--st-serial-btn-options-bg", label: "选项菜单按钮背景" },
      { var: "--st-serial-btn-options-hover-bg", label: "选项菜单按钮悬停" },
      { var: "--st-serial-btn-options-text", label: "选项菜单按钮文本" },
      { var: "--st-serial-btn-autoscroll-bg", label: "自动滚动按钮背景" },
      {
        var: "--st-serial-btn-autoscroll-active-bg",
        label: "自动滚动按钮激活背景",
      },

      { var: "--st-serial-btn-clear-bg", label: "清屏按钮背景" },
    ],
  },
  "mqtt-monitor": {
    label: "MQTT监视器主区域",
    tokens: [
      { var: "--st-mqtt-monitor-bg", label: "接收区背景色" },
      { var: "--st-toolbar-bg", label: "顶部工具栏背景色" },
      { var: "--st-mqtt-toolbar-border", label: "工具栏边框" },

      { var: "--st-mqtt-filter-group-bg", label: "过滤按钮组背景" },
      { var: "--st-mqtt-filter-group-border", label: "过滤按钮组边框" },
      { var: "--st-mqtt-filter-group-divider", label: "过滤按钮组隔离线" },
      { var: "--st-mqtt-btn-filter-tx-bg", label: "过滤TX通常背景" },
      { var: "--st-mqtt-btn-filter-tx-active-bg", label: "过滤TX激活态背景" },
      { var: "--st-mqtt-btn-filter-tx-text", label: "过滤TX通常文本" },
      { var: "--st-mqtt-btn-filter-rx-bg", label: "过滤RX通常背景" },
      { var: "--st-mqtt-btn-filter-rx-active-bg", label: "过滤RX激活态背景" },
      { var: "--st-mqtt-btn-filter-rx-text", label: "过滤RX通常文本" },

      { var: "--st-mqtt-view-group-bg", label: "视图按钮组背景" },
      { var: "--st-mqtt-view-group-border", label: "视图按钮组边框" },
      { var: "--st-mqtt-btn-view-bg", label: "视图按钮通常背景" },
      { var: "--st-mqtt-btn-view-active-bg", label: "视图按钮激活态背景" },

      { var: "--st-mqtt-btn-options-bg", label: "选项菜单按钮背景" },
      { var: "--st-mqtt-btn-options-text", label: "选项菜单按钮文字" },
      { var: "--st-mqtt-btn-autoscroll-bg", label: "自动滚动按钮背景" },
      { var: "--st-mqtt-btn-clear-bg", label: "清空日志按钮" },

      { var: "--st-mqtt-topic-selected-text", label: "下拉Topic选中文字" },
      { var: "--st-mqtt-topic-default-tx-color", label: "默认发信主题色" },
      { var: "--st-mqtt-topic-default-rx-color", label: "默认收信主题色" },
    ],
  },
  "monitor-terminal": {
    label: "虚拟终端控件",
    tokens: [
      { var: "--monitor-terminal-bg", label: "主背景色" },
      { var: "--monitor-terminal-toolbar-bg", label: "工具栏背景色" },
      { var: "--monitor-terminal-toolbar-border", label: "工具栏边框色" },
      { var: "--monitor-terminal-toolbar-text", label: "工具栏文本色" },
    ],
  },
  "serial-input": {
    label: "内容发送区域 (SendArea)",
    tokens: [
      { var: "--st-sendarea-bg", label: "发送区框体背景" },
      { var: "--input-background", label: "输入框背景色" },
      { var: "--input-foreground", label: "输入框文本色" },
      { var: "--input-border-color", label: "输入框边框" },
      { var: "--input-focus-border-color", label: "输入框聚焦边框" },
      { var: "--st-btn-switch-active-bg", label: "模式切换按钮激活态" },
      { var: "--st-btn-send-bg", label: "发送按钮强调色" },
      { var: "--st-sendarea-toolbar-bg", label: "防抖工具栏外壳底色" },
      { var: "--st-sendarea-toolbar-border", label: "防抖工具栏边线" },
      { var: "--st-sendarea-toolbar-active", label: "快捷按键激活态" },
    ],
  },
  "monitor-bubble": {
    label: "监视器通讯气泡 (Bubble/LogItem)",
    tokens: [
      { var: "--st-msg-bubble-border", label: "气泡基础边框色" },
      { var: "--st-rx-bg", label: "RX 气泡背景色 (备用)" },
      { var: "--st-tx-bg", label: "TX 气泡背景色 (备用)" },
      { var: "--st-rx-text", label: "RX 气泡内部文本" },
      { var: "--st-tx-text", label: "TX 气泡内部文本" },
      { var: "--st-error-text", label: "错误气泡文本" },
      { var: "--st-info-text", label: "常规信息文本" },

      { var: "--monitor-rx-label-bg", label: "RX 徽标背景" },
      { var: "--monitor-rx-label-border", label: "RX 徽标边框" },
      { var: "--monitor-tx-label-bg", label: "TX 徽标背景" },
      { var: "--monitor-tx-label-border", label: "TX 徽标边框" },

      { var: "--st-monitor-timestamp", label: "时间戳颜色" },
      { var: "--st-monitor-tag-bg", label: "附加标签背景" },
      { var: "--st-monitor-tag-text", label: "附加标签文本" },
      { var: "--st-monitor-tag-border", label: "附加标签边框" },

      { var: "--st-ctrl-char-fg", label: "控制字符标记文字" },
      { var: "--st-ctrl-char-bg", label: "控制字符标记背景" },
      { var: "--st-ctrl-char-border", label: "控制字符标记边框" },

      { var: "--st-tcom-v-bg", label: "Tcom 向虚拟口送信背景" },
      { var: "--st-tcom-v-border", label: "Tcom 向虚拟口送信边线" },
      { var: "--st-tcom-v-text", label: "Tcom 向虚拟口送信徽标文字" },
      { var: "--st-tcom-v-msg-text", label: "Tcom 向虚拟口送信正文文字" },

      { var: "--st-tcom-p-bg", label: "Tcom 向物理口送信背景" },
      { var: "--st-tcom-p-border", label: "Tcom 向物理口送信边线" },
      { var: "--st-tcom-p-text", label: "Tcom 向物理口送信徽标文字" },
      { var: "--st-tcom-p-msg-text", label: "Tcom 向物理口送信正文文字" },
    ],
  },

  // ====================================================
  // === 系统消息节点 ===
  // ====================================================
  "system-message": {
    label: "系统连接信息气泡 (SysMsg)",
    tokens: [
      { var: "--sys-msg-default-text", label: "通用状态文字" },
      { var: "--sys-msg-default-border", label: "通用状态边框" },
      { var: "--sys-msg-default-bg", label: "通用状态背景" },
      { var: "--sys-msg-connected-text", label: "成功/连通类文字" },
      { var: "--sys-msg-connected-border", label: "成功/连通类边框" },
      { var: "--sys-msg-connected-bg", label: "成功/连通类背景" },
      { var: "--sys-msg-error-text", label: "错误/失败类文字" },
      { var: "--sys-msg-error-border", label: "错误/失败类边框" },
      { var: "--sys-msg-error-bg", label: "错误/失败类背景" },
      { var: "--sys-msg-bridge-text", label: "内部桥接文字" },
      { var: "--sys-msg-bridge-border", label: "内部桥接边框" },
      { var: "--sys-msg-bridge-bg", label: "内部桥接背景" },
      { var: "--sys-msg-device-text", label: "物理设备文字" },
      { var: "--sys-msg-device-border", label: "物理设备边框" },
      { var: "--sys-msg-device-bg", label: "物理设备背景" },
    ],
  },

  // ====================================================
  // === 各类专属设置侧栏 ===
  // ====================================================
  "serial-config": {
    label: "串口偏好配置面板",
    tokens: [
      { var: "--serial-config-bg", label: "面板背景色" },
      { var: "--serial-config-text", label: "主要配置文本色" },
      { var: "--serial-config-label", label: "表单项标签色" },
    ],
  },
  "mqtt-config": {
    label: "MQTT 偏好配置面板",
    tokens: [
      { var: "--mqtt-config-bg", label: "面板背景色" },
      { var: "--mqtt-config-text", label: "主要文本颜色" },
      { var: "--mqtt-config-input-bg", label: "输入框背景色" },
      { var: "--mqtt-config-input-text", label: "输入框文字颜色" },
      { var: "--st-config-success-bg", label: "就绪/成功标记色" },
    ],
  },
  "command-sidebar": {
    label: "指令集管理器",
    tokens: [
      { var: "--command-sidebar-bg", label: "侧边栏背景色" },
      { var: "--command-sidebar-text", label: "普通文本颜色" },
      { var: "--command-sidebar-border", label: "分隔线颜色" },
      { var: "--st-command-empty-text", label: "空态提示文本色" },
      { var: "--st-command-drop-indicator", label: "拖拽目标指示线色" },
    ],
  },
  "module-manager-sidebar": {
    label: "模块管理器侧栏",
    tokens: [
      { var: "--module-manager-bg", label: "背景色" },
      { var: "--module-manager-text", label: "文本颜色" },
      { var: "--module-manager-border", label: "分隔线颜色" },
      { var: "--module-manager-item-hover", label: "悬停项背景" },
    ],
  },
  "settings-editor": {
    label: "全局设置中心",
    tokens: [
      { var: "--settings-editor-bg", label: "编辑器背景空间" },
      { var: "--settings-header-background", label: "顶部导航区域背景" },
      { var: "--st-settings-title-text", label: "各类大标题文本" },
      { var: "--st-settings-text", label: "设置项目文本" },
      { var: "--st-settings-danger-title", label: "危险操作区标题" },
      { var: "--st-settings-danger-text", label: "危险操作区文字" },
      { var: "--st-settings-danger-bg", label: "危险操作项目背景" },
    ],
  },
  "graph-editor": {
    label: "桥接流图编辑器",
    tokens: [
      { var: "--st-graph-canvas-bg", label: "无限画布底色" },
      { var: "--st-graph-toolbar-bg", label: "工具控制栏背景" },
      { var: "--st-graph-node-title", label: "普通节点卡片标题" },
      { var: "--st-graph-subnode-bg", label: "子节点块内部背景" },
      { var: "--st-graph-subnode-border", label: "子节点块边框" },
      { var: "--st-graph-port-border", label: "端口连接点边框" },
      { var: "--st-graph-port-hover-bg", label: "端口连接点悬停底" },
    ],
  },

  // ====================================================
  // === Globals (全局基址与公共小件) ===
  // ====================================================
  "global-common": {
    label: "全局色(极少直接使用)",
    tokens: [
      { var: "--app-background", label: "全局应用背景" },
      { var: "--app-foreground", label: "全局主要文本" },
      { var: "--border-color", label: "通用一级边框" },
      { var: "--widget-border-color", label: "通用二级/控件内边框" },
      { var: "--accent-color", label: "全站基础级强调色" },
      { var: "--focus-border-color", label: "操作焦点高亮边框" },
      { var: "--hover-background", label: "基础悬停半透明底" },
      { var: "--selection-background", label: "文本选区高亮色" },
      { var: "--panel-background", label: "内嵌面板公共底" },
      { var: "--widget-background", label: "组件群公共底" },
    ],
  },
  "global-components": {
    label: "表单控件基座",
    tokens: [
      { var: "--input-background", label: "文本框底色" },
      { var: "--input-foreground", label: "文本框输入字号" },
      { var: "--input-border-color", label: "文本框常态边框" },
      { var: "--input-placeholder-color", label: "提示占位语颜色" },
      { var: "--checkbox-background", label: "多选框基底" },
      { var: "--checkbox-foreground", label: "多选勾形符号" },
      { var: "--st-dropdown-bg", label: "级联下拉容器底" },
      { var: "--st-btn-primary-bg", label: "主要实体按钮底色" },
      { var: "--st-btn-secondary-bg", label: "次级按钮底色" },
      { var: "--switch-active-bg", label: "开关打开段强调色" },
    ],
  },
  "custom-select": {
    label: "选项板 (CustomSelect)",
    tokens: [
      { var: "--st-select-bg", label: "列表框背景" },
      { var: "--st-select-border", label: "列表边框" },
      { var: "--st-select-text", label: "常规文字" },
      { var: "--st-select-hover", label: "滑过时热点" },
      { var: "--st-select-selected", label: "已选中强调" },
    ]
  },
  "log-search": {
    label: "内置查询 (LogSearch)",
    tokens: [
      { var: "--st-logsearch-bg", label: "主搜索条背景" },
      { var: "--st-logsearch-border", label: "外围包围边框" },
      { var: "--st-logsearch-text", label: "查询字迹色" },
      { var: "--st-logsearch-match-highlight", label: "关键字搜索高亮" },
    ]
  },
  "global-scrollbar": {
    label: "全局滚动条样式",
    tokens: [
      { var: "--scrollbar-shadow-color", label: "滚动槽投影" },
      { var: "--scrollbar-slider-color", label: "游标基础色" },
      { var: "--scrollbar-slider-hover-color", label: "游标热点状态色" },
      { var: "--scrollbar-slider-active-color", label: "游标拖拽按下色" },
    ],
  },
  "context-menu": {
    label: "上下文/右键菜单",
    tokens: [
      { var: "--context-menu-bg", label: "菜单底层材质" },
      { var: "--context-menu-border", label: "菜单硬边框" },
      { var: "--context-menu-text", label: "常规选项文字" },
      { var: "--context-menu-item-hover", label: "选中划过项目底色" },
    ],
  },
  dialog: {
    label: "弹窗与对话确认框",
    tokens: [
      { var: "--st-dialog-header-bg", label: "头部引导区底色" },
      { var: "--st-dialog-content-bg", label: "对话正文区底色" },
      { var: "--st-dialog-footer-bg", label: "底部裁决区底色" },
      { var: "--st-dialog-text", label: "主体陈列说明字" },
    ],
  },
  tooltip: {
    label: "悬浮小提示卡 (Tooltip)",
    tokens: [
      { var: "--st-tooltip-bg", label: "深色逆反背景" },
      { var: "--st-tooltip-text", label: "内置解读文字" },
      { var: "--st-tooltip-border", label: "尖角及外包围边线" },
    ],
  },
  toast: {
    label: "底部气泡通知 (Toast)",
    tokens: [
      { var: "--st-toast-text", label: "提示讯息文字" },
      { var: "--st-toast-icon-hover", label: "互动图标" },
      { var: "--st-toast-bg", label: "气泡实体背景区" },
      { var: "--st-toast-border", label: "轮廓边框" },
    ],
  },
  "st-status-indicators": {
    label: "状态指示灯",
    tokens: [
      { var: "--st-status-success", label: "成功/在线/就绪状态色" },
      { var: "--st-status-error", label: "错误/离线/占用状态色" },
    ],
  },

  "virtual-port-plugin": {
    label: "虚拟串口插件面板",
    tokens: [
      { var: "--st-vport-alert-bg", label: "警示框背景" },
      { var: "--st-vport-alert-border", label: "警示框边框" },
      { var: "--st-vport-alert-text", label: "警示框文字" },
    ],
  },
  "st-connection-control": {
    label: "监听连接控制区",
    tokens: [
      { var: "--st-conn-start-bg", label: "开始监听按钮背景" },
      { var: "--st-conn-start-hover", label: "开始监听按钮悬停" },
      { var: "--st-conn-stop-bg", label: "停止监听按钮背景" },
      { var: "--st-conn-stop-hover", label: "停止监听按钮悬停" },
      { var: "--st-conn-disabled-bg", label: "禁用状态背景" },
      { var: "--st-conn-disabled-text", label: "禁用状态文字" },
    ],
  },
};
