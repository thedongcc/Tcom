/**
 * ConfirmContext.tsx
 * Confirm 渲染容器 — 无 Provider 包裹，订阅 confirmManager 状态后自渲染。
 *
 * 用法：在 FullApp.tsx 中 <ConfirmContainer /> 平铺即可。
 * 业务代码直接 import { confirm } from '@/services/confirmManager'。
 */
import { useSyncExternalStore } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { confirmStore, confirm } from '../services/confirmManager';

/** Confirm 渲染容器（无需 Provider，平铺使用） */
export const ConfirmContainer = () => {
    const confirmState = useSyncExternalStore(confirmStore.subscribe, confirmStore.getSnapshot);

    if (!confirmState) return null;

    return (
        <ConfirmDialog
            {...confirmState.options}
            onResolve={confirmState.resolve}
        />
    );
};

/**
 * @deprecated 保留旧 API 签名的兼容函数。
 * 新代码请直接使用 import { confirm } from '@/services/confirmManager'。
 */
export const useConfirm = () => {
    return { confirm };
};
