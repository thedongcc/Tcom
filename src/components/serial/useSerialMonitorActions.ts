/**
 * useSerialMonitorActions.ts
 * 串口监视器操作函数集合。
 * 从 SerialMonitor.tsx 中拆分出来，降低主组件复杂度。
 */
import { useCallback } from 'react';
import { SessionConfig, LogEntry } from '../../types/session';
import { CRCConfig } from '../../utils/crc';
import { useToast } from '../../context/ToastContext';
import { useCommandContext } from '../../context/CommandContext';
import { generateUniqueName } from '../../utils/commandUtils';
import { useI18n } from '../../context/I18nContext';
import { CommandItem } from '../../types/command';

interface UseSerialMonitorActionsOptions {
    onSend?: (data: string | Uint8Array) => void;
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void;
    onClearLogs?: () => void;
    config: SessionConfig;
    logs: LogEntry[];
    viewMode: 'text' | 'hex' | 'both';
    encoding: string;
    formatData: (data: string | Uint8Array, mode: 'text' | 'hex' | 'both', enc: string) => string;
}

export function useSerialMonitorActions({
    onSend,
    onUpdateConfig,
    onClearLogs,
    config,
    logs,
    viewMode,
    encoding,
    formatData,
}: UseSerialMonitorActionsOptions) {
    const { showToast } = useToast();
    const { t } = useI18n();
    const { addCommand, commands } = useCommandContext();

    // CRC 相关状态（rxCRC 是唯一的 CRC 配置，crcTarget 控制校验哪个方向的数据）
    const crcEnabled = ((config as unknown as Record<string, unknown>).rxCRC as CRCConfig)?.enabled || false;
    const rxCRC = ((config as unknown as Record<string, unknown>).rxCRC as CRCConfig) || { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };

    // ── 操作函数 ──

    const handleClearLogs = useCallback(() => {
        if (onClearLogs) onClearLogs();
    }, [onClearLogs]);

    const handleSaveLogs = useCallback(() => {
        const content = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const data = formatData(log.data, viewMode, encoding);
            return `[${timestamp}][${log.type}] ${data} `;
        }).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial_log_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }, [logs, viewMode, encoding, formatData]);

    const getDataLengthText = useCallback((data: string | Uint8Array) => {
        let length = 0;
        if (typeof data === 'string') {
            length = new TextEncoder().encode(data).length;
        } else {
            length = data.length;
        }
        return `${length}B`;
    }, []);

    const handleSend = useCallback((data: string | Uint8Array, mode: 'text' | 'hex') => {
        if (!onSend) return;

        if (data instanceof Uint8Array) {
            onSend(data);
            return;
        }

        const textData = data as string;

        if (mode === 'hex') {
            const cleanHex = textData.replace(/\s+/g, '');
            if (cleanHex.length % 2 !== 0) {
                console.warn("Invalid hex length");
                return;
            }
            const byteArray = new Uint8Array(cleanHex.length / 2);
            for (let i = 0; i < cleanHex.length; i += 2) {
                byteArray[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
            }
            onSend(byteArray);
        } else {
            onSend(textData);
        }
    }, [onSend]);

    const toggleCRC = useCallback(() => {
        if (!onUpdateConfig) return;
        // rxCRC 是监视区 CRC 校验的总开关；同时确保 txCRC (自动追加功能) 不被误启用
        onUpdateConfig({
            rxCRC: { ...rxCRC, enabled: !crcEnabled },
            txCRC: { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 },
        } as Partial<SessionConfig>);
    }, [onUpdateConfig, rxCRC, crcEnabled]);

    const updateRxCRC = useCallback((updates: Partial<CRCConfig>) => {
        if (!onUpdateConfig) return;
        onUpdateConfig({ rxCRC: { ...rxCRC, ...updates } } as Partial<SessionConfig>);
    }, [onUpdateConfig, rxCRC]);

    const handleCopyLog = useCallback((log: LogEntry | null) => {
        if (!log) return;
        const text = formatData(log.data, viewMode, encoding);
        navigator.clipboard.writeText(text);
        showToast(t('toast.copied'), 'success', 1500);
    }, [formatData, viewMode, encoding, showToast, t]);

    const handleAddToCommand = useCallback((log: LogEntry | null): Record<string, unknown> | null => {
        if (!log) return null;
        const payload = formatData(log.data, viewMode, encoding);
        return {
            name: generateUniqueName(commands, 'command', undefined),
            data: payload,
            type: log.type,
            mode: viewMode === 'text' ? 'text' : 'hex',
            tokens: {},
            lineEnding: ''
        };
    }, [formatData, viewMode, encoding, commands]);

    const handleSaveCommand = useCallback((updates: Record<string, unknown>) => {
        addCommand({
            ...updates,
            parentId: undefined
        } as Omit<CommandItem, 'id' | 'type'>);
    }, [addCommand]);

    return {
        crcEnabled,
        rxCRC,
        commands,
        handleClearLogs,
        handleSaveLogs,
        handleSend,
        handleCopyLog,
        handleAddToCommand,
        handleSaveCommand,
        getDataLengthText,
        toggleCRC,
        updateRxCRC,
    };
}
