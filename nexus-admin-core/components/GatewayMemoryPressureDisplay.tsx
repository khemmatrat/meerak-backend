import React from "react";

export type ProcessMemoryPulse = {
  heapPressurePercent?: number;
  heapUsedMb?: number;
  heapSizeLimitMb?: number;
  heapTotalMb?: number;
  rssMb?: number;
  memoryGuardPct?: number;
  memoryGuardDisabled?: boolean;
  overEightyPercent?: boolean;
};

function memoryVisualState(pm: ProcessMemoryPulse): {
  pct: number;
  labelClass: string;
  barClass: string;
  borderClass: string;
  atGuard: boolean;
} {
  const pct = Math.min(100, Math.max(0, Number(pm.heapPressurePercent) || 0));
  const guard = Math.min(99, Math.max(50, Number(pm.memoryGuardPct) || 85));
  const atGuard = !pm.memoryGuardDisabled && pct >= guard;
  const over80 = pm.overEightyPercent === true || pct >= 80;
  if (atGuard) {
    return {
      pct,
      labelClass: "text-red-700 font-bold",
      barClass: "bg-red-500",
      borderClass: "border-red-300 ring-1 ring-red-200/80",
      atGuard: true,
    };
  }
  if (over80) {
    return {
      pct,
      labelClass: "text-amber-700 font-semibold",
      barClass: "bg-amber-500",
      borderClass: "border-amber-300 ring-1 ring-amber-200/80",
      atGuard: false,
    };
  }
  return {
    pct,
    labelClass: "text-slate-900",
    barClass: "bg-emerald-500",
    borderClass: "border-slate-200",
    atGuard: false,
  };
}

function buildTooltip(pm: ProcessMemoryPulse): string {
  const used = pm.heapUsedMb != null ? `${pm.heapUsedMb} MB` : "—";
  const limit = pm.heapSizeLimitMb != null ? `${pm.heapSizeLimitMb} MB` : "—";
  const total = pm.heapTotalMb != null ? `${pm.heapTotalMb} MB` : "—";
  const rss = pm.rssMb != null ? `${pm.rssMb} MB` : "—";
  const guard = pm.memoryGuardPct ?? 85;
  const guardNote =
    pm.memoryGuardDisabled === true
      ? "Memory guard: ปิดอยู่"
      : `Cron jobs จะหยุดชั่วคราวเมื่อแรงดัน heap ≥ ${guard}% (เทียบ V8 heap limit)`;
  return [
    `Heap ที่ใช้: ${used} / เพดาน V8: ${limit}`,
    `heapTotal (allocated): ${total} · RSS โปรเซส: ${rss}`,
    guardNote,
  ].join("\n");
}

/** Pulse processMemory — แสดงแรงดัน heap เทียบ V8 limit (ไม่ใช่ RAM ทั้งเครื่อง) */
export const GatewayMemoryPressureDisplay: React.FC<{
  pm: ProcessMemoryPulse | null | undefined;
  variant: "card" | "strip";
}> = ({ pm, variant }) => {
  if (pm == null) {
    if (variant === "strip") return null;
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-500">
        Memory Pressure: ไม่มีข้อมูล (รอ Pulse)
      </div>
    );
  }

  const vs = memoryVisualState(pm);
  const used = pm.heapUsedMb != null ? pm.heapUsedMb : "—";
  const limit = pm.heapSizeLimitMb != null ? pm.heapSizeLimitMb : "—";
  const tooltip = buildTooltip(pm);

  if (variant === "strip") {
    return (
      <div
        className={`flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 ${vs.borderClass} bg-white/90`}
        title={tooltip}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="font-medium whitespace-nowrap text-slate-700">Memory Pressure</span>
          <span className={`font-mono tabular-nums ${vs.labelClass}`}>{vs.pct}%</span>
        </div>
        <div className="h-2 w-full min-w-0 flex-1 rounded-full bg-slate-200 sm:max-w-[40vw] sm:flex-none" title={tooltip}>
          <div className={`h-full rounded-full transition-all ${vs.barClass}`} style={{ width: `${vs.pct}%` }} />
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500" title={tooltip}>
          {used} / {limit} MB
        </span>
      </div>
    );
  }

  const ringColor =
    vs.atGuard ? "#ef4444" : pm.overEightyPercent === true || vs.pct >= 80 ? "#f59e0b" : "#10b981";

  return (
    <div
      className={`w-full rounded-lg border p-3 ${vs.borderClass} bg-white/90`}
      title={tooltip}
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-600">
        Memory Pressure (heap vs V8 limit)
      </p>

      {/* Narrow screens: ring gauge + full-width bar */}
      <div className="flex flex-col items-center gap-4 md:hidden">
        <div
          className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ringColor} ${vs.pct}%, #e2e8f0 0)`,
            padding: "5px",
          }}
          aria-hidden
        >
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
            <span className={`font-mono text-2xl font-bold tabular-nums ${vs.labelClass}`}>{vs.pct}%</span>
            <span className="text-[10px] text-slate-500">heap</span>
          </div>
        </div>
        <div className="w-full">
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${vs.barClass}`}
              style={{ width: `${vs.pct}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs font-mono tabular-nums text-slate-500">
            {used} MB / {limit} MB
            {pm.rssMb != null ? ` · RSS ${pm.rssMb} MB` : ""}
          </p>
        </div>
      </div>

      {/* md+: horizontal layout */}
      <div className="hidden flex-wrap items-end gap-3 md:flex">
        <span className={`font-mono text-2xl font-bold tabular-nums ${vs.labelClass}`}>{vs.pct}%</span>
        <div className="min-w-[120px] max-w-md flex-1">
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-all ${vs.barClass}`} style={{ width: `${vs.pct}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-xs tabular-nums text-slate-500">
            {used} MB / {limit} MB
            {pm.rssMb != null ? ` · RSS ${pm.rssMb} MB` : ""}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-slate-500">
        ค่าเปอร์เซ็นต์ = heapUsed ÷ heap_size_limit ของ Node (V8) — แตะค้างเพื่อดูรายละเอียด
      </p>
    </div>
  );
};
