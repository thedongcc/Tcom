# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-02-17
### Added
- 串口接收区数据统计增加筛选功能
- 修改mqtt监视器内容显示为聊天样式
- 增加串口监视区平滑动画开关
- 增加mqtt监视区平滑动画开关
- 增加标签页持久化特性
- 添加串口监测节点和其标签页
- 增加虚拟串口识别支持
- 增加mqtt订阅消息筛选功能
- 增加侧边栏菜单宽度持久化功能
- 增加侧边栏菜单边缘双击恢复默认宽度功能
- 增加虚拟串口启用状态检测机制
- 添加更多的波特率支持
- 添加自定义波特率支持

### Fixed
- 修复重复发送不被计数问题
- 修复接收区COM口显示异常空格问题
- 修复定时发送每四次后会失效一次的问题
- 修复光标移到软件外会让接收统计文字变暗问题
- 修复光标移到软件外会让标签关闭按钮消失问题
- 修复session名称在有串口和无串口状态下不同的问题
- 解决font family无法显示电脑中全部字体问题
- 解决mqtt订阅问题
- 更改mqtt配置、交互、显示逻辑
- 优化mqtt气泡动画
- 解决串口监视区行内内容像素差异化问题
- 修复标签切换后必须点击工作区才能完全切换的问题
- 修改串口发送按钮的图标和文字
- 完善更新相关逻辑
- 稳定Session管理器
- 改善串口监测标签页中的样式
- 修复流量统计逻辑
- 修复mqtt点击连接过快问题
- 修改部分组件的图标、样式
- 修复重启后激活的session改变的问题
- 优化4种消息样式并写成规范
- 修复侧边栏图标位移问题
- 优化options菜单中的组件样式
- 修改全部下拉框和其弹出菜单的样式
- 修改全部switch开关的样式

### Removed
- 取消设置中的check update功能
- 移除串口接收区option菜单中的display filter功能
- 取消标签栏中的加号