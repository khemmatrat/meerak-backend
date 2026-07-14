import React, { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; variant?: "welcome" | "compact" };

type State = { hasError: boolean };

/**
 * กัน render แบนเนอร์ล้มทั้ง section — แสดงข้อความแทนกล่องว่าง
 */
export class BackendBannersErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[AQOND][banner-error-boundary]", error.message, info.componentStack);
    } else {
      console.warn("[AQOND][banner-error-boundary]", error.message);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const isCompact = this.props.variant === "compact";
      return (
        <section className="mb-2" aria-label="โปรโมชัน">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">โปรโมชัน</p>
          <div
            className={`flex ${isCompact ? "min-h-[118px]" : "min-h-[120px]"} items-center justify-center rounded-[18px] bg-amber-50 px-4 text-center text-sm text-amber-900 ring-1 ring-amber-200`}
          >
            แสดงโปรโมชันไม่สำเร็จ — โหลดหน้าใหม่หรือลองอีกครั้งในภายหลัง
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
