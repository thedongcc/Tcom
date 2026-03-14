import { useI18n } from '../context/I18nContext';

// ── 样式匹配规则表 ──
const STYLE_RULES: { test: (type: string, content: string) => boolean; cls: string }[] = [
    { test: (type) => type === 'ERROR', cls: 'bg-[var(--sys-msg-error-bg)] text-[var(--sys-msg-error-text)] border-[var(--sys-msg-error-border)] shadow-sm' },
    { test: (_, c) => c.includes('Internal Bridge Port'), cls: 'bg-[var(--sys-msg-bridge-bg)] text-[var(--sys-msg-bridge-text)] border-[var(--sys-msg-bridge-border)] font-semibold' },
    { test: (_, c) => c.includes('Physical Device'), cls: 'bg-[var(--sys-msg-device-bg)] text-[var(--sys-msg-device-text)] border-[var(--sys-msg-device-border)] font-semibold' },
    { test: (_, c) => ['Open', 'Connected', 'Restored', 'Started', 'Monitor started'].some(k => c.includes(k)), cls: 'bg-[var(--sys-msg-connected-bg)] text-[var(--sys-msg-connected-text)] border-[var(--sys-msg-connected-border)] font-bold' },
    { test: (_, c) => ['Close', 'Disconnected', 'Error', 'failed'].some(k => c.includes(k)), cls: 'bg-[var(--sys-msg-error-bg)] text-[var(--sys-msg-error-text)] border-[var(--sys-msg-error-border)] font-bold' },
];

const DEFAULT_STYLE = 'bg-[var(--sys-msg-default-bg)] text-[var(--sys-msg-default-text)] border-[var(--sys-msg-default-border)]';

// ── 翻译匹配规则表 ──
type TranslateRule = { prefix: string; suffix?: string; key: string; extract: (c: string) => Record<string, string> | undefined };

const TRANSLATE_RULES: TranslateRule[] = [
    { prefix: 'Connected to ', key: 'messages.connectedTo', extract: c => ({ path: c.replace('Connected to ', '') }) },
    { prefix: 'Disconnected (Remote)', key: 'messages.disconnectedRemote', extract: () => undefined },
    { prefix: 'MQTT Error: ', key: 'messages.mqttError', extract: c => ({ err: c.replace('MQTT Error: ', '') }) },
    { prefix: 'Connection failed: ', key: 'messages.connectionFailed', extract: c => ({ err: c.replace('Connection failed: ', '') }) },
    { prefix: 'Connection Error: ', key: 'messages.connectionError', extract: c => ({ err: c.replace('Connection Error: ', '') }) },
    { prefix: 'Monitor started', key: 'messages.monitorStarted', extract: () => undefined },
    { prefix: 'Internal Bridge Port: ', suffix: ' Disconnected', key: 'messages.internalBridgeDisconnected', extract: c => ({ path: c.substring('Internal Bridge Port: '.length, c.length - ' Disconnected'.length) }) },
    { prefix: 'Physical Device: ', suffix: ' Disconnected', key: 'messages.physicalDeviceDisconnected', extract: c => ({ path: c.substring('Physical Device: '.length, c.length - ' Disconnected'.length) }) },
    { prefix: 'Missing Paired Port', key: 'messages.missingPairedPort', extract: () => undefined },
    { prefix: 'Monitor Start Error: ', key: 'messages.monitorStartError', extract: c => ({ err: c.replace('Monitor Start Error: ', '') }) },
    { prefix: 'Failed: ', key: 'messages.failedToConnect', extract: c => ({ err: c.replace('Failed: ', '') }) },
    { prefix: 'Serial Open Error: ', key: 'messages.serialOpenError', extract: c => ({ err: c.replace('Serial Open Error: ', '') }) },
    { prefix: 'Closed', key: 'messages.closed', extract: () => undefined },
    { prefix: 'Disconnected', key: 'messages.disconnected', extract: () => undefined },
    { prefix: 'Write failed: ', key: 'messages.writeFailed', extract: c => ({ err: c.replace('Write failed: ', '') }) },
    { prefix: 'Publish failed: ', key: 'messages.publishFailed', extract: c => ({ err: c.replace('Publish failed: ', '') }) },
    { prefix: 'Virtual serial port not enabled', key: 'monitor.monitorDisabled', extract: () => undefined },
    { prefix: 'Admin required to start monitoring', key: 'monitor.adminRequiredStart', extract: () => undefined },
];

export function useSystemMessage() {
    const { t } = useI18n();

    const parseSystemMessage = (type: 'INFO' | 'ERROR' | string, content: string) => {
        // 1. 样式匹配
        const matched = STYLE_RULES.find(r => r.test(type, content));
        const styleClass = matched?.cls || DEFAULT_STYLE;

        // 2. 翻译匹配
        let translatedText = content;
        for (const rule of TRANSLATE_RULES) {
            const prefixMatch = content.startsWith(rule.prefix) || content === rule.prefix;
            const suffixMatch = !rule.suffix || content.endsWith(rule.suffix);
            if (prefixMatch && suffixMatch) {
                const params = rule.extract(content);
                translatedText = params ? t(rule.key, params) : t(rule.key);
                break;
            }
        }

        return { styleClass, translatedText };
    };

    return { parseSystemMessage };
}
