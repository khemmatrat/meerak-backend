/**
 * Phase 4D: Audit Logs Viewer.
 * Browse financial_audit_log with filters: date range, entity_type, action, actor.
 * ADMIN and AUDITOR can view; RBAC enforced at route level.
 */
import React, { useState, useEffect } from "react";
import { FileText, Loader2, Search, X } from "lucide-react";
import { getAuditLogs, getAdminToken } from "../services/adminApi";
import type { AuditLogRow } from "../services/adminApi";

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const useBackend = !!getAdminToken();

  const fetchLogs = async () => {
    if (!useBackend) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getAuditLogs({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        entity_type: entityType || undefined,
        action: action || undefined,
        actor_id: actorId || undefined,
        limit: 500,
      });
      setLogs(res.logs || []);
    } catch (e) {
      console.error("Audit logs error:", e);
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [useBackend]);

  if (!useBackend) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <FileText size={48} className="mx-auto mb-4 text-slate-400" />
        <p>Audit Logs require admin login (backend JWT).</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Audit Logs</h2>
        <p className="text-indigo-100">
          Browse financial_audit_log. Filter by date range, entity type, action,
          actor.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Search size={18} /> Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              From date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              To date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Entity type
            </label>
            <input
              type="text"
              placeholder="e.g. kyc, user_roles"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Action
            </label>
            <input
              type="text"
              placeholder="e.g. role_change, kyc_approve"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Actor ID
            </label>
            <input
              type="text"
              placeholder="actor_id"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            Search
          </button>
          <button
            onClick={() => {
              setFromDate("");
              setToDate("");
              setEntityType("");
              setAction("");
              setActorId("");
            }}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
          >
            <X size={16} /> Clear
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">Logs</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Time</th>
                  <th className="px-6 py-3 text-left font-semibold">Actor</th>
                  <th className="px-6 py-3 text-left font-semibold">Action</th>
                  <th className="px-6 py-3 text-left font-semibold">Entity</th>
                  <th className="px-6 py-3 text-left font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-mono text-xs">
                        {log.actor_type}/{log.actor_id ?? "-"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-mono text-xs">
                        {log.entity_type}/{log.entity_id}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-600 max-w-xs truncate">
                      {log.reason ?? "-"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-slate-400"
                    >
                      No audit logs match the filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
