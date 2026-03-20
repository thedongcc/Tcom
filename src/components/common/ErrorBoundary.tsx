/**
 * ErrorBoundary.tsx
 * 全局错误边界组件 — 捕获 React 组件树中的运行时异常，
 * 防止子组件崩溃导致整个应用白屏。
 *
 * 功能：
 * - 捕获 React 渲染异常，显示友好的错误恢复界面
 * - 一键发送错误报告到飞书 Webhook
 * - 重启应用 / 重试 / 刷新页面
 * - 错误详情默认展开
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Send, Power, XCircle } from 'lucide-react';
import { reportError, addBreadcrumb } from '../../lib/crashReporter';

interface ErrorBoundaryProps {
    children: ReactNode;
    /** 可选的回退 UI，若不提供则使用默认错误页面 */
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    /** 上报状态：idle / sending / sent / rateLimit */
    reportStatus: 'idle' | 'sending' | 'sent' | 'rateLimit';
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null, reportStatus: 'idle' };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ errorInfo });
        console.error('[ErrorBoundary] 捕获到未处理的组件异常:', error, errorInfo);
        addBreadcrumb('error', `ErrorBoundary: ${error.message}`);
    }

    /** 重置错误状态，尝试重新渲染子组件 */
    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null, reportStatus: 'idle' });
    };

    /** 强制刷新整个页面 */
    handleReload = () => {
        window.location.reload();
    };

    /** 重启应用（刷新页面重载） */
    handleRestart = () => {
        window.location.reload();
    };

    /** 关闭软件 */
    handleQuit = async () => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().close();
        } catch {
            window.close();
        }
    };

    /** 发送错误报告到飞书 */
    handleSendReport = async () => {
        const { error } = this.state;
        if (!error) return;

        this.setState({ reportStatus: 'sending' });

        try {
            const result = await reportError(error, 'ErrorBoundary');
            // failed 也显示为 sent（不向用户暴露发送失败）
            this.setState({ reportStatus: result === 'rateLimit' ? 'rateLimit' : 'sent' });
        } catch {
            this.setState({ reportStatus: 'sent' });
        }
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const { error, errorInfo, reportStatus } = this.state;

            // 上报按钮文案和样式
            const reportButtonConfig = {
                idle: { text: '发送错误报告', disabled: false, className: 'bg-[var(--button-background,#0e639c)] text-[var(--button-foreground,#ffffff)] hover:bg-[var(--button-hover-background,#1177bb)]' },
                sending: { text: '发送中...', disabled: true, className: 'bg-[var(--button-background,#0e639c)] text-[var(--button-foreground,#ffffff)] opacity-70 cursor-wait' },
                sent: { text: '✓ 已发送，感谢反馈！', disabled: true, className: 'bg-[#2ea043] text-white cursor-default' },
                rateLimit: { text: '已达发送上限', disabled: true, className: 'bg-[#6e7681] text-white cursor-default' },
            }[reportStatus];

            return (
                <div
                    className="flex flex-col items-center justify-center h-full w-full bg-[var(--editor-background,#1e1e1e)] text-[var(--app-foreground,#cccccc)] select-none"
                    data-component="error-boundary"
                >
                    {/* pt-[12vh] 让内容整体偏下，视觉更舒适 */}
                    <div className="flex flex-col items-center max-w-2xl w-full text-center px-8 pt-[12vh]">
                        {/* 图标 */}
                        <div className="mb-5 p-4 rounded-full bg-[var(--st-settings-danger-bg-subtle,#3a1d1d)]">
                            <AlertTriangle
                                size={44}
                                className="text-[var(--st-status-error,#f14c4c)]"
                            />
                        </div>

                        {/* 标题 */}
                        <h2 className="text-xl font-bold mb-2 text-[var(--app-foreground,#cccccc)]">
                            组件渲染出错
                        </h2>

                        {/* 描述 */}
                        <p className="text-sm text-[var(--input-placeholder-color,#858585)] mb-6 leading-relaxed max-w-md">
                            应用的某个部分遇到了意外错误。您可以发送错误报告帮助我们修复，或尝试重试。
                        </p>

                        {/* 操作按钮 — 左右两列布局 */}
                        <div className="flex gap-3 mb-5">
                            {/* 主操作：发送错误报告 */}
                            <button
                                onClick={this.handleSendReport}
                                disabled={reportButtonConfig.disabled}
                                className={`flex items-center gap-2 px-5 py-2 text-sm rounded-sm transition-colors ${reportButtonConfig.className}`}
                            >
                                <Send size={14} />
                                {reportButtonConfig.text}
                            </button>

                            {/* 重试 */}
                            <button
                                onClick={this.handleRetry}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--button-secondary-background,#3a3d41)] text-[var(--button-foreground,#ffffff)] text-sm rounded-sm hover:bg-[var(--button-secondary-hover-background,#45494e)] transition-colors border border-[var(--border-color,#474747)]"
                            >
                                <RotateCcw size={14} />
                                重试
                            </button>

                            {/* 刷新页面 */}
                            <button
                                onClick={this.handleReload}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--button-secondary-background,#3a3d41)] text-[var(--button-foreground,#ffffff)] text-sm rounded-sm hover:bg-[var(--button-secondary-hover-background,#45494e)] transition-colors border border-[var(--border-color,#474747)]"
                            >
                                <RefreshCw size={14} />
                                刷新
                            </button>

                            {/* 重启应用 */}
                            <button
                                onClick={this.handleRestart}
                                className="flex items-center gap-2 px-4 py-2 bg-transparent text-[var(--st-status-warning,#cca700)] text-sm rounded-sm hover:bg-[#3a3520] transition-colors border border-[var(--st-status-warning,#cca70033)]"
                            >
                                <Power size={14} />
                                重启
                            </button>

                            {/* 关闭软件 */}
                            <button
                                onClick={this.handleQuit}
                                className="flex items-center gap-2 px-4 py-2 bg-transparent text-[var(--st-status-error,#f14c4c)] text-sm rounded-sm hover:bg-[#3a1d1d] transition-colors border border-[var(--st-status-error,#f14c4c33)]"
                            >
                                <XCircle size={14} />
                                关闭软件
                            </button>
                        </div>

                        {/* 上报成功提示 */}
                        {reportStatus === 'sent' && (
                            <p className="text-xs text-[#2ea043] mb-4">
                                错误信息已发送给开发者，我们会尽快修复 🙏
                            </p>
                        )}

                        {/* 错误详情 — 默认展开 */}
                        {error && (
                            <div className="w-full text-left mt-2">
                                <div className="text-xs text-[var(--input-placeholder-color,#858585)] mb-2 select-none">
                                    错误详情
                                </div>
                                <div className="bg-[var(--input-background,#3c3c3c)] border border-[var(--border-color,#474747)] rounded-sm p-4 text-[13px] font-mono overflow-auto max-h-64 custom-scrollbar">
                                    <p className="text-[var(--st-status-error,#f14c4c)] mb-3 font-semibold break-all">
                                        {error.name}: {error.message}
                                    </p>
                                    {errorInfo?.componentStack && (
                                        <pre className="text-[var(--input-placeholder-color,#858585)] whitespace-pre-wrap break-all leading-relaxed">
                                            {errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
