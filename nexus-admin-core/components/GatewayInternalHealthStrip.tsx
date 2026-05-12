import React, { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { getAdminToken, getInternalGatewayPulse } from "../services/adminApi";
import {
  GatewayMemoryPressureDisplay,
  type ProcessMemoryPulse,
} from "./GatewayMemoryPressureDisplay";

type HealthLevel = "green" | "yellow" | "red" | "unknown";

function levelLabel(level: HealthLevel): string {
  if (level === "green") return "ปกติ";
  if (level === "yellow") return "เฝ้าระวัง";
  if (level === "red") return "ต้องแก้ด่วน";
  return "ไม่ทราบสถานะ";
}

function levelClasses(level: HealthLevel): string {
  if (level === "green") return "bg-emerald-500 border-emerald-600 shadow-emerald-500/30";
  if (level === "yellow") return "bg-amber-400 border-amber-500 shadow-amber-400/30";
  if (level === "red") return "bg-red-500 border-red-600 shadow-red-500/30";
  return "bg-slate-300 border-slate-400";
}

/**
 * Traffic-light strip for Internal Gateway + scheduler health (GET /api/admin/internal-gateway/pulse).
 */
export const GatewayInternalHealthStrip: React.FC = () => {
  const [level, setLevel] = useState<HealthLevel>("unknown");
  const [reasons, setReasons] = useState<string[]>([]);
  const [detail, setDetail] = useState<string>("");
  const [processMemory, setProcessMemory] = useState<ProcessMemoryPulse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!getAdminToken()) {
      setLevel("unknown");
      setReasons([]);
      setDetail("");
      return;
    }
    setLoading(true);
    try {
      const p = (await getInternalGatewayPulse()) as {
        systemHealth?: { level?: string; reasons?: string[] };
        scheduler?: { alive?: boolean; lastWebhookProcessAt?: string };
        webhookOutboxPending?: number;
        generatedAt?: string;
      };
      const sh = p.systemHealth;
      const lv = (sh?.level || "").toLowerCase();
      if (lv === "green" || lv === "yellow" || lv === "red") setLevel(lv);
      else setLevel("unknown");
      setReasons(Array.isArray(sh?.reasons) ? sh.reasons : []);
      const sched = p.scheduler;
      setDetail(
        `Webhook pending: ${p.webhookOutboxPending ?? "—"} · Scheduler: ${sched?.alive ? "alive" : "down"} · ${p.generatedAt ? String(p.generatedAt).slice(0, 19) : ""}`
      );
    } catch {
      setLevel("unknown");
      setReasons(["pulse_request_failed"]);
      setDetail("");
      setProcessMemory(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (!getAdminToken()) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
        <Activity size={18} className="text-indigo-600" />
        Internal Gateway — System Health
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-4 w-4 rounded-full border-2 shadow-md ${levelClasses(level)}`}
          title={levelLabel(level)}
          aria-label={levelLabel(level)}
        />
        <span className="text-sm font-medium text-slate-800">{levelLabel(level)}</span>
        {loading ? <span className="text-xs text-slate-400">กำลังโหลด…</span> : null}
      </div>
      {reasons.length > 0 ? (
        <p className="text-xs text-amber-800 max-w-xl">
          {reasons.join(" · ")}
        </p>
      ) : level === "green" ? (
        <p className="text-xs text-emerald-800">Ledger, webhook processor และ scheduler อยู่ในช่วงปกติ</p>
      ) : null}
      {detail ? <p className="text-xs text-slate-500 font-mono w-full sm:w-auto">{detail}</p> : null}
      {processMemory ? (
        <GatewayMemoryPressureDisplay pm={processMemory} variant="strip" />
      ) : null}
    </div>
  );
};
