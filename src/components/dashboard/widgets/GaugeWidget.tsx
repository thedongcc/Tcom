import React from 'react';
import { useDataBusStore } from '../../../store/useDataBusStore';

interface GaugeWidgetProps {
    bindKey: string;
    sessionId: string;
    min?: number;
    max?: number;
    title?: string;
    unit?: string;
}

export const GaugeWidget: React.FC<GaugeWidgetProps> = ({ 
    bindKey, 
    sessionId,
    min = 0, 
    max = 100,
    unit = ''
}) => {
    // 仪表盘属于低频或中频显示（非图表级高频），使用 Zustand Selector 精准定点重新渲染足矣
    const value = useDataBusStore((state) => state.sessionsData[sessionId]?.latestValues[bindKey] ?? 0);
    
    // 限制范围在 min 和 max 之间
    const clampedValue = Math.min(Math.max(value, min), max);
    
    // 计算旋转角度 (半圆 180 度，从 -90 到 90)
    const percentage = (clampedValue - min) / (max - min);
    const rotation = -90 + percentage * 180;
    
    // SVG 圆弧参数 (半径 40，描边 8)
    const radius = 40;
    const circumference = Math.PI * radius; // 整个半圆的周长
    // 圆弧只展示半圆，所以 offset 的逻辑有些不同。可以直接用基于半圆周长的 strokeDasharray。
    // 但是最简单的方法是转动 pointer
    
    const valueColor = '#38bdf8'; // 亮蓝

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-2">
            <div className="relative w-[120px] h-[70px] flex items-end justify-center overflow-hidden">
                {/* 底部轨道 SVG */}
                <svg className="absolute bottom-0 w-full h-[120px]" viewBox="0 0 100 100">
                    {/* 背景半圆弧 */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="10"
                        strokeLinecap="round"
                    />
                    {/* 发光高亮半圆弧进度 */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={valueColor}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - percentage)}
                        className="transition-all duration-200 ease-out"
                        style={{ filter: `drop-shadow(0 0 4px ${valueColor})` }}
                    />
                </svg>
                
                {/* 旋转指针 */}
                <div 
                    className="absolute bottom-0 w-2 h-[45px] origin-bottom transition-transform duration-200 ease-out"
                    style={{ 
                        transform: `rotate(${rotation}deg) translateZ(0)`,
                        willChange: 'transform' // 触发 GPU 硬件加速
                    }}
                >
                    <div className="w-2 h-[20px] bg-white rounded-t-full shadow-[0_0_8px_rgba(255,255,255,0.8)] mx-auto relative -top-[15px]" />
                </div>
                
                {/* 底部枢纽圆圈 */}
                <div className="absolute -bottom-2 w-6 h-6 bg-[rgba(25,25,30,1)] border-4 border-gray-700 rounded-full z-10 box-border" />
            </div>
            
            {/* 数值显示器 */}
            <div className="mt-3 text-center flex flex-col pt-1">
                <div className="text-xl font-mono font-bold tracking-wider text-white" style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}>
                    {parseFloat(value.toFixed(2))}
                    <span className="text-[10px] text-gray-400 ml-1 font-sans">{unit}</span>
                </div>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">
                    {bindKey}
                </div>
            </div>
        </div>
    );
};
