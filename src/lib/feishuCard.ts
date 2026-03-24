/**
 * feishuCard.ts
 * 飞书消息卡片构建器 — 将崩溃报告 payload 转换为飞书交互式卡片 JSON。
 */

import type { CrashReportPayload } from './crashReporter';

/** 构建飞书交互式卡片 JSON */
export function buildFeishuCard(payload: CrashReportPayload): Record<string, unknown> {
    // 面包屑格式化（最近 5 条）
    const recentCrumbs = payload.breadcrumbs.slice(-5);
    const crumbsText = recentCrumbs.length > 0
        ? recentCrumbs.map(b => `[${b.timestamp}] ${b.category}: ${b.message}`).join('\n')
        : '无操作记录';

    // 堆栈截断（避免过长）
    const stack = payload.errorStack.length > 1500
        ? payload.errorStack.substring(0, 1500) + '\n... (truncated)'
        : payload.errorStack;

    return {
        msg_type: 'interactive',
        card: {
            header: {
                title: {
                    tag: 'plain_text',
                    content: '🚨 Tcom 崩溃报告',
                },
                template: 'red',
            },
            elements: [
                {
                    tag: 'div',
                    fields: [
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: `**📋 错误类型**\n${payload.errorName}`,
                            },
                        },
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: `**📦 版本**\nv${payload.appVersion}`,
                            },
                        },
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: `**💻 系统**\n${payload.os}`,
                            },
                        },
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: `**🖥 窗口**\n${payload.windowSize}`,
                            },
                        },
                    ],
                },
                { tag: 'hr' },
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: `**📝 错误消息**\n${payload.errorMessage}`,
                    },
                },
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: '**🔍 堆栈**',
                    },
                },
                {
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: stack,
                    },
                },
                { tag: 'hr' },
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: `**🧭 操作轨迹（最近 ${recentCrumbs.length} 条）**`,
                    },
                },
                {
                    tag: 'div',
                    text: {
                        tag: 'plain_text',
                        content: crumbsText,
                    },
                },
                {
                    tag: 'note',
                    elements: [
                        {
                            tag: 'plain_text',
                            content: `来源: ${payload.source} | 上报时间: ${payload.reportTime}`,
                        },
                    ],
                },
            ],
        },
    };
}
