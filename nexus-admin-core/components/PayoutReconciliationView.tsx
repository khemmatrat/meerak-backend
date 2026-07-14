import React, { useCallback, useEffect, useState } from "react";
import {
  getPayoutReconciliationOverview,
  downloadPayoutReconciliationDailyReport,
  postAdminPayoutReconcile,
  postAdminPaysoPromptPay,
  getPayoutReconciliationSummary,
  getPayoutConfig,
  type PayoutReconciliationOverviewItem,
} from "../services/adminApi";
import { RefreshCw, FileDown, ClipboardCheck, ExternalLink, AlertTriangle, Shield, Hash, X, Send } from "lucide-react";

function rowClass(st: string): string {
  const u = (st || "").toUpperCase();
  if (u === "FAIL") return "bg-rose-50 border-l-4 border-rose-500";
  if (u === "WARN") return "bg-amber-50 border-l-4 border-amber-500";
  if (u === "PASS") return "bg-emerald-50/50 border-l-4 border-emerald-400";
  return "border-l-4 border-slate-200";
}

function ReconBadge({ st }: { st: string }) {
  const u = (st || "").toUpperCase();
  if (u === "PASS") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 shadow-sm">
        PASS
      </span>
    );
  }
  if (u === "FAIL") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-400 shadow-sm">
        FAIL
      </span>
    );
  }
  if (u === "WARN") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-400 shadow-sm animate-pulse">
        WARN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
      {st || "—"}
    </span>
  );
}

function ledgerMatchLabel(details: Record<string, unknown> | undefined): string {
  const d = details?.R1 as Record<string, unknown> | undefined;
  if (!d) return "-";
  if (d.skipped) return "pending";
  return d.ok ? "match" : "mismatch";
}

