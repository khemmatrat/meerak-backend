import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { RefreshCw, Network, Shield, Activity, FileText } from "lucide-react";
import {
  getInternalGatewayMetrics,
  getInternalGatewayTransactions,
  getInternalGatewaySettlementReports,
  getInternalGatewayPulse,
  postInternalGatewayGenerateReport,
} from "../services/adminApi";
import {
  GatewayMemoryPressureDisplay,
  type ProcessMemoryPulse,
} from "./GatewayMemoryPressureDisplay";

function initialPrevMonthBangkok(): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  let y = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
  let m = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return { y, m };
}

const GATEWAY_ACCESS_REASON_KEY = "aqond_gateway_access_reason";

const REASON_PRESETS: { value: string; label: string }[] = [
  { value: "routine_review", label: "Routine admin review" },
  { value: "dispute_investigation", label: "Dispute investigation" },
  { value: "fraud_check", label: "Fraud check" },
  { value: "compliance_audit", label: "Compliance / ISO audit" },
];

type Metrics = {
  windowDays?: number;
  total?: number;
  successCompleted?: number;
  failed?: number;
  successRate?: number | null;
  avgProcessingMs?: number | null;
  p50ProcessingMs?: number | null;
  p95ProcessingMs?: number | null;
  daily?: Array<{
    day?: string;
    total?: number;
    successCompleted?: number;
    successRate?: number | null;
    avgProcessingMs?: number | null;
  }>;
  externalVolumeBenchmark?: { byGateway?: Array<{ gateway?: string; cnt?: number }>; note?: string };
  enabled?: boolean;
};

