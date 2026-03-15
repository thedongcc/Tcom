/**
 * ErrorBoundary.tsx
 * 全局错误边界组件 — 捕获 React 组件树中的运行时异常，
 * 防止子组件崩溃导致整个应用白屏。
 *
 * 用法：包裹在需要保护的组件树外层。
 * 当子组件抛出异常时，显示友好的错误提示界面，
 * 并提供"重试"和"重新加载"按钮。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    /** 可选的回退 UI，若不提供则使用默认错误页面 */
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ errorInfo });
        // 记录错误到控制台，便于开发调试
        console.error('[ErrorBoundary] 捕获到未处理的组件异常:', error, errorInfo);
    }

    /** 重置错误状态，尝试重新渲染子组件 */
    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    /** 强制刷新整个页面 */
    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            // 如果提供了自定义 fallback，使用它
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const { error, errorInfo } = this.state;

            return (
                <div
                    className="flex flex-col items-center justify-center h-full w-full bg-[var(--editor-background,#1e1e1e)] text-[var(--app-foreground,#cccccc)] select-none"
                    data-component="error-boundary"
                >
                    <div className="flex flex-col items-center max-w-lg text-center px-8">
                        {/* 图标 */}
                        <div className="mb-6 p-4 rounded-full bg-[var(--st-settings-danger-bg-subtle,#3a1d1d)]">
                            <AlertTriangle
                                size={48}
                                className="text-[var(--st-status-error,#f14c4c)]"
                            />
                        </div>

                        {/* 标题 */}
                        <h2 className="text-xl font-bold mb-2 text-[var(--app-foreground,#cccccc)]">
                            组件渲染出错
                        </h2>

                        {/* 描述 */}
                        <p className="text-sm text-[var(--input-placeholder-color,#858585)] mb-6 leading-relaxed">
                            应用的某个部分遇到了意外错误。您可以尝试重试，或刷新整个页面。
                        </p>

                        {/* 操作按钮 */}
                        <div className="flex gap-3 mb-8">
                            <button
                                onClick={this.handleRetry}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--button-background,#0e639c)] text-[var(--button-foreground,#ffffff)] text-sm rounded-sm hover:bg-[var(--button-hover-background,#1177bb)] transition-colors"
                            >
                                <RotateCcw size={14} />
                                重试
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--button-secondary-background,#3a3d41)] text-[var(--button-foreground,#ffffff)] text-sm rounded-sm hover:bg-[var(--button-secondary-hover-background,#45494e)] transition-colors border border-[var(--border-color,#474747)]"
                            >
                                <RefreshCw size={14} />
                                刷新页面
                            </button>
                        </div>

                        {/* 错误详情（可折叠） */}
                        {error && (
                            <details className="w-full text-left">
                                <summary className="text-xs text-[var(--input-placeholder-color,#858585)] cursor-pointer hover:text-[var(--app-foreground,#cccccc)] transition-colors select-none mb-2">
                                    查看错误详情
                                </summary>
                                <div className="bg-[var(--input-background,#3c3c3c)] border border-[var(--border-color,#474747)] rounded-sm p-3 text-xs font-mono overflow-auto max-h-48 custom-scrollbar">
                                    <p className="text-[var(--st-status-error,#f14c4c)] mb-2 font-semibold break-all">
                                        {error.name}: {error.message}
                                    </p>
                                    {errorInfo?.componentStack && (
                                        <pre className="text-[var(--input-placeholder-color,#858585)] whitespace-pre-wrap break-all leading-relaxed">
                                            {errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
