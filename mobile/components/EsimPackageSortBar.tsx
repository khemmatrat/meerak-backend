import React from "react";
import { ArrowDownWideNarrow } from "lucide-react";
import type { EsimSortKey } from "../utils/esimPackageSort";
import { ESIM_SORT_OPTIONS } from "../utils/esimPackageSort";

type Variant = "home" | "store";

interface EsimPackageSortBarProps {
  value: EsimSortKey;
  onChange: (key: EsimSortKey) => void;
  variant?: Variant;
  className?: string;
}

/**
 * จัดเรียงแพ็กเกจ eSIM ตามวัน / GB / ราคา
 */
export const EsimPackageSortBar: React.FC<EsimPackageSortBarProps> = ({
  value,
  onChange,
  variant = "home",
  className = "",
}) => {
  const isHome = variant === "home";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        <ArrowDownWideNarrow size={14} className={isHome ? "text-emerald-600" : "text-cyan-500"} />
        จัดเรียง
      </div>
      <div className="flex flex-wrap gap-2">
        {ESIM_SORT_OPTIONS.map(({ key, label }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={
                isHome
                  ? `rounded-full px-3 py-1.5 text-[11px] font-medium transition-all border ${
                      active
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`
                  : `rounded-full px-3 py-1.5 text-[11px] font-medium transition-all border ${
                      active
                        ? "border-cyan-500/45 bg-cyan-500/10 text-cyan-100 shadow-sm"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-cyan-500/25 hover:text-slate-200"
                    }`
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EsimPackageSortBar;
