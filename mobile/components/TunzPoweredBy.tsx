import React, { useState } from "react";

type Props = {
  /** compact = one line chip; default = stacked wordmark */
  variant?: "default" | "compact";
  className?: string;
};

/**
 * GigaStore / Tunz — eSIM provisioning branding.
 * ดาวน์โหลด asset จาก portal แล้วแทนที่ไฟล์ใน /public/branding/ ได้
 */
export const TunzPoweredBy: React.FC<Props> = ({ variant = "default", className = "" }) => {
  const [imgOk, setImgOk] = useState(true);

  if (variant === "compact") {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 ${className}`}
      >
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Powered by
        </span>
        <span className="text-sm font-bold tracking-tight text-slate-800">Tunz</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-1 py-2 ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
        eSIM provisioning
      </p>
      {imgOk ? (
        <img
          src="/branding/tunz-powered.svg"
          alt="Powered by Tunz"
          className="h-9 w-auto max-w-[200px] opacity-95"
          onError={() => setImgOk(false)}
        />
      ) : (
        <p className="text-lg font-bold tracking-tight text-slate-200">Powered by Tunz</p>
      )}
    </div>
  );
};

export default TunzPoweredBy;
