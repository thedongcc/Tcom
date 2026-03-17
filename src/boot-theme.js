/**
 * boot-theme.js
 * 启动主题预加载脚本 — 从 localStorage 读取主题颜色，
 * 注入到 :root CSS 变量以避免 loading 界面颜色闪烁。
 *
 * 从 index.html 的内联 <script> 外部化，以消除 CSP 中的 unsafe-inline。
 */
(function () {
    try {
        var settings = JSON.parse(localStorage.getItem('tcom-settings') || '{}');
        var themeId = settings.theme || 'dark';
        // 根据主题模式设置 loading 骨架颜色
        var isDark = themeId !== 'light';
        var bg = isDark ? '#1e1e1e' : '#ffffff';
        var titlebarBg = isDark ? '#3c3c3c' : '#dddddd';
        var textColor = isDark ? '#cccccc' : '#616161';
        var spinnerBorder = isDark ? '#3c3c3c' : '#e0e0e0';
        // 注入关键颜色变量到 :root
        var root = document.documentElement;
        root.style.setProperty('--loading-bg', bg);
        root.style.setProperty('--loading-titlebar', titlebarBg);
        root.style.setProperty('--loading-text', textColor);
        root.style.setProperty('--loading-spinner-track', spinnerBorder);
        // 更新背景色
        document.documentElement.style.backgroundColor = bg;
    } catch (e) { }
})();
