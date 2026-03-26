import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';

// 提取像素格式并转置 Hex
function toHex(r: number, g: number, b: number) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export default function EyedropperApp() {
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);
    const magnifierRef = useRef<HTMLCanvasElement>(null);
    
    const [snapshotReady, setSnapshotReady] = useState(false);
    // 使用纯逻辑像素记录虚拟光标位置
    const [pos, setPos] = useState({ x: -9999, y: -9999 }); 
    const [currentColor, setCurrentColor] = useState('#000000');
    
    // 挂载后，真正变成一块透明的“玻璃结界”，并请求背景
    useEffect(() => {
        let mounted = true;
        
        // 核心一：强制抹除由全局 style 引入的默认深色背景墙，使该骨架真正完全透明隐形！
        document.documentElement.style.backgroundColor = 'transparent';
        document.body.style.backgroundColor = 'transparent';

        invoke<{ success: boolean; data: any }>('eyedropper_get_cached_snapshot')
            .then(async (res) => {
                if (!mounted) return;
                const { image, width, height } = res.data;
                
                try {
                    // 核心二：千万不要直接将巨大的 Base64 塞给 img.src（会造成主线程崩溃闪退或假死转圈），使用安全高效的 fetch 流式拉取
                    const response = await fetch(image);
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    
                    const img = new Image();
                    img.onload = () => {
                        if (!mounted || !mainCanvasRef.current) return;
                        
                        // Canvas 属性值采用物理像素（跟截图保持 1:1），彻底防抽边模糊
                        mainCanvasRef.current.width = width;
                        mainCanvasRef.current.height = height;
                        
                        const ctx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
                        if (ctx) {
                            ctx.drawImage(img, 0, 0);
                            setSnapshotReady(true);
                            URL.revokeObjectURL(objectUrl);
                            
                            // 第一次加载完毕时虽然没有发生鼠标移动，也需要预载一次中心准星以提示用户可用
                            updateMagnifierAndColor(window.innerWidth / 2, window.innerHeight / 2);
                        }
                    };
                    img.onerror = (e) => {
                        console.error('Image decode failed:', e);
                        getCurrentWindow().close();
                    };
                    img.src = objectUrl;
                } catch (e) {
                    console.error('Failed to convert base64 to blob:', e);
                    getCurrentWindow().close();
                }
            })
            .catch(e => {
                console.error('Failed to get snapshot from rust:', e);
                // 仅在严格验证无法获取图片时终结结界
                getCurrentWindow().close();
            });

        return () => { 
            mounted = false; 
            document.documentElement.style.backgroundColor = '';
            document.body.style.backgroundColor = '';
        };
    }, []);

    // 焦点采样及小屏刷新循环
    const updateMagnifierAndColor = useCallback((lx: number, ly: number) => {
        setPos({ x: lx, y: ly });
        if (!mainCanvasRef.current || !magnifierRef.current) return;
        
        // 映射获取实际硬件 dpi 物理坐标点
        const px = Math.round(lx * window.devicePixelRatio);
        const py = Math.round(ly * window.devicePixelRatio);
        
        const mainCtx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
        const magCtx = magnifierRef.current.getContext('2d');
        if (!mainCtx || !magCtx) return;
        
        // 1. 获取光标中心 1x1 探针色
        // 防越界检测
        if (px < 0 || py < 0 || px >= mainCanvasRef.current.width || py >= mainCanvasRef.current.height) return;
        const pixel = mainCtx.getImageData(px, py, 1, 1).data;
        const hex = toHex(pixel[0], pixel[1], pixel[2]);
        setCurrentColor(hex);
        
        // 极为核心：此时已经完全独立了！把色值实时抛向主题编辑器
        emit('eyedropper:color', hex);
        
        // 2. 绘制 8倍 极客马赛克网格放大镜
        // 源裁切范围：以光标为中心抽取 20x20 (物理像素)
        const SOURCE_SIZE = 20;
        const HALF_SOURCE = SOURCE_SIZE / 2;
        // 目标渲染范围：放大镜固定 160x160 逻辑像素 => CSS 大小 160px
        const MAG_SIZE = 160;
        
        magCtx.imageSmoothingEnabled = false; // 严禁抗锯齿！保持 8-bit 的极客颗粒感
        magCtx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
        magCtx.drawImage(
            mainCanvasRef.current, 
            px - HALF_SOURCE, 
            py - HALF_SOURCE, 
            SOURCE_SIZE, 
            SOURCE_SIZE, 
            0, 
            0, 
            MAG_SIZE, 
            MAG_SIZE
        );
        
        // 3. 画中心单像素瞄准框 (20x20 放满 160，则每格为 8px)
        const boxSize = MAG_SIZE / SOURCE_SIZE; // 8
        const center = MAG_SIZE / 2; // 80
        
        magCtx.strokeStyle = 'rgba(0,0,0,0.6)';
        magCtx.lineWidth = 1;
        // 中心点因为坐标基准计算，起始落位于 80 - 4 = 76
        magCtx.strokeRect(center - (boxSize/2), center - (boxSize/2), boxSize, boxSize);
        magCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        magCtx.strokeRect(center - (boxSize/2) + 1, center - (boxSize/2) + 1, boxSize - 2, boxSize - 2);
    }, []);

    // 监听真实的鼠标运动并映射计算
    useEffect(() => {
        if (!snapshotReady) return;
        const onMouseMove = (e: MouseEvent) => updateMagnifierAndColor(e.clientX, e.clientY);
        window.addEventListener('mousemove', onMouseMove);
        return () => window.removeEventListener('mousemove', onMouseMove);
    }, [snapshotReady, updateMagnifierAndColor]);

    // 【1像素级键盘微调与流程流转】
    useEffect(() => {
        if (!snapshotReady) return;
        const onKeyDown = (e: KeyboardEvent) => {
            let nextX = pos.x;
            let nextY = pos.y;
            
            // 劫持方向键 阻断视口的默认滚动
            if (e.key === 'ArrowUp') nextY -= 1;
            else if (e.key === 'ArrowDown') nextY += 1;
            else if (e.key === 'ArrowLeft') nextX -= 1;
            else if (e.key === 'ArrowRight') nextX += 1;
            else if (e.key === 'Escape') {
                emit('eyedropper:canceled', null);
                getCurrentWindow().close();
                return;
            } else if (e.key === 'Enter') {
                emit('eyedropper:picked', currentColor);
                getCurrentWindow().close();
                return;
            }
            
            if (nextX !== pos.x || nextY !== pos.y) {
                e.preventDefault();
                updateMagnifierAndColor(nextX, nextY);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [snapshotReady, pos, currentColor, updateMagnifierAndColor]);

    // 左键最终确认撷取
    const onClick = () => {
        if (!snapshotReady) return;
        emit('eyedropper:picked', currentColor);
        getCurrentWindow().close();
    };

    return (
        <div 
            className="w-screen h-screen overflow-hidden" 
            style={{ cursor: snapshotReady ? 'none' : 'wait', userSelect: 'none' }}
            onClick={onClick}
            // 防止默认右键菜单
            onContextMenu={e => e.preventDefault()}
        >
            <canvas 
                ref={mainCanvasRef} 
                className="w-full h-full block"
            />
            {snapshotReady && pos.x !== -9999 && (
                <div 
                    className="fixed pointer-events-none z-50 flex flex-col items-center select-none"
                    style={{
                        // 位置悬浮修正，使其位于鼠标右下方 16px 处防止遮挡
                        left: pos.x + 20,
                        top: pos.y + 20,
                    }}
                >
                    <canvas 
                        ref={magnifierRef}
                        width={160}
                        height={160}
                        className="rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_8px_16px_rgba(0,0,0,0.3)] border-2 border-white bg-slate-900"
                    />
                    <div className="mt-2.5 bg-black/80 backdrop-blur-md text-white px-2.5 py-1.5 rounded shadow-lg border border-white/10 flex items-center justify-center">
                        {/* 前缀放一个小色块确认最终的取色盘颜色 */}
                        <div className="w-3.5 h-3.5 rounded-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)] mr-2" style={{ backgroundColor: currentColor }} />
                        <span className="text-xs font-mono font-medium tracking-[0.1em]">{currentColor}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
