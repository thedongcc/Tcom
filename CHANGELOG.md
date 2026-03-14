# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-03-14
### Added
- 下拉列表组件增加自动滚动定位功能并优化了悬浮交互高亮效果
- 新增串口监视区显示命令名称功能,如果发送的是命令菜单中的命令,则会在发送的命令右侧显示命令名称
- 每个组件都添加独立的颜色值变量
- 增加主题颜色编辑器开关和窗口
- 增加接收分包设置
- 增加接收区特殊字符可视化

### Fixed
- 修复工作区加载问题
- 修复加载动画问题
- 修复监视区超时时间失效问题
- 优化全局悬停显示样式
- 修改flag token为custom占位符
- 优化定时器方案,现在定时发送间隔时间非常准确
- 优化项目架构,增加项目规范文档
- 优化更新逻辑,现在启动时不再自动检查更新了，改为每30分钟自动静默检查
- 优化组件颜色变量独立解耦

### Removed
- 