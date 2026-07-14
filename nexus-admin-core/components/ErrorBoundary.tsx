import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-8 bg-rose-50 border border-rose-200 rounded-xl">
          <h3 className="text-lg font-bold text-rose-700 mb-2">เกิดข้อผิดพลาด</h3>
          <p className="text-sm text-rose-600 mb-4">{this.state.error.message}</p>
          {this.props.onRetry && (
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700"
            >
              ลองอีกครั้ง
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
