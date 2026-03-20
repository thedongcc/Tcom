/**
 * autoReply.ts
 * 自动回复规则类型定义。
 */

/** 匹配模式 */
export type MatchMode = 'exact' | 'contains' | 'regex';

/** 数据格式 */
export type DataMode = 'hex' | 'text';

/** 触发方向 */
export type TriggerDirection = 'rx' | 'tx' | 'both';

/** 自动回复规则 */
export interface AutoReplyRule {
    /** 唯一标识 */
    id: string;
    /** 是否启用 */
    enabled: boolean;
    /** 规则名称 */
    name: string;
    /** 匹配模式 */
    matchMode: MatchMode;
    /** 匹配数据格式（HEX / 文本） */
    matchDataMode: DataMode;
    /** 匹配内容（HEX 字符串或文本） */
    matchPattern: string;
    /** 回复数据格式（HEX / 文本） */
    replyDataMode: DataMode;
    /** 回复内容（HEX 字符串或文本） */
    replyData: string;
    /** 回复延迟 (ms)，0 = 立即回复 */
    replyDelay: number;
    /** 触发方向（通常监听 RX） */
    direction: TriggerDirection;
}

/** 创建默认规则 */
export function createDefaultRule(): AutoReplyRule {
    return {
        id: crypto.randomUUID(),
        enabled: true,
        name: '',
        matchMode: 'contains',
        matchDataMode: 'hex',
        matchPattern: '',
        replyDataMode: 'hex',
        replyData: '',
        replyDelay: 0,
        direction: 'rx',
    };
}
