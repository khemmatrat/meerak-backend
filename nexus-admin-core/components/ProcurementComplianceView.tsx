import React, { useCallback, useEffect, useState } from "react";
import {
  downloadAdminProcurementComplianceCsv,
  downloadAdminProcurementComplianceJson,
  getAdminProcurementCompliance,
  type ProcurementComplianceItem,
} from "../services/adminApi";

type ComplianceStatus = "" | "has_winner" | "no_winner" | "negotiated";
type AgencyForm = "th_gov_procurement_v1" | "egp_v1";

export const ProcurementComplianceView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ComplianceStatus>("");
  const [agencyForm, setAgencyForm] = useState<AgencyForm>(
    "th_gov_procurement_v1",
  );
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProcurementComplianceItem[]>([]);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminProcurementCompliance({
        q: q.trim(),
        status,
        page,
        limit,
      });
      setItems(data.items || []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error("load procurement compliance failed:", err);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Search
            </label>
            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="job title / revision hash / reason"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as ComplianceStatus);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="has_winner">Has Winner</option>
              <option value="no_winner">No Winner</option>
              <option value="negotiated">Negotiated</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                await downloadAdminProcurementComplianceCsv({
                  q: q.trim(),
                  status,
                });
              } catch (err) {
                console.error("download compliance csv failed:", err);
              } finally {
                setDownloading(false);
              }
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {downloading ? "Exporting..." : "Export CSV"}
          </button>
          <select
            value={agencyForm}
            onChange={(e) => setAgencyForm(e.target.value as AgencyForm)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="th_gov_procurement_v1">
              Agency Form: TH GOV v1
            </option>
            <option value="egp_v1">Agency Form: eGP v1</option>
          </select>
          <button
            type="button"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                await downloadAdminProcurementComplianceJson({
                  q: q.trim(),
                  status,
                  agency_form: agencyForm,
                });
              } catch (err) {
                console.error("download compliance json failed:", err);
              } finally {
                setDownloading(false);
              }
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {downloading ? "Exporting..." : "Export JSON"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Job / Revision</th>
              <th className="px-3 py-2 text-left">Winner</th>
              <th className="px-3 py-2 text-left">Negotiation</th>
              <th className="px-3 py-2 text-left">AI Risk</th>
              <th className="px-3 py-2 text-left">Document Hash</th>
              <th className="px-3 py-2 text-left">Created At</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No records
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">
                      {row.job_title}
                    </div>
                    <div className="text-xs text-slate-500">
                      rev #{row.revision_no} · {row.category || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{row.winner_name || "-"}</div>
                    <div className="line-clamp-2 text-xs text-slate-500">
                      {row.winner_reason || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {row.price_before_negotiation != null
                      ? `${Number(row.price_before_negotiation).toLocaleString("th-TH")} -> ${Number(row.price_after_negotiation || 0).toLocaleString("th-TH")}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        (row.ai_risk_score || 0) >= 70
                          ? "bg-rose-100 text-rose-700"
                          : (row.ai_risk_score || 0) >= 40
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {row.ai_risk_score ?? 0}
                    </span>
                    <div className="mt-1 text-xs text-slate-500">
                      {(row.fraud_signals || []).join(", ") || "none"}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {(row.document_hash || "").slice(0, 16)}...
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString("th-TH")
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="text-slate-500">
          {total.toLocaleString("th-TH")} records
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