export const PayoutReconciliationView: React.FC = () => {
  const [items, setItems] = useState<PayoutReconciliationOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    total_volume_reconciled_pass_thb: number;
    pending_exceptions: number;
    ledger_variance_thb: number;
    timezone: string;
    report_id: string;
  } | null>(null);
  const [evidence, setEvidence] = useState<{ url: string; hash: string | null } | null>(null);
  const [reconcileModal, setReconcileModal] = useState<{ id: string } | null>(null);
  const [reconcileReason, setReconcileReason] = useState("");
  const [paysoBusyId, setPaysoBusyId] = useState<string | null>(null);
  const [paysoEnabled, setPaysoEnabled] = useState<boolean | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const s = await getPayoutReconciliationSummary({ date: reportDate });
      setSummary({
        total_volume_reconciled_pass_thb: s.total_volume_reconciled_pass_thb,
        pending_exceptions: s.pending_exceptions,
        ledger_variance_thb: s.ledger_variance_thb,
        timezone: s.timezone,
        report_id: s.report_id,
      });
    } catch {
      setSummary(null);
    }
  }, [reportDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPayoutReconciliationOverview({
        limit: 300,
        reconciliation_status: filter || undefined,
      });
      setItems(res.items || []);
    } catch (e) {
      setError((e as Error).message || "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const onPayViaPayso = async (id: string) => {
    if (paysoEnabled === false) {
      alert("Payso ยังไม่เปิด — ตั้ง PAYSO_ENABLED=1 และ credential ใน backend .env");
      return;
    }
    if (!confirm("ส่งคำขอถอนนี้ไปยัง Payso PromptPay (None-UI)? ต้องตั้ง PAYSO_* บน API แล้ว")) return;
    setPaysoBusyId(id);
    try {
      await postAdminPaysoPromptPay(id);
      await load();
      await loadSummary();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPaysoBusyId(null);
    }
  };

  const onReRun = async () => {
    if (!reconcileModal) return;
    const reason = reconcileReason.trim();
    if (reason.length < 5) {
      alert("กรุณากรอกเหตุผลอย่างน้อย 5 ตัวอักษร (audit trail)");
      return;
    }
    setBusyId(reconcileModal.id);
    try {
      await postAdminPayoutReconcile(reconcileModal.id, { reason });
      setReconcileModal(null);
      setReconcileReason("");
      await load();
      await loadSummary();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="text-indigo-600" size={22} />
            Reconciliation Overview (Tier A)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            ตรวจยอดเทียบ ledger + สลิป (SHA-256) — รายงานรายวันสำหรับ Audit
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => {
              load();
              loadSummary();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-700"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">ทุกสถานะ</option>
            <option value="PENDING">PENDING</option>
            <option value="PASS">PASS</option>
            <option value="WARN">WARN</option>
            <option value="FAIL">FAIL</option>
          </select>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total volume reconciled (PASS)</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">
              ฿{summary.total_volume_reconciled_pass_thb.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">{summary.report_id}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Pending exceptions</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{summary.pending_exceptions}</div>
            <div className="text-xs text-slate-500 mt-2">FAIL / WARN ที่ยัง pending</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ledger variance (day)</div>
            <div
              className={`text-2xl font-bold mt-1 ${
                Math.abs(summary.ledger_variance_thb) < 0.01 ? "text-slate-800" : "text-rose-700"
              }`}
            >
              ฿{summary.ledger_variance_thb.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500 mt-2">{summary.timezone}</div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-end gap-3">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">รายงานรายวัน (Asia/Bangkok ICT)</label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="block mt-1 border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadPayoutReconciliationDailyReport(reportDate, "csv").catch((e) => alert(String(e)))}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold"
          >
            <FileDown size={16} /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => downloadPayoutReconciliationDailyReport(reportDate, "pdf").catch((e) => alert(String(e)))}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold"
          >
            <FileDown size={16} /> Export PDF
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex gap-2">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <span>
          FAIL = ห้ามอนุมัติอัตโนมัติ / แอดมินต้องตรวจสอบ — Auto-payout cron รันเฉพาะ{" "}
          <code className="bg-amber-100 px-1 rounded">reconciliation_status = PASS</code>
        </span>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg text-sm">
          {error} — รัน migration 155/156/157 บน DB หากยังไม่มีคอลัมน์ reconciliation / Payso
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 font-semibold">
                <tr>
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Payso (audit)</th>
                  <th className="px-4 py-3">Ledger (R1)</th>
                  <th className="px-4 py-3">Slip hash</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Evidence</th>
                  <th className="px-4 py-3 text-center">Payso</th>
                  <th className="px-4 py-3 text-center">Re-run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.id} className={rowClass(row.reconciliation_status)}>
                    <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                    <td className="px-4 py-3 font-bold">฿{Number(row.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-[10px] font-mono text-slate-700 max-w-[200px]">
                      <div title={row.payso_reference_id || ""}>
                        <span className="text-slate-500">Ref:</span> {row.payso_reference_id || "—"}
                      </div>
                      <div className="mt-0.5 truncate" title={row.payso_transaction_id || ""}>
                        <span className="text-slate-500">Txn:</span> {row.payso_transaction_id || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{ledgerMatchLabel(row.reconciliation_details)}</td>
                    <td className="px-4 py-3 font-mono text-[10px] max-w-[140px] truncate" title={row.slip_hash || ""}>
                      {row.slip_hash ? `${row.slip_hash.slice(0, 14)}…` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ReconBadge st={row.reconciliation_status} />
                    </td>
                    <td className="px-4 py-3">
                      {row.slip_url ? (
                        <button
                          type="button"
                          onClick={() => setEvidence({ url: row.slip_url!, hash: row.slip_hash })}
                          className="inline-flex items-center gap-1 text-indigo-600 font-bold text-xs hover:underline"
                        >
                          <Shield size={12} />
                          View evidence
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.status === "pending" ? (
                        <button
                          type="button"
                          disabled={paysoBusyId === row.id || paysoEnabled === false}
                          onClick={() => onPayViaPayso(row.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold hover:bg-teal-700 disabled:opacity-50"
                          title="Payso PromptPay (None-UI) — docs: api-docs.payso.co"
                        >
                          <Send size={12} />
                          {paysoBusyId === row.id ? "…" : "Pay via Payso"}
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => {
                          setReconcileModal({ id: row.id });
                          setReconcileReason("");
                        }}
                        className="text-xs font-bold text-indigo-600 hover:underline"
                      >
                        {busyId === row.id ? "…" : "Reconcile"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && items.length === 0 && !error && (
          <div className="p-8 text-center text-slate-500">ไม่มีรายการ</div>
        )}
      </div>

      {evidence && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-800 flex-wrap">
                <Hash size={18} className="text-indigo-600 shrink-0" />
                Slip evidence (SHA-256)
              </div>
              <button
                type="button"
                onClick={() => setEvidence(null)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">SHA-256 (full)</div>
                <code className="text-xs break-all text-slate-900 block select-all">{evidence.hash || "— (no hash yet)"}</code>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                <img
                  src={evidence.url}
                  alt="Transfer slip"
                  className="w-full max-h-[70vh] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <a
                href={evidence.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600"
              >
                Open in new tab <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {reconcileModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-800">Re-run reconciliation</h3>
            <p className="text-xs text-slate-500 font-mono break-all">ID: {reconcileModal.id}</p>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">Reason (required — audit)</label>
              <textarea
                value={reconcileReason}
                onChange={(e) => setReconcileReason(e.target.value)}
                rows={4}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Verified slip with bank notification; re-run after user re-uploaded."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setReconcileModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-bold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onReRun()}
                disabled={busyId === reconcileModal.id}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
