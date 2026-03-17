/**
 * splash-window.ts
 * Electron 级别的启动 Splash 窗口 — 在 app ready 后立即创建并显示。
 *
 * 核心特性：
 * - 读取 icon 并转 base64 内联到 HTML，零外部依赖，启动极速
 * - 通过 executeJavaScript 从主进程推送加载进度
 * - 提供 create / updateProgress / close API
 */

import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

let splashWin: BrowserWindow | null = null;

/**
 * 创建并立即显示 Splash 窗口
 */
export function createSplashWindow(appRoot: string, isDev: boolean): BrowserWindow {
    // 读取 icon 转 base64 嵌入，消除外部资源加载延迟
    const iconPath = isDev
        ? path.join(appRoot, 'resources/icons/icon.png')
        : path.join(process.resourcesPath, 'resources/icons/icon.png');

    // ⚡ 先不加载 icon，异步加载后注入，避免同步 I/O 阻塞
    const iconSrc = '';

    splashWin = new BrowserWindow({
        width: 460,
        height: 400,
        frame: false,
        resizable: false,
        center: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#1a1a24',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    const html = buildSplashHTML(iconSrc);
    splashWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // ⚡ 异步加载 icon，不阻塞窗口显示
    fs.promises.readFile(iconPath).then(buf => {
        if (splashWin && !splashWin.isDestroyed()) {
            const src = `data:image/png;base64,${buf.toString('base64')}`;
            splashWin.webContents.executeJavaScript(
                `var img=document.querySelector('.logo');if(img)img.src='${src}';`
            ).catch(() => { /* splash 已关闭 */ });
        }
    }).catch(() => { /* icon 加载失败不影响启动 */ });

    return splashWin;
}

/**
 * 更新 Splash 窗口的加载进度和状态文字
 */
export function updateSplashProgress(percent: number, statusText: string): void {
    if (!splashWin || splashWin.isDestroyed()) return;
    const escaped = statusText.replace(/'/g, "\\'");
    splashWin.webContents.executeJavaScript(
        `if(window.__updateProgress)window.__updateProgress(${percent},'${escaped}');`
    ).catch(() => { /* splash 已关闭，忽略 */ });
}

/**
 * 关闭 Splash 窗口
 */
export function closeSplashWindow(): void {
    if (splashWin && !splashWin.isDestroyed()) {
        splashWin.close();
        splashWin = null;
    }
}

// ─── Splash HTML 模板（全内联，零外部依赖） ──────────────────────────────────────
function buildSplashHTML(iconSrc: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
    background:#1a1a24;
    display:flex;justify-content:center;align-items:center;
    height:100vh;overflow:hidden;
    -webkit-app-region:drag;user-select:none;
}
.card{
    width:380px;padding:48px 40px 36px;border-radius:20px;
    background:linear-gradient(145deg,#252530 0%,#1a1a24 50%,#16161e 100%);
    box-shadow:0 20px 60px rgba(0,0,0,0.5),0 0 40px rgba(120,80,200,0.08);
    display:flex;flex-direction:column;align-items:center;gap:8px;
    position:relative;overflow:hidden;
}
.card::before{
    content:'';position:absolute;top:16px;right:18px;
    width:8px;height:8px;border-radius:50%;
    background:radial-gradient(circle,#c89eff 0%,#a060e0 60%,transparent 100%);
    box-shadow:0 0 12px rgba(200,158,255,0.6);
    animation:pulse 2s ease-in-out infinite;
}
.logo{width:72px;height:72px;border-radius:14px;margin-bottom:8px;
    filter:drop-shadow(0 4px 20px rgba(200,158,255,0.3));}
.title{
    font-family:'Segoe UI','Inter',sans-serif;font-size:36px;font-weight:700;
    letter-spacing:3px;color:#e8e0f0;margin:0;
    text-shadow:0 0 20px rgba(200,158,255,0.3);
}
.tagline{
    font-family:'Segoe UI','Inter',sans-serif;font-size:12px;
    color:#888899;letter-spacing:1px;margin:4px 0 20px;
}
.status{
    font-family:'Segoe UI',monospace;font-size:11px;
    color:#a0a0b0;margin-bottom:8px;min-height:16px;
    transition:opacity 0.15s ease;
}
.track{
    width:100%;height:3px;background:rgba(255,255,255,0.06);
    border-radius:2px;overflow:hidden;
}
.fill{
    height:100%;border-radius:2px;
    background:linear-gradient(90deg,#6c5ce7,#a29bfe,#74b9ff);
    background-size:200% 100%;
    animation:shimmer 2s ease-in-out infinite;
    transition:width 0.4s cubic-bezier(0.4,0,0.2,1);
    width:0%;
}
.copy{font-family:'Segoe UI',sans-serif;font-size:10px;color:#555566;margin-top:12px;}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes pulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
</style></head><body>
<div class="card">
    ${iconSrc ? `<img class="logo" src="${iconSrc}" alt="">` : '<div style="height:72px"></div>'}
    <div class="title">Tcom</div>
    <div class="tagline">Professional Serial Debug Assistant</div>
    <div class="status" id="s">Initializing...</div>
    <div class="track"><div class="fill" id="p"></div></div>
    <div class="copy">&copy; 2026 Thedong. All rights reserved.</div>
</div>
<script>
window.__updateProgress=function(pct,txt){
    var b=document.getElementById('p'),s=document.getElementById('s');
    if(b)b.style.width=pct+'%';
    if(s)s.textContent=txt;
};
</script>
</body></html>`;
}
