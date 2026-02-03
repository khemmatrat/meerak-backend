/**
 * Phase 4C: Financial Dashboard — read-only.
 * Total wallets, total balances, ledger volume (by day/gateway), reconciliation run status.
 * ADMIN and AUDITOR can view; no balance mutation.
 */
import React, { useState, useEffect } from "react";
import {
  Wallet,
  DollarSign,
  TrendingUp,
  FileCheck,
  Loader2,
  BarChart3,
} from "lucide-react";
import { getFinancialDashboard, getAdminToken } from "../services/adminApi";
import type { FinancialDashboardResponse } from "../services/adminApi";

export const FinancialDashboardView: React.FC = () => {
  const [data, setData] = useState<FinancialDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const useBackend = !!getAdminToken();

  const fetchData = async () => {
    if (!useBackend) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getFinancialDashboard({ days });
      setData(res);
    } catch (e) {
      console.error("Financial dashboard error:", e);
      setData(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [useBackend, days]);

  if (!useBackend) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <Wallet size={48} className="mx-auto mb-4 text-slate-400" />
        <p>Financial Dashboard requires admin login (backend JWT).</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        Failed to load financial dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Financial Dashboard</h2>
        <p className="text-indigo-100">
          Read-only: wallets, balances, ledger volume, reconciliation status.
          No balance mutation.
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <label className="text-sm text-slate-600">Last</label>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10))}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Wallet size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">
              Total Wallets
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {data.total_wallets}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <DollarSign size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">
              Total Balances (THB)
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿{data.total_balances.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <BarChart3 size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">
              Ledger Entries (period)
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {data.ledger_volume.reduce((s, r) => s + r.entry_count, 0)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <FileCheck size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">
              Recon Runs
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {data.reconciliation_runs?.length ?? 0}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp size={18} /> Ledger Volume by Day / Gateway
          </h3>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Day</th>
                <th className="px-6 py-3 text-left font-semibold">Gateway</th>
                <th className="px-6 py-3 text-right font-semibold">Entries</th>
                <th className="px-6 py-3 text-right font-semibold">Net Volume (THB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.ledger_volume || []).map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3">{r.day}</td>
                  <td className="px-6 py-3">{r.gateway}</td>
                  <td className="px-6 py-3 text-right">{r.entry_count}</td>
                  <td className="px-6 py-3 text-right font-medium">
                    ฿{r.net_volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {(!data.ledger_volume || data.ledger_volume.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    No ledger data for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileCheck size={18} /> Reconciliation Runs
          </h3>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Run Date</th>
                <th className="px-6 py-3 text-left font-semibold">Gateway</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-right font-semibold">Matched</th>
                <th className="px-6 py-3 text-right font-semibold">Mismatch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.reconciliation_runs || []).map((r: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3">{r.run_date}</td>
                  <td className="px-6 py-3">{r.gateway}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === "matched"
                          ? "bg-emerald-100 text-emerald-700"
                          : r.status === "mismatch_found"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">{r.matched_count ?? 0}</td>
                  <td className="px-6 py-3 text-right">{r.mismatch_count ?? 0}</td>
                </tr>
              ))}
              {(!data.reconciliation_runs || data.reconciliation_runs.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No reconciliation runs
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
