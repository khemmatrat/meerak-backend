/**
 * Phase 3.5: Daily Reconciliation - Payment Ledger by Date
 */
import React, { useEffect, useState } from "react";
import {
  getReconciliationSummary,
  getLedgerEntriesByDate,
} from "../services/ledgerService";
import type { LedgerEntry } from "../types";
import {
  Calendar,
  FileText,
  DollarSign,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
} from "lucide-react";

export const Reconciliation: React.FC = () => {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof getReconciliationSummary>
  > | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        getReconciliationSummary(date),
        getLedgerEntriesByDate(date),
      ]);
      setSummary(s);
      setEntries(e);
    } catch (err) {
      console.error("Reconciliation load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const exportCSV = () => {
    const headers = [
      "id",
      "event_type",
      "payment_id",
      "gateway",
      "job_id",
      "amount",
      "currency",
      "status",
      "bill_no",
      "transaction_no",
      "created_at",
    ];
    const rows = entries.map((e) =>
      headers.map((h) => (e as any)[h] ?? "").join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `payment-ledger-${date}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-6">
          <FileText size={28} />
          Daily Reconciliation
        </h1>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <label className="flex items-center gap-2">
            <Calendar size={20} />
            <span className="text-sm font-medium text-gray-700">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            disabled={entries.length === 0}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        )}

        {!loading && summary && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                  Created
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {summary.total_created}
                </p>
                <p className="text-sm text-gray-600">
                  ฿{summary.total_amount_created.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow p-4 border border-green-100">
                <p className="text-xs text-green-600 uppercase font-medium mb-1 flex items-center gap-1">
                  <CheckCircle size={14} /> Completed
                </p>
                <p className="text-2xl font-bold text-green-700">
                  {summary.total_completed}
                </p>
                <p className="text-sm text-gray-600">
                  ฿{summary.total_amount_completed.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow p-4 border border-red-100">
                <p className="text-xs text-red-600 uppercase font-medium mb-1 flex items-center gap-1">
                  <XCircle size={14} /> Failed / Expired
                </p>
                <p className="text-2xl font-bold text-red-700">
                  {summary.total_failed}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                  Refunded
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {summary.total_refunded}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
              <h2 className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">
                Ledger entries ({entries.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-600">
                      <th className="px-4 py-2">Time</th>
                      <th className="px-4 py-2">Event</th>
                      <th className="px-4 py-2">Gateway</th>
                      <th className="px-4 py-2">Job ID</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Bill No</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr
                        key={e.id}
                        className="border-t border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-4 py-2 text-gray-600">
                          {e.created_at
                            ? new Date(e.created_at).toLocaleTimeString(
                                "th-TH",
                                { hour12: false },
                              )
                            : "-"}
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {e.event_type}
                        </td>
                        <td className="px-4 py-2">{e.gateway}</td>
                        <td
                          className="px-4 py-2 text-gray-600 truncate max-w-[120px]"
                          title={e.job_id}
                        >
                          {e.job_id}
                        </td>
                        <td className="px-4 py-2">
                          ฿{e.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              e.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : e.status === "failed" ||
                                    e.status === "expired"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{e.bill_no}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {entries.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No ledger entries for this date.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Reconciliation;
