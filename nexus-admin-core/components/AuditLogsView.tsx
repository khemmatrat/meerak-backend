/**
 * Audit Logs — Admin-Only. Search & Filter, DataTable, Expandable Diff (JSON Beautifier), Pagination.
 * Role Badges (ADMIN=red, USER=blue, SYSTEM=gray). Link to Entity (User/KYC etc).
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Loader2,
  Search,
  X,
  User,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { getAuditLogs, getAdminToken } from "../services/adminApi";
import type { AuditLogRow } from "../services/adminApi";

const PAGE_SIZES = [25, 50, 100, 200] as const;

/** Badge สีตาม actor_role: ADMIN=แดงอ่อน, USER=ฟ้า, SYSTEM=เทา */
function RoleBadge({ role }: { role: string }) {
  const r = (role || "").toUpperCase();
  const styles: Record<string, string> = {
    ADMIN: "bg-red-100 text-red-800 border border-red-200",
    USER: "bg-blue-100 text-blue-800 border border-blue-200",
    SYSTEM: "bg-slate-100 text-slate-700 border border-slate-300",
  };
  const s = styles[r] || "bg-slate-100 text-slate-600 border border-slate-200";
  return (
    <span className={`ml-1 px-2 py-0.5 rounded text-xs font-medium ${s}`}>
      {role || "—"}
    </span>
  );
}

/** JSON Diff Beautifier: แสดง changes.old (แดง) และ changes.new (เขียว) แบบอ่านง่าย */
function JsonDiffBeautifier({
  oldVal,
  newVal,
}: {
  oldVal: Record<string, unknown> | null | undefined;
  newVal: Record<string, unknown> | null | undefined;
}) {
  const o = oldVal && typeof oldVal === "object" ? oldVal : {};
  const n = newVal && typeof newVal === "object" ? newVal : {};
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)]));

  function renderValue(val: unknown): React.ReactNode {
    if (val === null) return <span className="text-slate-400">null</span>;
    if (val === undefined) return <span className="text-slate-400">—</span>;
    if (typeof val === "object" && !Array.isArray(val) && val !== null) {
      return (
        <span className="inline-block pl-2 border-l-2 border-slate-200">
          {Object.entries(val as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-slate-500 shrink-0">{k}:</span>
              {renderValue(v)}
            </div>
          ))}
        </span>
      );
    }
    if (Array.isArray(val)) {
      return <span className="text-xs">[{val.map((v, i) => <span key={i}>{i ? ", " : ""}{String(v)}</span>)}]</span>;
    }
    return <span>{String(val)}</span>;
  }

  if (keys.length === 0) {
    return <span className="text-slate-400 text-sm">No changes</span>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
        <div className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Removed / Old</div>
        <div className="space-y-1.5 text-red-800">
          {keys.map((k) => {
            const ov = o[k];
            const nv = n[k];
            if (ov === undefined && nv !== undefined) return null;
            if (JSON.stringify(ov) === JSON.stringify(nv)) return null;
            return (
              <div key={k} className="flex flex-wrap gap-x-1 gap-y-0.5">
                <span className="text-red-600 shrink-0">{k}:</span>
                {ov !== undefined ? renderValue(ov) : <span className="italic text-red-400">—</span>}
              </div>
            );
          })}
          {keys.every((k) => o[k] === undefined) && <span className="text-red-500/80">—</span>}
        </div>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Added / New</div>
        <div className="space-y-1.5 text-emerald-800">
          {keys.map((k) => {
            const ov = o[k];
            const nv = n[k];
            if (nv === undefined && ov !== undefined) return null;
            if (JSON.stringify(ov) === JSON.stringify(nv)) return null;
            return (
              <div key={k} className="flex flex-wrap gap-x-1 gap-y-0.5">
                <span className="text-emerald-600 shrink-0">{k}:</span>
                {nv !== undefined ? renderValue(nv) : <span className="italic text-emerald-400">—</span>}
              </div>
            );
          })}
          {keys.every((k) => n[k] === undefined) && <span className="text-emerald-500/80">—</span>}
        </div>
      </div>
    </div>
  );
}

/** Entity ที่กดแล้วโดดไปหน้าจัดการ (users, kyc-review ฯลฯ) — ถ้า users ใช้ onNavigateToEntity เพื่อโฟกัส user นั้น */
function EntityLink({
  entityName,
  entityId,
  setView,
  onNavigateToEntity,
}: {
  entityName: string;
  entityId: string;
  setView?: (view: string) => void;
  onNavigateToEntity?: (view: string, entityId: string) => void;
}) {
  const name = entityName || "";
  const id = entityId || "";
  const viewMap: Record<string, string> = {
    users: "users",
    user_roles: "users",
    jobs: "job-ops",
    kyc: "kyc-review",
    wallets: "financial-dashboard",
  };
  const view = viewMap[name.toLowerCase()];
  const canNavigate = view && id && (setView || onNavigateToEntity);

  if (!canNavigate) {
    return (
      <span className="font-mono text-xs text-slate-700">
        {name}/{id}
      </span>
    );
  }
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigateToEntity) onNavigateToEntity(view, id);
    else setView?.(view);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="font-mono text-xs text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
      title={view === "users" ? `Go to User Management & open user ${id}` : `Go to ${view}`}
    >
      {name}/{id}
      <ExternalLink size={12} />
    </button>
  );
}

