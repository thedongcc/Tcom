/**
 * 检查 MQTT 主题是否匹配指定的模式
 * 支持通配符:
 * + : 匹配单层级
 * # : 匹配后续所有层级 (必须在末尾)
 * 
 * @param pattern 订阅模式 (例如 "sensors/+/temp", "sensors/#")
 * @param topic 实际主题 (例如 "sensors/room1/temp")
 * @returns 是否匹配
 */
export function mqttTopicMatch(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;
    if (pattern === '#') return true;

    const patternSegments = pattern.split('/');
    const topicSegments = topic.split('/');

    const patternLen = patternSegments.length;
    const topicLen = topicSegments.length;

    for (let i = 0; i < patternLen; i++) {
        const p = patternSegments[i];

        // # 匹配后续所有层级
        if (p === '#') {
            return i === patternLen - 1;
        }

        // + 匹配当前层级
        if (p === '+') {
            if (i >= topicLen) return false;
            // 继续检查下一层
            continue;
        }

        // 普通字符匹配
        if (p !== topicSegments[i]) {
            return false;
        }
    }

    // 如果模式比主题短，且模式末尾不是 #，则不匹配
    // 如果模式比主题长，也不匹配
    return patternLen === topicLen;
}
