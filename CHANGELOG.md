# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-02-16
### Added
- 串口接收区数据统计增加筛选功能
- 修改mqtt监视器内容显示为聊天样式

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

### Removed
- 取消设置中的check update功能
- 移除串口接收区option菜单中的display filter功能