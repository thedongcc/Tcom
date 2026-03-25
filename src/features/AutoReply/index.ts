/**
 * AutoReply/index.ts
 * 自动回复功能模块 — 监视数据并自动回复预设内容。
 */
import { Reply } from 'lucide-react';
import { Feature } from '../../types/module';
import { AutoReplySidebar } from '../../components/auto-reply/AutoReplySidebar';

const AutoReplyFeature: Feature = {
    id: 'auto-reply',
    name: 'Auto Reply',
    version: '1.0.0',
    description: '自动回复：匹配接收数据并回复预设内容',
    icon: Reply as any,
    sidebarComponent: AutoReplySidebar,
    activate: () => {
// log('[Feature:auto-reply] 自动回复已激活');
    },
    deactivate: () => {
// log('[Feature:auto-reply] 自动回复已停用');
    },
};

export default AutoReplyFeature;
