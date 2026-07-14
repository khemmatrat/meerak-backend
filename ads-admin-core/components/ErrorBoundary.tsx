import React, { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ads-admin] render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <p className="font-semibold">เกิดข้อผิดพลาดในหน้านี้</p>
          <p className="text-sm mt-2">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-4 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm"
            onClick={() => this.setState({ error: null })}
          >
            ลองอีกครั้ง
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
