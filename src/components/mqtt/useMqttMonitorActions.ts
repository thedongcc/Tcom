/**
 * useMqttMonitorActions.ts
 * MQTT 监视器操作函数集合。
 * 从 MqttMonitor.tsx 中拆分出来。
 */
import { useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { useI18n } from '../../context/I18nContext';
import { LogEntry } from '../../types/session';

interface UseMqttMonitorActionsParams {
    isConnected: boolean;
    topic: string;
    payload: string;
    publishFormat: 'text' | 'hex' | 'json' | 'base64';
    qos: 0 | 1 | 2;
    retain: boolean;
    logs: LogEntry[];
    viewMode: 'text' | 'hex' | 'json' | 'base64';
    formatData: (data: string | Uint8Array, mode: 'text' | 'hex' | 'json' | 'base64') => string;
    onPublish: (topic: string, payload: string | Uint8Array, qos: 0 | 1 | 2, retain: boolean) => void;
    onShowSettings?: (view: string) => void;
    onConnectRequest?: () => Promise<boolean>;
}

export const useMqttMonitorActions = ({
    isConnected, topic, payload, publishFormat, qos, retain,
    logs, viewMode, formatData,
    onPublish, onShowSettings, onConnectRequest,
}: UseMqttMonitorActionsParams) => {
    const { showToast } = useToast();
    const { config: themeConfig } = useSettings();
    const { t } = useI18n();

    // 发送消息
    const handleSend = useCallback(async () => {
        if (!isConnected && onConnectRequest) {
            const success = await onConnectRequest();
            if (!success) {
                onShowSettings?.('connection');
                return;
            }
        }
        if (!topic) {
            showToast(t('toast.topicRequired'), 'error');
            return;
        }
        let data: string | Uint8Array = payload;
        if (publishFormat === 'hex') {
            const cleanHex = payload.replace(/\s+/g, '');
            if (cleanHex.length % 2 !== 0) {
                showToast(t('toast.invalidHex'), 'error');
                return;
            }
            data = new Uint8Array(cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        } else if (publishFormat === 'base64') {
            try {
                const binaryStr = atob(payload.trim());
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                data = bytes;
            } catch {
                showToast('Invalid Base64', 'error');
                return;
            }
        }
        onPublish(topic, data, qos, retain);
    }, [isConnected, topic, payload, publishFormat, qos, retain, onPublish, onShowSettings, onConnectRequest, showToast, t]);

    // 保存日志到文件
    const handleSaveLogs = useCallback(() => {
        const content = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            return `[${timestamp}][${log.type}] ${log.topic ? `[${log.topic}] ` : ''}${formatData(log.data, viewMode)}`;
        }).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mqtt_log_${Date.now()}.txt`;
        a.click();
    }, [logs, viewMode, formatData]);

    // 格式化时间戳
    const formatTimestamp = useCallback((ts: number) => {
        const date = new Date(ts);
        const fmt = themeConfig.timestampFormat || 'HH:mm:ss.SSS';
        const pad = (n: number, w: number = 2) => n.toString().padStart(w, '0');
        return fmt
            .replace('HH', pad(date.getHours()))
            .replace('mm', pad(date.getMinutes()))
            .replace('ss', pad(date.getSeconds()))
            .replace('SSS', pad(date.getMilliseconds(), 3));
    }, [themeConfig.timestampFormat]);

    // 数据长度文本
    const getDataLengthText = useCallback((data: string | Uint8Array) => {
        const length = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
        return `${length}B`;
    }, []);

    return { handleSend, handleSaveLogs, formatTimestamp, getDataLengthText };
};
