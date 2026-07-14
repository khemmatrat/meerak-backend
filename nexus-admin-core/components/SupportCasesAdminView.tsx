import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LifeBuoy,
  RefreshCw,
  Loader2,
  UserCheck,
  XCircle,
  ChevronRight,
  Clock,
  Zap,
  Download,
} from "lucide-react";
import {
  getAdminSupportCases,
  getAdminSupportCaseDetail,
  getAdminSupportCaseSla,
  getSupportCaseAutoAssignStatus,
  runSupportCaseAutoAssign,
  runSupportCaseSlaNudge,
  runOpsWeeklyDigest,
  assignAdminSupportCase,
  closeAdminSupportCase,
  downloadSupportCaseAuditBundleJson,
  downloadSupportCaseAuditBundleCsv,
  type AdminSupportCaseRow,
  type AdminSupportCaseEvent,
  type AdminSupportCaseSla,
  type SupportCaseAutoAssignConfig,
} from "../services/adminApi";

const AUTO_ASSIGN_ON_LOAD_KEY = "support_case_auto_assign_on_load";

interface SupportCasesAdminViewProps {
  onOpenUser?: (userId: string) => void;
  initialCaseId?: string | null;
  onInitialCaseConsumed?: () => void;
}

const STATUS_OPTIONS = ["", "open", "pending", "resolved", "closed"];

