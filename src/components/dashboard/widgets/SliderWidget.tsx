import React, { useState, useEffect } from 'react';
import { useDataBusStore } from '../../../store/useDataBusStore';

interface SliderWidgetProps {
    bindKey: string;
    sessionId: string;
    title?: string;
    min?: number;
    max?: number;
    step?: number;
}

export const SliderWidget: React.FC<SliderWidgetProps> = ({
    bindKey,
    sessionId,
    title,
    min = 0,
    max = 100,
    step = 1
}) => {
    const storeValue = useDataBusStore(s => {
        const sv = s.sessionsData[sessionId]?.schemeValues;
        if (!sv) return 0;
        for (const scheme of Object.values(sv)) {
            if (bindKey in scheme) return scheme[bindKey];
        }
        return 0;
    });
    const publishValue = useDataBusStore(s => s.publishValue);
    
    // 本地拖拽状态，只有没在拖拽时才接受 store 传来的远程更新
    const [localValue, setLocalValue] = useState(storeValue);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (!isDragging) {
            setLocalValue(storeValue);
        }
    }, [storeValue, isDragging]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(parseFloat(e.target.value));
    };

    const handleCommit = () => {
        // 完成拖拽或回车，正式发送到总线
        setIsDragging(false);
        publishValue(sessionId, bindKey, localValue);
    };

    return (
        <div className="w-full h-full p-4 flex flex-col justify-center items-center bg-black/10">
            <div className="w-full max-w-[200px] flex flex-col gap-3">
                <div className="flex justify-between items-baseline px-1">
                    <span className="text-[11px] font-medium text-gray-400">
                        {title || bindKey}
                    </span>
                    <span className="text-sm font-bold font-mono text-cyan-400">
                        {localValue}
                    </span>
                </div>
                
                <input 
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={localValue}
                    onMouseDown={() => setIsDragging(true)}
                    onTouchStart={() => setIsDragging(true)}
                    onChange={handleChange}
                    onMouseUp={handleCommit}
                    onTouchEnd={handleCommit}
                    // className 可以结合 global styles 继续优化，这里用原生即可，现代浏览器自有阴影
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    style={{
                        accentColor: '#22d3ee'
                    }}
                />
                
                <div className="flex justify-between text-[9px] text-gray-600 px-1 font-mono">
                    <span>{min}</span>
                    <span>{max}</span>
                </div>
            </div>
        </div>
    );
};