interface AuditLogsViewProps {
  /** เฉพาะ ADMIN ถึงจะเข้าหน้านี้ได้ */
  currentUserRole?: string;
  /** สำหรับ Link to Entity — โดดไปหน้าจัดการ User / KYC ฯลฯ */
  setView?: (view: string) => void;
  /** เมื่อกด entity (เช่น users/xyz) เรียก (view, entityId) — ใช้โฟกัส user ใน User Management */
  onNavigateToEntity?: (view: string, entityId: string) => void;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ currentUserRole, setView, onNavigateToEntity }) => {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const useBackend = !!getAdminToken();

  const isAdmin = (currentUserRole || "").toUpperCase() === "ADMIN";

  const fetchLogs = useCallback(async () => {
    if (!useBackend || !isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const res = await getAuditLogs({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        entity_type: entityType || undefined,
        action: action || undefined,
        actor_id: actorId || undefined,
        limit: pageSize,
        offset,
      });
      setLogs(res.logs || []);
      setTotal(res.total ?? res.logs?.length ?? 0);
    } catch (e) {
      console.error("Audit logs error:", e);
      setLogs([]);
      setTotal(0);
    }
    setLoading(false);
  }, [useBackend, isAdmin, page, pageSize, fromDate, toDate, entityType, action, actorId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Admin-Only: ตรวจสอบสิทธิ์ฝั่ง Frontend
  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <ShieldAlert size={48} className="mx-auto mb-4 text-amber-600" />
        <h3 className="text-lg font-semibold text-amber-900 mb-2">Access Denied</h3>
        <p className="text-amber-800">
          This page is for <strong>ADMIN</strong> only. Your role: <strong>{currentUserRole || "—"}</strong>.
        </p>
        <p className="text-sm text-amber-700 mt-2">Contact an administrator if you need access.</p>
      </div>
    );
  }

  if (!useBackend) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <FileText size={48} className="mx-auto mb-4 text-slate-400" />
        <p>Audit Logs require backend login (JWT). Set VITE_ADMIN_API_URL and sign in again.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Audit Logs</h2>
        <p className="text-indigo-100">
          Search & filter by date range, entity type, action, and actor_id. Expand a row to see Diff (old → new). Paginated for performance.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Search size={18} /> Search & Filter
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Entity type</label>
            <input
              type="text"
              placeholder="e.g. users, user_roles"
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
            <input
              type="text"
              placeholder="e.g. role_change, user_suspend"
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
              <User size={14} /> Actor ID
            </label>
            <input
              type="text"
              placeholder="actor_id"
              value={actorId}
              onChange={(e) => { setActorId(e.target.value); setPage(1); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setPage(1); fetchLogs(); }}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
          <button
            onClick={() => {
              setFromDate("");
              setToDate("");
              setEntityType("");
              setAction("");
              setActorId("");
              setPage(1);
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
          >
            <X size={16} /> Clear
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800">DataTable</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Timestamp, Actor (Role Badge), Action, Entity, Status. Click row to expand Diff (Red = old, Green = new). IP in expanded row.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Rows per page
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <span className="text-sm text-slate-500">
              Showing {start}–{end} of {total}
            </span>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold w-40">Timestamp</th>
                    <th className="px-4 py-3 text-left font-semibold">Actor (Role)</th>
                    <th className="px-4 py-3 text-left font-semibold">Action</th>
                    <th className="px-4 py-3 text-left font-semibold">Entity</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id;
                    const hasChanges =
                      (log.changes && (Object.keys(log.changes?.old || {}).length > 0 || Object.keys(log.changes?.new || {}).length > 0)) ||
                      (log.state_before != null || log.state_after != null);
                    return (
                      <React.Fragment key={String(log.id)}>
                        <tr
                          className={"hover:bg-slate-50/50 " + (hasChanges ? "cursor-pointer" : "")}
                          onClick={() => hasChanges && setExpandedId(isExpanded ? null : log.id)}
                        >
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs">{log.actor_id ?? "—"}</span>
                            <RoleBadge role={log.actor_role || log.actor_type || ""} />
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <EntityLink
                              entityName={log.entity_name || log.entity_type || ""}
                              entityId={log.entity_id}
                              setView={setView}
                              onNavigateToEntity={onNavigateToEntity}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {log.status ? (
                              <span
                                className={
                                  log.status === "Failed"
                                    ? "text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-xs"
                                    : "text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-xs"
                                }
                              >
                                {log.status}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {hasChanges && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                          </td>
                        </tr>
                        {isExpanded && hasChanges && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={6} className="px-4 py-3 border-t border-slate-100">
                              <div className="flex items-start gap-4 flex-wrap">
                                <div className="flex-1 min-w-[280px]">
                                  <span className="text-xs font-medium text-slate-500 block mb-2">JSON Diff — Red = removed/old, Green = added/new</span>
                                  <JsonDiffBeautifier
                                    oldVal={(log.changes && log.changes.old) || (log.state_before as Record<string, unknown>) || undefined}
                                    newVal={(log.changes && log.changes.new) || (log.state_after as Record<string, unknown>) || undefined}
                                  />
                                </div>
                                {log.ip_address && (
                                  <div className="text-xs text-slate-500">IP: <span className="font-mono">{log.ip_address}</span></div>
                                )}
                                {log.reason && (
                                  <div className="text-xs text-slate-500">
                                    <span className="font-medium">Reason:</span> {log.reason}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {logs.length === 0 && (
              <div className="py-12 text-center text-slate-400 border-t border-slate-100">
                No audit logs found. Try adjusting filters or date range.
              </div>
            )}
            {total > 0 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
