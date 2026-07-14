import React from "react";

/** กรอบสตอรี่ 9:16 — รองรับมือถือ แท็บแล็ต และจอกว้าง */
export const StoryViewerFrame: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div
    className={`flex-1 flex items-center justify-center min-h-0 w-full px-1 sm:px-4 py-1 sm:py-3 ${className}`}
  >
    <div
      className="relative overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 rounded-none sm:rounded-2xl md:rounded-3xl"
      style={{
        width: "min(100%, calc((100dvh - 5.5rem) * 9 / 16))",
        height: "min(calc(100dvh - 5.5rem), calc(100vw * 16 / 9))",
        maxWidth: "100%",
      }}
    >
      {children}
    </div>
  </div>
);
