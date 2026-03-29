import React from 'react';
import { useDataBusStore } from '../../../store/useDataBusStore';

interface ButtonWidgetProps {
    bindKey: string;
    sessionId: string;
    title?: string;
    actionValue?: number; // 要下发的值，默认为 1
    variant?: 'primary' | 'danger' | 'warning';
}

export const ButtonWidget: React.FC<ButtonWidgetProps> = ({
    bindKey,
    sessionId,
    title,
    actionValue = 1,
    variant = 'primary'
}) => {
    const publishValue = useDataBusStore(s => s.publishValue);
    
    // 如果想要按钮长亮，也可以加上读取 latestValues
    // const currentValue = useDataBusStore(s => s.latestValues[bindKey]);

    const getColors = () => {
        switch (variant) {
            case 'danger': return 'bg-red-500/20 text-red-500 border-red-500/50 hover:bg-red-500 hover:text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]';
            case 'warning': return 'bg-amber-500/20 text-amber-500 border-amber-500/50 hover:bg-amber-500 hover:text-white shadow-[0_0_15px_rgba(245,158,11,0.2)]';
            case 'primary':
            default: return 'bg-sky-500/20 text-sky-400 border-sky-500/50 hover:bg-sky-500 hover:text-white shadow-[0_0_15px_rgba(14,165,233,0.2)]';
        }
    };

    const handleClick = () => {
        publishValue(sessionId, bindKey, actionValue);
    };

    return (
        <div className="w-full h-full flex justify-center items-center p-3">
            <button
                onClick={handleClick}
                className={`w-full max-w-[140px] h-12 rounded-lg border uppercase tracking-wider text-[11px] font-bold transition-all duration-200 active:scale-95 ${getColors()}`}
            >
                {title || `SEND ${bindKey}`}
            </button>
        </div>
    );
};