export const AqondGatewayConsoleView: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [txRows, setTxRows] = useState<Record<string, unknown>[]>([]);
  const [settlements, setSettlements] = useState<Record<string, unknown>[]>([]);
  const [pulse, setPulse] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessReason, setAccessReason] = useState<string | null>(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("routine_review");
  const initPm = initialPrevMonthBangkok();
  const [reportYear, setReportYear] = useState(initPm.y);
  const [reportMonth, setReportMonth] = useState(initPm.m);
  const [reportReasonManual, setReportReasonManual] = useState("");
  const [reportForce, setReportForce] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(GATEWAY_ACCESS_REASON_KEY)?.trim();
      if (s && s.length >= 3) {
        setAccessReason(s);
      } else {
        setShowReasonModal(true);
      }
    } catch {
      setShowReasonModal(true);
    }
  }, []);

  const load = useCallback(() => {
    if (!accessReason) return;
    setLoading(true);
    setErr(null);
    Promise.all([
      getInternalGatewayMetrics(30, accessReason),
      getInternalGatewayTransactions(50, accessReason),
      getInternalGatewaySettlementReports(15, accessReason),
      getInternalGatewayPulse(),
    ])
      .then(([m, t, s, p]) => {
        setMetrics(m as Metrics);
        setTxRows((t.rows as Record<string, unknown>[]) || []);
        setSettlements((s.rows as Record<string, unknown>[]) || []);
        setPulse((p as Record<string, unknown>) || null);
      })
      .catch((e: Error) => setErr(e.message || "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [accessReason]);

  useEffect(() => {
    if (accessReason) load();
  }, [accessReason, load]);

  const runRegenerateMonthlyReport = async () => {
    const reason = reportReasonManual.trim();
    if (reason.length < 3) {
      setRegenMsg("กรุณากรอกเหตุผล (อย่างน้อย 3 ตัวอักษร)");
      return;
    }
    setRegenLoading(true);
    setRegenMsg(null);
    try {
      const res = (await postInternalGatewayGenerateReport({
        year: reportYear,
        month: reportMonth,
        reason,
        force: reportForce,
      })) as Record<string, unknown>;
      if (res.error) {
        setRegenMsg(String(res.error));
      } else if (res.skipped) {
        setRegenMsg(
          `ข้าม: ${String(res.reason || "")}${res.existingId ? ` (id: ${String(res.existingId)})` : ""} — เปิด "บังคับสร้างใหม่" ถ้าต้องการแทนที่`
        );
      } else {
        setRegenMsg(`สำเร็จ — report id: ${String(res.id || "")}`);
      }
      load();
    } catch (e: unknown) {
      setRegenMsg((e as Error)?.message || "คำขอล้มเหลว");
    } finally {
      setRegenLoading(false);
    }
  };

  const confirmAccessReason = () => {
    const r = reasonDraft.trim();
    if (r.length < 3) return;
    try {
      localStorage.setItem(GATEWAY_ACCESS_REASON_KEY, r);
    } catch {
      /* ignore */
    }
    setAccessReason(r);
    setShowReasonModal(false);
  };

  const dailyChart =
    metrics?.daily && metrics.daily.length > 0
      ? metrics.daily.map((d) => ({
          label: String(d.day || "").slice(5),
          successRatePct:
            d.successRate != null && Number.isFinite(d.successRate)
              ? Math.round(Number(d.successRate) * 1000) / 10
              : null,
          avgMs: d.avgProcessingMs != null ? Math.round(Number(d.avgProcessingMs)) : null,
        }))
      : [];

  const extBars =
    metrics?.externalVolumeBenchmark?.byGateway?.map((g) => ({
      name: String(g.gateway || "unknown"),
      volume: Number(g.cnt) || 0,
    })) || [];

  const sched = pulse?.scheduler as Record<string, unknown> | undefined;
  const li = pulse?.ledgerIntegrity as Record<string, unknown> | undefined;
  const signing = pulse?.internalGatewaySigning as { hmacSecretConfigured?: boolean } | undefined;
  const sh = pulse?.systemHealth as { level?: string; reasons?: string[] } | undefined;
  const processMemory = pulse?.processMemory as ProcessMemoryPulse | undefined;
  const healthLevel = String(sh?.level || "").toLowerCase();
  const healthDotClass =
    healthLevel === "green"
      ? "bg-emerald-500 border-emerald-600"
      : healthLevel === "yellow"
        ? "bg-amber-400 border-amber-500"
        : healthLevel === "red"
          ? "bg-red-500 border-red-600"
          : "bg-slate-300 border-slate-400";

  return (
    <div className="relative mx-auto max-w-6xl space-y-6 p-4 md:space-y-8 md:p-6">
      {showReasonModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">เหตุผลการเข้าถึงข้อมูล (Zero-knowledge audit)</h2>
            <p className="text-sm text-slate-600">
              เลือกเหตุผลเพื่อดูข้อมูลที่ถูก mask — ระบบจะบันทึกใน audit log ตามนโยบาย ISO/IEC 27001
            </p>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
            >
              {REASON_PRESETS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={confirmAccessReason}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500"
            >
              ยืนยันและโหลดข้อมูล
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900 md:text-2xl">
            <Network className="shrink-0 text-indigo-600" size={28} />
            AQOND Gateway Console
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            บันทึกธุรกรรม Internal Gateway แยกจาก Stripe/Payso — double-entry ledger, HMAC + nonce (ฝั่ง backend
            ไม่เก็บ PAN/CVV) และ state machine สำหรับการออกใบอนุญาตในอนาคต
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Shield size={14} />
            <span>PCI: ไม่แสดงข้อมูลหน้าบัตรหรือข้อมูลส่วนบุคคลดิบบนหน้านี้</span>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || !accessReason}
          className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-white hover:bg-indigo-500 disabled:opacity-50 sm:w-auto sm:min-h-0 sm:py-2"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {pulse && accessReason ? (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-cyan-950 flex flex-wrap items-center gap-2 mb-3">
            <Activity className="text-cyan-700" size={18} />
            Gateway Pulse (real-time)
            <span
              className={`inline-block h-3 w-3 rounded-full border-2 shadow ${healthDotClass}`}
              title={
                Array.isArray(sh?.reasons) && sh.reasons.length
                  ? sh.reasons.join(" · ")
                  : healthLevel || "unknown"
              }
            />
            {Array.isArray(sh?.reasons) && sh.reasons.length ? (
              <span className="text-xs font-normal text-cyan-900/90">{sh.reasons.join(" · ")}</span>
            ) : null}
          </h2>
          <GatewayMemoryPressureDisplay pm={processMemory} variant="card" />
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-cyan-800 uppercase">Webhook outbox ค้าง</p>
              <p className="font-mono font-bold text-cyan-950">{String(pulse.webhookOutboxPending ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Retry sum (pending)</p>
              <p className="font-mono font-bold text-cyan-950">{String(pulse.webhookRetryAttemptsSum ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Avg proc. (24h)</p>
              <p className="font-mono font-bold text-cyan-950">
                {pulse.avgProcessingMs24h != null ? `${Math.round(Number(pulse.avgProcessingMs24h))} ms` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Ledger integrity</p>
              <p className="font-mono font-bold text-cyan-950">
                {li?.ok === true ? "OK" : li?.ok === false ? "FAIL" : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Scheduler alive</p>
              <p className="font-mono font-bold text-cyan-950">{sched?.alive ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Last webhook tick</p>
              <p className="font-mono text-xs text-cyan-950 break-all">
                {sched?.lastWebhookProcessAt ? String(sched.lastWebhookProcessAt).slice(0, 19) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Recon ล่าสุด (DB)</p>
              <p className="font-mono text-xs text-cyan-950 break-all">
                {pulse.lastReconciliationAt
                  ? String(pulse.lastReconciliationAt).slice(0, 19)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Scheduler last recon tick</p>
              <p className="font-mono text-xs text-cyan-950 break-all">
                {sched?.lastReconRunAt ? String(sched.lastReconRunAt).slice(0, 19) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">INTERNAL_GATEWAY_HMAC_SECRET</p>
              <p className="font-mono font-bold text-cyan-950">
                {signing?.hmacSecretConfigured ? "ตั้งแล้ว (พร้อม signing)" : "ยังไม่ตั้ง — ตรวจ backend/.env"}
              </p>
            </div>
            <div>
              <p className="text-xs text-cyan-800 uppercase">Compliance ล่าสุด (scheduler)</p>
              <p className="font-mono text-xs text-cyan-950 break-all">
                {sched?.lastComplianceReportAt ? String(sched.lastComplianceReportAt).slice(0, 19) : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {accessReason ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <FileText size={18} className="text-indigo-600" />
            Regenerate Monthly Report
          </h2>
          <p className="text-xs text-slate-600">
            สร้างรายงาน BOT compliance สำหรับเดือนที่เลือก (ย้อนหลังได้) — บันทึกใน Gateway Audit Log อัตโนมัติ
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-slate-600">
              ปี (ค.ศ.)
              <input
                type="number"
                className="mt-1 block w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value, 10) || reportYear)}
                min={2020}
                max={2100}
              />
            </label>
            <label className="text-xs text-slate-600">
              เดือน (1–12)
              <input
                type="number"
                className="mt-1 block w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                value={reportMonth}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= 12) setReportMonth(v);
                }}
                min={1}
                max={12}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={reportForce}
                onChange={(e) => setReportForce(e.target.checked)}
              />
              บังคับสร้างใหม่ (ลบแถวเดิมของเดือนนั้นแล้วคำนวณใหม่)
            </label>
          </div>
          <label className="block text-xs text-slate-600">
            เหตุผล (บังคับ — ใช้ audit)
            <textarea
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="เช่น รายงานเดือนมกราคมไม่ออกเพราะ server maintenance วันที่ 1"
              value={reportReasonManual}
              onChange={(e) => setReportReasonManual(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={regenLoading}
            onClick={() => runRegenerateMonthlyReport()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {regenLoading ? "กำลังสร้าง…" : "สร้างรายงาน"}
          </button>
          {regenMsg ? <p className="text-sm text-slate-700 whitespace-pre-wrap">{regenMsg}</p> : null}
        </div>
      ) : null}

      {err ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {err}
          {err.includes("gateway_tables") || err.includes("503") ? (
            <p className="mt-2 text-xs">
              รัน migration 146 บนฐานข้อมูลก่อน: <code className="font-mono">146_aqond_internal_gateway.sql</code>
            </p>
          ) : null}
        </div>
      ) : null}

      {!accessReason ? (
        <p className="text-slate-500">กรุณาเลือกเหตุผลการเข้าถึง…</p>
      ) : loading && !metrics ? (
        <p className="text-slate-500">กำลังโหลด…</p>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                <Activity size={14} /> สถานะฟีเจอร์
              </p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {metrics.enabled ? "ON (INTERNAL_GATEWAY_ENABLED)" : "OFF"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase">Success rate ({metrics.windowDays}d)</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">
                {metrics.successRate != null && Number.isFinite(metrics.successRate)
                  ? `${(metrics.successRate * 100).toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                SETTLED+CAPTURED / ทั้งหมดใน window
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase">p95 / avg latency</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {metrics.p95ProcessingMs != null ? `${Math.round(metrics.p95ProcessingMs)} ms` : "—"}{" "}
                <span className="text-sm font-normal text-slate-500">
                  / {metrics.avgProcessingMs != null ? `${Math.round(metrics.avgProcessingMs)} ms` : "—"}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase">ธุรกรรม (window)</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{metrics.total ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">
                สำเร็จ {metrics.successCompleted ?? 0} · ล้มเหลว {metrics.failed ?? 0}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Success rate &amp; เวลา (รายวัน — Internal)</h2>
              {dailyChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="successRatePct"
                      name="Success %"
                      stroke="#059669"
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgMs"
                      name="Avg ms"
                      stroke="#4f46e5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500">ยังไม่มีข้อมูลรายวัน (รอธุรกรรม Internal Gateway)</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">
                ปริมาณธุรกรรมตามเจ้า (payment_transaction_logs — เปรียบเทียบเชิงปริมาณ)
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                ไม่ใช่ latency เดียวกันกับ Internal Gateway — ใช้แนวโน้มจำนวนรายการเทียบ Stripe/Payso/Ksher
              </p>
              {extBars.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={extBars}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="volume" name="จำนวนรายการ" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500">
                  {metrics.externalVolumeBenchmark?.note ||
                    "ไม่มีข้อมูล payment_transaction_logs หรือยังไม่มีรายการ"}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">gateway_transactions (masked)</h2>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {txRows.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">ไม่มีธุรกรรม</p>
              ) : (
                txRows.map((r) => (
                  <div key={`tx-m-${String(r.id)}`} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-slate-500">
                          {r.created_at ? String(r.created_at).slice(0, 19) : "—"}
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                          {String(r.amount_minor ?? "—")}{" "}
                          <span className="text-xs font-normal text-slate-500">minor</span>
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                        {String(r.status ?? "")}
                      </span>
                    </div>
                    <details className="mt-2 border-t border-slate-200 pt-2">
                      <summary className="cursor-pointer text-xs font-medium text-indigo-600">รายละเอียด</summary>
                      <p className="mt-2 break-all font-mono text-xs text-slate-600">
                        ref: {String(r.merchant_reference ?? "—")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        proc: {r.processing_time_ms != null ? `${r.processing_time_ms} ms` : "—"}
                      </p>
                    </details>
                  </div>
                ))
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2">created</th>
                    <th className="text-left px-3 py-2">status</th>
                    <th className="text-right px-3 py-2">amount (minor)</th>
                    <th className="text-left px-3 py-2">merchant ref</th>
                    <th className="text-right px-3 py-2">proc ms</th>
                  </tr>
                </thead>
                <tbody>
                  {txRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        ไม่มีธุรกรรม
                      </td>
                    </tr>
                  ) : (
                    txRows.map((r) => (
                      <tr key={String(r.id)} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.created_at ? String(r.created_at).slice(0, 19) : "—"}
                        </td>
                        <td className="px-3 py-2">{String(r.status ?? "")}</td>
                        <td className="px-3 py-2 text-right font-mono">{String(r.amount_minor ?? "")}</td>
                        <td className="px-3 py-2 font-mono text-xs">{String(r.merchant_reference ?? "—")}</td>
                        <td className="px-3 py-2 text-right">{r.processing_time_ms != null ? String(r.processing_time_ms) : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">gateway_settlement_reports</h2>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {settlements.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีรายงาน settlement</p>
              ) : (
                settlements.map((r) => (
                  <div key={`set-m-${String(r.id)}`} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <p className="font-mono text-xs text-slate-600">
                      {String(r.report_period_start || "")} → {String(r.report_period_end || "")}
                    </p>
                    <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
                      vol {String(r.total_volume_minor ?? "—")}{" "}
                      <span className="text-sm font-normal text-slate-500">minor</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span>fee {String(r.total_fee_minor ?? "—")}</span>
                      <span>·</span>
                      <span>n={String(r.transaction_count ?? "")}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">
                        {String(r.status ?? "")}
                      </span>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-indigo-600">hash</summary>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                        {r.snapshot_hash_sha256 ? String(r.snapshot_hash_sha256) : "—"}
                      </p>
                    </details>
                  </div>
                ))
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2">period</th>
                    <th className="text-right px-3 py-2">volume (minor)</th>
                    <th className="text-right px-3 py-2">fee (minor)</th>
                    <th className="text-right px-3 py-2">count</th>
                    <th className="text-left px-3 py-2">status</th>
                    <th className="text-left px-3 py-2">hash</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        ยังไม่มีรายงาน settlement
                      </td>
                    </tr>
                  ) : (
                    settlements.map((r) => (
                      <tr key={String(r.id)} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs">
                          {String(r.report_period_start || "")} → {String(r.report_period_end || "")}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{String(r.total_volume_minor ?? "")}</td>
                        <td className="px-3 py-2 text-right font-mono">{String(r.total_fee_minor ?? "")}</td>
                        <td className="px-3 py-2 text-right">{String(r.transaction_count ?? "")}</td>
                        <td className="px-3 py-2">{String(r.status ?? "")}</td>
                        <td className="px-3 py-2 font-mono text-xs truncate max-w-[8rem]">
                          {r.snapshot_hash_sha256 ? `${String(r.snapshot_hash_sha256).slice(0, 12)}…` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
