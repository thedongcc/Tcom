import { useI18n } from '../context/I18nContext';

export function useSystemMessage() {
    const { t } = useI18n();

    const parseSystemMessage = (type: 'INFO' | 'ERROR' | string, content: string) => {
        let styleClass = "bg-[var(--button-secondary-background)] text-[var(--activitybar-inactive-foreground)] border-[var(--border-color)]";
        let translatedText = content;

        if (type === 'ERROR') {
            styleClass = "bg-red-500/10 text-[var(--st-error-text)] border-red-500/30 shadow-sm";
        } else if (content.includes('Internal Bridge Port')) {
            styleClass = "bg-[var(--button-background)]/10 text-[var(--button-background)] border-[var(--button-background)]/30 font-semibold";
        } else if (content.includes('Physical Device')) {
            styleClass = "bg-emerald-500/10 text-[var(--st-rx-label)] border-emerald-500/30 font-semibold";
        } else if (content.includes('Open') || content.includes('Connected') || content.includes('Restored') || content.includes('Started') || content.includes('Monitor started')) {
            styleClass = "bg-emerald-500/10 text-[var(--st-rx-label)] border-emerald-500/30 font-bold";
        } else if (content.includes('Close') || content.includes('Disconnected') || content.includes('Error') || content.includes('failed')) {
            styleClass = "bg-red-500/10 text-[var(--st-error-text)] border-red-500/30 font-bold";
        }

        // Try to map English keys to translated text
        if (content.startsWith('Connected to ')) {
            translatedText = t('messages.connectedTo', { path: content.replace('Connected to ', '') });
        } else if (content === 'Disconnected (Remote)') {
            translatedText = t('messages.disconnectedRemote');
        } else if (content.startsWith('MQTT Error: ')) {
            translatedText = t('messages.mqttError', { err: content.replace('MQTT Error: ', '') });
        } else if (content.startsWith('Connection failed: ')) {
            translatedText = t('messages.connectionFailed', { err: content.replace('Connection failed: ', '') });
        } else if (content.startsWith('Connection Error: ')) {
            translatedText = t('messages.connectionError', { err: content.replace('Connection Error: ', '') });
        } else if (content === 'Monitor started') {
            translatedText = t('messages.monitorStarted');
        } else if (content.startsWith('Internal Bridge Port: ') && content.endsWith(' Disconnected')) {
            translatedText = t('messages.internalBridgeDisconnected', { path: content.substring('Internal Bridge Port: '.length, content.length - ' Disconnected'.length) });
        } else if (content.startsWith('Physical Device: ') && content.endsWith(' Disconnected')) {
            translatedText = t('messages.physicalDeviceDisconnected', { path: content.substring('Physical Device: '.length, content.length - ' Disconnected'.length) });
        } else if (content === 'Missing Paired Port') {
            translatedText = t('messages.missingPairedPort');
        } else if (content.startsWith('Monitor Start Error: ')) {
            translatedText = t('messages.monitorStartError', { err: content.replace('Monitor Start Error: ', '') });
        } else if (content.startsWith('Failed: ')) {
            translatedText = t('messages.failedToConnect', { err: content.replace('Failed: ', '') });
        } else if (content.startsWith('Serial Open Error: ')) {
            translatedText = t('messages.serialOpenError', { err: content.replace('Serial Open Error: ', '') });
        } else if (content === 'Closed') {
            translatedText = t('messages.closed');
        } else if (content === 'Disconnected') {
            translatedText = t('messages.disconnected');
        } else if (content.startsWith('Write failed: ')) {
            translatedText = t('messages.writeFailed', { err: content.replace('Write failed: ', '') });
        } else if (content.startsWith('Publish failed: ')) {
            translatedText = t('messages.publishFailed', { err: content.replace('Publish failed: ', '') });
        } else if (content === 'Virtual serial port not enabled') {
            translatedText = t('monitor.monitorDisabled');
        } else if (content === 'Admin required to start monitoring') {
            translatedText = t('monitor.adminRequiredStart');
        }

        return { styleClass, translatedText };
    };

    return { parseSystemMessage };
}
