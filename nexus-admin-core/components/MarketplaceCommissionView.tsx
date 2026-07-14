/**
 * Marketplace Commission — admin-only storefront escrow ledger (2.2% default).
 * Accrued vs released totals, period buckets, per-order audit, CSV export.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Download,
  Loader2,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  downloadMarketplaceCommissionCsv,
  getMarketplaceCommissionOrders,
  getMarketplaceCommissionSummary,
  type MarketplaceCommissionOrderRow,
  type MarketplaceCommissionSummary,
} from "../services/adminApi";

const CARD =
  "bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow";

function microToThb(micro: number): string {
  const thb = micro / 1_000_000;
  return "฿" + thb.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export const MarketplaceCommissionView: React.FC = () => {
  const [dates, setDates] = useState(defaultDates);
  const [group, setGroup] = useState<"day" | "week" | "month">("day");
  const [statusFilter, setStatusFilter] = useState<"" | "accrued" | "released">("");
  const [summary, setSummary] = useState<MarketplaceCommissionSummary | null>(null);
  const [orders, setOrders] = useState<MarketplaceCommissionOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromIso = dates.from ? new Date(`${dates.from}T00:00:00.000Z`).toISOString() : undefined;
      const toIso = dates.to ? new Date(`${dates.to}T23:59:59.999Z`).toISOString() : undefined;
      const [sum, ord] = await Promise.all([
        getMarketplaceCommissionSummary({ from: fromIso, to: toIso, group }),
        getMarketplaceCommissionOrders({
          from: fromIso,
          to: toIso,
          status: statusFilter || undefined,
          limit: 100,
        }),
      ]);
      setSummary(sum);
      setOrders(ord.orders || []);
      setTotal(ord.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load commission data");
      setSummary(null);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [dates.from, dates.to, group, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const onExport = async () => {
    setExporting(true);
    try {
      const fromIso = dates.from ? new Date(`${dates.from}T00:00:00.000Z`).toISOString() : undefined;
      const toIso = dates.to ? new Date(`${dates.to}T23:59:59.999Z`).toISOString() : undefined;
      await downloadMarketplaceCommissionCsv({
        from: fromIso,
        to: toIso,
        status: statusFilter || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const t = summary?.totals;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Marketplace Commission</h2>
          <p className="text-sm text-slate-500 mt-1">
            ค่าคอมมิชชั่นร้านค้า (default {(summary?.commission_rate_default ?? 0.022) * 100}%)
            — admin เท่านั้น
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dates.from}
            onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={dates.to}
            onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as "day" | "week" | "month")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="day">รายวัน</option>
            <option value="week">รายสัปดาห์</option>
            <option value="month">รายเดือน</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "accrued" | "released")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">ทุกสถานะ</option>
            <option value="accrued">ค้าง (accrued)</option>
            <option value="released">รับแล้ว (released)</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
          <button
            onClick={onExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm">{error}</div>
      )}

      {loading && !summary ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className={`${CARD} border-emerald-100`}>
              <p className="text-sm text-slate-500">Commission รับแล้ว (released)</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                {microToThb(t?.released_commission_micro ?? 0)}
              </p>
              <p className="text-xs text-slate-400 mt-2">{t?.released_order_count ?? 0} orders</p>
              <Wallet className="mt-3 text-emerald-500" size={22} />
            </div>
            <div className={`${CARD} border-amber-100`}>
              <p className="text-sm text-slate-500">Commission ค้าง (accrued)</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">
                {microToThb(t?.accrued_commission_micro ?? 0)}
              </p>
              <p className="text-xs text-slate-400 mt-2">{t?.accrued_order_count ?? 0} orders</p>
              <TrendingUp className="mt-3 text-amber-500" size={22} />
            </div>
            <div className={`${CARD} border-blue-100`}>
              <p className="text-sm text-slate-500">Gross GMV (ช่วงที่เลือก)</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{microToThb(t?.gross_micro ?? 0)}</p>
              <ShoppingBag className="mt-3 text-blue-500" size={22} />
            </div>
            <div className={CARD}>
              <p className="text-sm text-slate-500">Backend</p>
              <p className="text-lg font-semibold text-slate-800 mt-1">{summary?.backend ?? "—"}</p>
            </div>
          </div>

          {summary?.buckets?.length ? (
            <div className={CARD}>
              <h3 className="font-semibold text-slate-800 mb-4">ช่วงเวลา ({group})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4">Bucket</th>
                      <th className="py-2 pr-4">Released</th>
                      <th className="py-2 pr-4">Accrued</th>
                      <th className="py-2 pr-4">Gross</th>
                      <th className="py-2">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.buckets.map((b) => (
                      <tr key={b.bucket} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-mono text-xs">{b.bucket}</td>
                        <td className="py-2 pr-4">{microToThb(b.released_commission_micro)}</td>
                        <td className="py-2 pr-4">{microToThb(b.accrued_commission_micro)}</td>
                        <td className="py-2 pr-4">{microToThb(b.gross_micro)}</td>
                        <td className="py-2">{b.order_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className={CARD}>
            <h3 className="font-semibold text-slate-800 mb-4">
              Audit trail — {total} order{total === 1 ? "" : "s"}
            </h3>
            {orders.length === 0 ? (
              <p className="text-slate-500 text-sm py-6 text-center">ไม่มีรายการในช่วงที่เลือก</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-3">Order</th>
                      <th className="py-2 pr-3">Merchant</th>
                      <th className="py-2 pr-3">Gross</th>
                      <th className="py-2 pr-3">Rate</th>
                      <th className="py-2 pr-3">Commission</th>
                      <th className="py-2 pr-3">Net</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-mono text-xs">{row.order_id}</td>
                        <td className="py-2 pr-3 text-xs">{row.merchant_id}</td>
                        <td className="py-2 pr-3">{microToThb(row.gross_amount_micro)}</td>
                        <td className="py-2 pr-3">{(row.commission_rate * 100).toFixed(2)}%</td>
                        <td className="py-2 pr-3">{microToThb(row.commission_micro)}</td>
                        <td className="py-2 pr-3">{microToThb(row.net_amount_micro)}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={
                              row.status === "released"
                                ? "text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded"
                                : "text-amber-700 bg-amber-50 px-2 py-0.5 rounded"
                            }
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-slate-500">
                          {row.created_at ? new Date(row.created_at).toLocaleString("th-TH") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