export const SupportCasesAdminView: React.FC<SupportCasesAdminViewProps> = ({
  onOpenUser,
  initialCaseId = null,
  onInitialCaseConsumed,
}) => {
  const [cases, setCases] = useState<AdminSupportCaseRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminSupportCaseRow | null>(null);
  const [history, setHistory] = useState<AdminSupportCaseEvent[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [resolution, setResolution] = useState("");
  const [acting, setActing] = useState(false);
  const [sla, setSla] = useState<AdminSupportCaseSla | null>(null);
  const [slaLoading, setSlaLoading] = useState(false);
  const [autoAssignConfig, setAutoAssignConfig] =
    useState<SupportCaseAutoAssignConfig | null>(null);
  const [autoAssignRunning, setAutoAssignRunning] = useState(false);
  const [autoAssignOnLoad, setAutoAssignOnLoad] = useState(
    () => localStorage.getItem(AUTO_ASSIGN_ON_LOAD_KEY) === "1",
  );
  const [exportingAudit, setExportingAudit] = useState(false);
  const [slaNudgeRunning, setSlaNudgeRunning] = useState(false);
  const [digestRunning, setDigestRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminSupportCases({
        status: statusFilter || undefined,
        limit: 80,
      });
      setCases(res.cases || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadSla = useCallback(async () => {
    setSlaLoading(true);
    try {
      const [slaRes, cfgRes] = await Promise.all([
        getAdminSupportCaseSla(),
        getSupportCaseAutoAssignStatus().catch(() => null),
      ]);
      setSla(slaRes.sla);
      setAutoAssignConfig(cfgRes?.auto_assign ?? null);
    } catch {
      setSla(null);
    } finally {
      setSlaLoading(false);
    }
  }, []);

  const handleRunAutoAssign = useCallback(
    async (silent = false) => {
      setAutoAssignRunning(true);
      try {
        const res = await runSupportCaseAutoAssign({ limit: 50 });
        if (res.error === "disabled") {
          if (!silent) {
            alert(
              "Auto-assign ปิดอยู่ — ตั้ง SUPPORT_CASE_AUTO_ASSIGN=1 และ OPS_QUEUE / ROUND_ROBIN บน server",
            );
          }
          return;
        }
        await load();
        await loadSla();
        if (!silent) {
          alert(
            `Auto-assign เสร็จ: ${res.assigned} case(s), ข้าม ${res.skipped}`,
          );
        }
      } catch (e) {
        if (!silent) {
          alert(e instanceof Error ? e.message : "Auto-assign ล้มเหลว");
        }
      } finally {
        setAutoAssignRunning(false);
      }
    },
    [load, loadSla],
  );

  const autoAssignRanRef = useRef(false);
  useEffect(() => {
    if (
      !autoAssignOnLoad ||
      !autoAssignConfig?.enabled ||
      autoAssignRanRef.current
    )
      return;
    if (!sla?.counts?.unassigned_priority) return;
    autoAssignRanRef.current = true;
    handleRunAutoAssign(true);
  }, [
    autoAssignOnLoad,
    autoAssignConfig?.enabled,
    sla?.counts?.unassigned_priority,
    handleRunAutoAssign,
  ]);

  useEffect(() => {
    load();
    loadSla();
  }, [load, loadSla]);

  useEffect(() => {
    if (!initialCaseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminSupportCaseDetail(initialCaseId);
        if (cancelled) return;
        const c = res.case as AdminSupportCaseRow;
        setSelected(c);
        setHistory(res.history || []);
        setAssignTo(c.assigned_to || "");
        setStatusFilter("");
      } catch {
        /* ignore invalid deep link */
      } finally {
        if (!cancelled) onInitialCaseConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCaseId, onInitialCaseConsumed]);

  async function openDetail(c: AdminSupportCaseRow) {
    setSelected(c);
    setAssignTo(c.assigned_to || "");
    setResolution("");
    try {
      const res = await getAdminSupportCaseDetail(c.case_id);
      setSelected(res.case as AdminSupportCaseRow);
      setHistory(res.history || []);
    } catch {
      setHistory([]);
    }
  }

  async function handleAssign() {
    if (!selected || !assignTo.trim()) return;
    setActing(true);
    try {
      await assignAdminSupportCase(selected.case_id, assignTo.trim());
      await load();
      await openDetail({ ...selected, assigned_to: assignTo.trim() });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Assign ไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  }

  async function handleClose(resolved = false) {
    if (!selected) return;
    if (!window.confirm(resolved ? "Resolve case นี้?" : "ปิด case นี้?"))
      return;
    setActing(true);
    try {
      await closeAdminSupportCase(selected.case_id, {
        resolution: resolution.trim() || undefined,
        status: resolved ? "resolved" : "closed",
      });
      setSelected(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Close ไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 flex flex-col p-6 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <LifeBuoy className="h-6 w-6 text-sky-600" />
              Support Cases (MRK)
            </h1>
            <p className="text-sm text-slate-500">
              Assign, close, ประวัติ ticket — ผูกกับ user ใน User Management
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "ทั้งหมด"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              SLA Ops (24h stale · urgent/high unassigned)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAssignOnLoad}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAutoAssignOnLoad(on);
                    localStorage.setItem(
                      AUTO_ASSIGN_ON_LOAD_KEY,
                      on ? "1" : "0",
                    );
                  }}
                  className="rounded border-slate-300"
                />
                Auto-assign เมื่อเปิดหน้า
              </label>
              <button
                type="button"
                onClick={async () => {
                  setSlaNudgeRunning(true);
                  try {
                    const r = await runSupportCaseSlaNudge({ force: false });
                    alert(`SLA nudge: ส่ง ${r.sent} · ข้าม ${r.skipped}`);
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "SLA nudge ล้มเหลว");
                  } finally {
                    setSlaNudgeRunning(false);
                  }
                }}
                disabled={slaNudgeRunning}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
              >
                {slaNudgeRunning ? "…" : "SLA nudge"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("ส่ง Weekly Ops Digest?")) return;
                  setDigestRunning(true);
                  try {
                    const r = await runOpsWeeklyDigest({ force: true });
                    alert(r.sent ? "ส่ง digest แล้ว" : r.reason || "ยังไม่ส่ง");
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "Digest ล้มเหลว");
                  } finally {
                    setDigestRunning(false);
                  }
                }}
                disabled={digestRunning}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {digestRunning ? "…" : "Ops digest"}
              </button>
              <button
                type="button"
                onClick={() => handleRunAutoAssign(false)}
                disabled={autoAssignRunning || !autoAssignConfig?.enabled}
                title={
                  autoAssignConfig?.enabled
                    ? "urgent → ops queue, high → round-robin"
                    : "ตั้ง SUPPORT_CASE_AUTO_ASSIGN=1 บน server"
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
              >
                <Zap size={12} />
                {autoAssignRunning ? "…" : "Run auto-assign"}
              </button>
              <button
                type="button"
                onClick={loadSla}
                disabled={slaLoading}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                {slaLoading ? "กำลังโหลด…" : "รีเฟรช SLA"}
              </button>
            </div>
          </div>
          {autoAssignConfig && (
            <p className="text-[10px] text-slate-500 mb-2">
              Auto-assign:{" "}
              <span
                className={
                  autoAssignConfig.enabled
                    ? "text-emerald-700 font-semibold"
                    : "text-slate-400"
                }
              >
                {autoAssignConfig.enabled ? "เปิด" : "ปิด"}
              </span>
              {autoAssignConfig.ops_queue
                ? ` · urgent → ${autoAssignConfig.ops_queue}`
                : ""}
              {autoAssignConfig.round_robin?.length
                ? ` · high RR: ${autoAssignConfig.round_robin.length} คน`
                : ""}
            </p>
          )}
          {sla ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] uppercase text-slate-500">
                    Open queue
                  </p>
                  <p className="text-xl font-bold text-slate-900">
                    {sla.counts.open_total}
                  </p>
                  {sla.counts.open_urgent != null &&
                  sla.counts.open_urgent > 0 ? (
                    <p className="text-[10px] text-red-600">
                      {sla.counts.open_urgent} urgent
                    </p>
                  ) : null}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 ${
                    sla.counts.open_stale_24h > 0
                      ? "bg-red-50 border border-red-200"
                      : "bg-emerald-50"
                  }`}
                >
                  <p className="text-[10px] uppercase text-slate-500">
                    Stale &gt;24h
                  </p>
                  <p className="text-xl font-bold">
                    {sla.counts.open_stale_24h}
                  </p>
                </div>
                <div
                  className={`rounded-lg px-3 py-2 ${
                    sla.counts.unassigned_priority > 0
                      ? "bg-amber-50 border border-amber-200"
                      : "bg-slate-50"
                  }`}
                >
                  <p className="text-[10px] uppercase text-slate-500">
                    Unassigned urgent/high
                  </p>
                  <p className="text-xl font-bold">
                    {sla.counts.unassigned_priority}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] uppercase text-slate-500">
                    Avg 30d (assign / close)
                  </p>
                  <p className="text-sm font-bold mt-1">
                    {sla.averages_30d.hours_to_assign != null
                      ? `${sla.averages_30d.hours_to_assign}h`
                      : "—"}{" "}
                    /{" "}
                    {sla.averages_30d.hours_to_close != null
                      ? `${sla.averages_30d.hours_to_close}h`
                      : "—"}
                  </p>
                </div>
              </div>
              {(sla.unassigned_urgent_cases?.length > 0 ||
                sla.stale_open_cases?.length > 0) && (
                <div className="mt-3 grid md:grid-cols-2 gap-3 text-xs">
                  {sla.unassigned_urgent_cases?.length > 0 ? (
                    <div>
                      <p className="font-semibold text-amber-800 mb-1">
                        ต้อง assign ด่วน
                      </p>
                      <ul className="space-y-1 max-h-28 overflow-auto">
                        {sla.unassigned_urgent_cases.slice(0, 8).map((c) => (
                          <li key={c.case_id}>
                            <button
                              type="button"
                              className="text-left hover:underline text-amber-900"
                              onClick={() => openDetail(c)}
                            >
                              {c.case_id} · {c.priority} ·{" "}
                              {c.user_name || c.user_email || "—"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {sla.stale_open_cases?.length > 0 ? (
                    <div>
                      <p className="font-semibold text-red-800 mb-1">
                        ค้างเกิน 24 ชม.
                      </p>
                      <ul className="space-y-1 max-h-28 overflow-auto">
                        {sla.stale_open_cases.slice(0, 8).map((c) => (
                          <li key={c.case_id}>
                            <button
                              type="button"
                              className="text-left hover:underline text-red-900"
                              onClick={() => openDetail(c)}
                            >
                              {c.case_id} ·{" "}
                              {c.age_hours != null ? `${c.age_hours}h` : "—"} ·{" "}
                              {c.user_name || c.user_email || "—"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : slaLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-slate-400 h-5 w-5" />
            </div>
          ) : (
            <p className="text-xs text-slate-500">โหลด SLA ไม่ได้</p>
          )}
        </div>

        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
          {loading && cases.length === 0 ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-slate-400" />
            </div>
          ) : cases.length === 0 ? (
            <p className="p-8 text-sm text-slate-500 text-center">ไม่มี case</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">Case ID</th>
                  <th className="text-left px-4 py-2">User</th>
                  <th className="text-left px-4 py-2">Subject</th>
                  <th className="text-left px-4 py-2">Priority</th>
                  <th className="text-left px-4 py-2">Assigned</th>
                  <th className="text-left px-4 py-2">Updated</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.case_id}
                    className={`border-t cursor-pointer hover:bg-sky-50 ${
                      selected?.case_id === c.case_id ? "bg-sky-50" : ""
                    }`}
                    onClick={() => openDetail(c)}
                  >
                    <td className="px-4 py-2 font-mono text-xs font-bold">
                      {c.case_id}
                    </td>
                    <td className="px-4 py-2">
                      <div className="truncate max-w-[140px]">
                        {c.user_name || c.user_email || c.user_id?.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-2 truncate max-w-[180px]">
                      {c.subject || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          c.priority === "urgent"
                            ? "bg-red-100 text-red-800"
                            : c.priority === "high"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {c.assigned_to || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {c.updated_at
                        ? new Date(c.updated_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-2">
                      <ChevronRight size={14} className="text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <aside className="w-full max-w-md border-l border-slate-200 bg-slate-50 flex flex-col shrink-0">
          <div className="p-4 border-b bg-white flex items-start justify-between gap-2">
            <div>
              <p className="font-mono font-bold text-sky-800">
                {selected.case_id}
              </p>
              <p className="text-xs text-slate-500 mt-1 capitalize">
                {selected.status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <XCircle size={20} />
            </button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="text-sm">
              <p className="font-medium">{selected.subject || "—"}</p>
              <p className="text-xs text-slate-500 mt-1">
                เปิดโดย {selected.opened_by || "—"} ·{" "}
                {selected.created_at
                  ? new Date(selected.created_at).toLocaleString()
                  : ""}
              </p>
              {selected.user_id && onOpenUser && (
                <button
                  type="button"
                  onClick={() => onOpenUser(selected.user_id!)}
                  className="mt-2 text-xs text-indigo-600 underline"
                >
                  เปิด User Management
                </button>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  disabled={exportingAudit}
                  onClick={async () => {
                    setExportingAudit(true);
                    try {
                      await downloadSupportCaseAuditBundleJson(
                        selected.case_id,
                      );
                    } catch (e) {
                      alert(
                        e instanceof Error ? e.message : "Export JSON ล้มเหลว",
                      );
                    } finally {
                      setExportingAudit(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Download size={12} />
                  Audit bundle JSON
                </button>
                <button
                  type="button"
                  disabled={exportingAudit}
                  onClick={async () => {
                    setExportingAudit(true);
                    try {
                      await downloadSupportCaseAuditBundleCsv(selected.case_id);
                    } catch (e) {
                      alert(
                        e instanceof Error ? e.message : "Export CSV ล้มเหลว",
                      );
                    } finally {
                      setExportingAudit(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  <Download size={12} />
                  Audit bundle CSV
                </button>
              </div>
            </div>

            {!["closed", "resolved"].includes(selected.status) && (
              <div className="space-y-2 bg-white rounded-lg border p-3">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <UserCheck size={14} /> Assign to
                </label>
                <input
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  placeholder="email แอดมิน"
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={acting || !assignTo.trim()}
                  onClick={handleAssign}
                  className="w-full py-1.5 rounded bg-sky-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  Assign
                </button>
                <label className="text-xs font-bold text-slate-500 block pt-2">
                  Resolution note
                </label>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={2}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="สรุปการแก้ไข (optional)"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => handleClose(true)}
                    className="flex-1 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => handleClose(false)}
                    className="flex-1 py-1.5 rounded bg-slate-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                <Clock size={14} /> ประวัติ ticket
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-slate-400">
                  ยังไม่มี event (migration 230)
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((ev) => (
                    <li
                      key={ev.id}
                      className="text-xs bg-white border rounded px-2 py-1.5"
                    >
                      <span className="font-bold capitalize">
                        {ev.event_type}
                      </span>
                      {ev.actor && (
                        <span className="text-slate-500"> · {ev.actor}</span>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(ev.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};
