/**
 * Financial Dashboard — ข้อมูลการเงินหลัก
 * KPIs: รายได้รวม, กำไรสุทธิ, ค่าใช้จ่าย, กำไรขั้นต้น, อัตรากำไร
 * แท็บ: ภาพรวม | ธุรกรรม | เงินประกันงาน | ค่าคอมมิชชั่น | ค่าใช้จ่าย
 * กราฟและตารางธุรกรรม (ฟิลเตอร์, ค้นหา, Export, Refresh)
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileCheck,
  Loader2,
  BarChart3,
  RefreshCw,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getFinancialDashboard,
  getFinancialAudit,
  getAdminToken,
} from "../services/adminApi";
import type {
  FinancialDashboardResponse,
  FinancialAuditTransactionRow,
} from "../services/adminApi";
import { JobGuaranteeSystem } from "./JobGuaranteeSystem";
import { InsuranceManager } from "./InsuranceManager";
import { CommissionRevenue } from "./CommissionRevenue";
import { RealTimeExpenses } from "./RealTimeExpenses";
import { MarketCapManager } from "./MarketCapManager";

type TabId =
  | "overview"
  | "transactions"
  | "job-guarantee"
  | "insurance"
  | "commission"
  | "expenses"
  | "market-cap";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "ภาพรวม" },
  { id: "transactions", label: "ธุรกรรม" },
  { id: "job-guarantee", label: "เงินประกันงาน" },
  { id: "insurance", label: "คลังประกัน (60/40)" },
  { id: "commission", label: "ค่าคอมมิชชั่น" },
  { id: "expenses", label: "ค่าใช้จ่าย" },
  { id: "market-cap", label: "หุ้นส่วน & Market Cap" },
];

const PAGE_SIZE = 10;

export const FinancialDashboardView: React.FC = () => {
  const [tab, setTab] = useState<TabId>("overview");
  const [data, setData] = useState<FinancialDashboardResponse | null>(null);
  const [auditData, setAuditData] = useState<{
    platform_balance: number;
    transactions: FinancialAuditTransactionRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [txPage, setTxPage] = useState(1);
  const [txTypeFilter, setTxTypeFilter] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const useBackend = !!getAdminToken();

  const fetchData = async () => {
    if (!useBackend) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [res, audit] = await Promise.all([
        getFinancialDashboard({ days }).catch(() => null),
        getFinancialAudit({ limit: 200 }).catch(() => null),
      ]);
      setData(res || null);
      setAuditData(
        audit
          ? {
              platform_balance: audit.platform_balance,
              transactions: audit.transactions || [],
            }
          : null
      );
    } catch (e) {
      console.error("Financial dashboard error:", e);
      setData(null);
      setAuditData(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [useBackend, days]);

  const totalRevenue = auditData?.platform_balance ?? data?.total_balances ?? 0;
  const totalExpenses = 0;
  const grossProfit = totalRevenue;
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin =
    totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0";

  const transactions = auditData?.transactions ?? [];
  const filteredTx = useMemo(() => {
    let list = [...transactions];
    if (txTypeFilter)
      list = list.filter((t) =>
        String(t.type).toLowerCase().includes(txTypeFilter.toLowerCase())
      );
    if (txStatusFilter)
      list = list.filter(
        (t) => String(t.status).toLowerCase() === txStatusFilter.toLowerCase()
      );
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.userId?.toLowerCase().includes(q) ||
          t.id?.toLowerCase().includes(q) ||
          t.note?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, txTypeFilter, txStatusFilter, txSearch]);

  const totalTxPages = Math.max(1, Math.ceil(filteredTx.length / PAGE_SIZE));
  const paginatedTx = useMemo(
    () => filteredTx.slice((txPage - 1) * PAGE_SIZE, txPage * PAGE_SIZE),
    [filteredTx, txPage]
  );

  const handleExportTransactions = () => {
    const header = "ID,User,Type,Amount,Status,FraudScore,Time,Note\n";
    const rows = filteredTx
      .map(
        (t) =>
          `${t.id},${t.userId},${t.type},${t.amount},${t.status},${
            t.fraudScore
          },${t.timestamp || ""},${t.note || ""}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!useBackend) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <Wallet size={48} className="mx-auto mb-4 text-slate-400" />
        <p>Financial Dashboard ต้องล็อกอิน Admin (Backend JWT)</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Financial Dashboard</h2>
        <p className="text-indigo-100">
          ข้อมูลการเงินหลัก • KPIs • ธุรกรรม • เงินประกันงาน • คลังประกัน (60/40) •
          ค่าคอมมิชชั่น • ค่าใช้จ่าย • ตั้งอัตราประกันแยกตามหมวดงานได้ที่เมนู &quot;จัดการประกันงาน (Insurance)&quot;
        </p>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh ทั้งหมด
          </button>
          <button
            onClick={handleExportTransactions}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-lg text-sm font-medium"
          >
            <Download size={16} /> Export รายงานธุรกรรม
          </button>
          <button
            onClick={() => setTab("transactions")}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-sm font-medium"
          >
            รายการธุรกรรมล่าสุด
          </button>
          <button
            onClick={() => setTab("job-guarantee")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-sm font-medium"
          >
            เงินประกันงาน
          </button>
          <button
            onClick={() => setTab("insurance")}
            className="flex items-center gap-2 px-4 py-2 bg-teal-100 hover:bg-teal-200 text-teal-800 rounded-lg text-sm font-medium"
          >
            คลังประกัน (60/40)
          </button>
          <button
            onClick={() => setTab("commission")}
            className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-medium"
          >
            ค่าคอมมิชชั่น
          </button>
          <button
            onClick={() => setTab("expenses")}
            className="flex items-center gap-2 px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-sm font-medium"
          >
            ค่าใช้จ่าย
          </button>
          <button
            onClick={() => setTab("market-cap")}
            className="flex items-center gap-2 px-4 py-2 bg-violet-100 hover:bg-violet-200 text-violet-800 rounded-lg text-sm font-medium"
          >
            หุ้นส่วน & Market Cap
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(tab === "overview" || tab === "transactions") && (
            <>
              <label className="text-sm text-slate-600">ช่วงเวลา</label>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value={7}>7 วัน</option>
                <option value={30}>30 วัน</option>
                <option value={90}>90 วัน</option>
              </select>
            </>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>
      </div>

      {tab === "job-guarantee" && <JobGuaranteeSystem />}
      {tab === "insurance" && <InsuranceManager />}
      {tab === "commission" && <CommissionRevenue />}
      {tab === "expenses" && <RealTimeExpenses />}
      {tab === "market-cap" && <MarketCapManager />}

      {tab === "overview" && (
        <>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={32} className="animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                      <TrendingUp size={20} />
                    </div>
                    <span className="text-sm font-medium text-slate-500">
                      ยอดรายได้รวม
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">
                    ฿
                    {Number(totalRevenue).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                      <DollarSign size={20} />
                    </div>
                    <span className="text-sm font-medium text-slate-500">
                      กำไรขั้นต้น
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">
                    ฿
                    {Number(grossProfit).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                      <TrendingDown size={20} />
                    </div>
                    <span className="text-sm font-medium text-slate-500">
                      ยอดค่าใช้จ่าย
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">
                    ฿
                    {Number(totalExpenses).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                      <Wallet size={20} />
                    </div>
                    <span className="text-sm font-medium text-slate-500">
                      กำไรสุทธิ
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">
                    ฿
                    {Number(netProfit).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                      <BarChart3 size={20} />
                    </div>
                    <span className="text-sm font-medium text-slate-500">
                      อัตรากำไร
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">
                    {profitMargin}%
                  </p>
                </div>
              </div>

              {/* Grid 2x2: Quick links to modules */}
              <div className="mt-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  โมดูลการเงิน
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    type="button"
                    onClick={() => setTab("commission")}
                    className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-left hover:border-emerald-200 hover:shadow-md transition-all"
                  >
                    <p className="text-sm font-bold text-slate-700 mb-2">
                      ค่าคอมมิชชั่น
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      รายได้จากค่าคอม • แยกตามประเภทงาน • ตั้งอัตรา
                    </p>
                    <span className="text-emerald-600 text-sm font-medium">
                      ดูทั้งหมด →
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("job-guarantee")}
                    className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-left hover:border-blue-200 hover:shadow-md transition-all"
                  >
                    <p className="text-sm font-bold text-slate-700 mb-2">
                      เงินประกันงาน
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      ติดตามเงินประกัน • ปล่อยอัตโนมัติ • สถานะ
                    </p>
                    <span className="text-blue-600 text-sm font-medium">
                      ดูทั้งหมด →
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("expenses")}
                    className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-left hover:border-amber-200 hover:shadow-md transition-all"
                  >
                    <p className="text-sm font-bold text-slate-700 mb-2">
                      ค่าใช้จ่ายเรียลไทม์
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      โดเมน • API • พัฒนา • การตลาด • งบประมาณ
                    </p>
                    <span className="text-amber-600 text-sm font-medium">
                      ดูทั้งหมด →
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("market-cap")}
                    className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-left hover:border-violet-200 hover:shadow-md transition-all"
                  >
                    <p className="text-sm font-bold text-slate-700 mb-2">
                      หุ้นส่วน & Market Cap
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      มูลค่าบริษัท • นักลงทุน • % ถือหุ้น
                    </p>
                    <span className="text-violet-600 text-sm font-medium">
                      ดูทั้งหมด →
                    </span>
                  </button>
                </div>
              </div>

              {data && (
                <>
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
                            <th className="px-6 py-3 text-left font-semibold">
                              Day
                            </th>
                            <th className="px-6 py-3 text-left font-semibold">
                              Gateway
                            </th>
                            <th className="px-6 py-3 text-right font-semibold">
                              Entries
                            </th>
                            <th className="px-6 py-3 text-right font-semibold">
                              Net Volume (THB)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(data.ledger_volume || []).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-6 py-3">{r.day}</td>
                              <td className="px-6 py-3">{r.gateway}</td>
                              <td className="px-6 py-3 text-right">
                                {r.entry_count}
                              </td>
                              <td className="px-6 py-3 text-right font-medium">
                                ฿
                                {r.net_volume.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))}
                          {(!data.ledger_volume ||
                            data.ledger_volume.length === 0) && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-6 py-8 text-center text-slate-400"
                              >
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
                            <th className="px-6 py-3 text-left font-semibold">
                              Run Date
                            </th>
                            <th className="px-6 py-3 text-left font-semibold">
                              Gateway
                            </th>
                            <th className="px-6 py-3 text-left font-semibold">
                              Status
                            </th>
                            <th className="px-6 py-3 text-right font-semibold">
                              Matched
                            </th>
                            <th className="px-6 py-3 text-right font-semibold">
                              Mismatch
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(data.reconciliation_runs || []).map(
                            (r: any, i: number) => (
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
                                <td className="px-6 py-3 text-right">
                                  {r.matched_count ?? 0}
                                </td>
                                <td className="px-6 py-3 text-right">
                                  {r.mismatch_count ?? 0}
                                </td>
                              </tr>
                            )
                          )}
                          {(!data.reconciliation_runs ||
                            data.reconciliation_runs.length === 0) && (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-6 py-8 text-center text-slate-400"
                              >
                                No reconciliation runs
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Recent transactions & Reports */}
              <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-800">
                    รายการธุรกรรมล่าสุด
                  </h3>
                  <button
                    onClick={() => setTab("transactions")}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    ดูทั้งหมด →
                  </button>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">
                          วันที่
                        </th>
                        <th className="px-4 py-2 text-left font-semibold">
                          ID / User
                        </th>
                        <th className="px-4 py-2 text-left font-semibold">
                          ประเภท
                        </th>
                        <th className="px-4 py-2 text-right font-semibold">
                          จำนวนเงิน
                        </th>
                        <th className="px-4 py-2 text-left font-semibold">
                          สถานะ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTx.slice(0, 5).map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 text-slate-600">
                            {t.timestamp
                              ? new Date(t.timestamp).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-4 py-2">
                            <p className="font-mono text-xs">{t.id}</p>
                            <p className="text-slate-500 text-xs">{t.userId}</p>
                          </td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                              {t.type}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-medium">
                            ฿{Number(t.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                t.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : t.status === "FLAGGED"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredTx.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-slate-400"
                          >
                            ไม่พบธุรกรรม
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t border-slate-100 bg-slate-50/30 flex flex-wrap gap-2">
                  <span className="text-xs text-slate-500">การรายงาน:</span>
                  <button
                    onClick={handleExportTransactions}
                    className="text-xs text-indigo-600 hover:underline font-medium"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "transactions" && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
              <h3 className="font-bold text-slate-800">รายการธุรกรรมล่าสุด</h3>
              <button
                onClick={handleExportTransactions}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                <Download size={16} /> Export
              </button>
            </div>
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[160px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="ค้นหา User, ID, Note..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-full"
                />
              </div>
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="">ทุกประเภท</option>
                <option value="fee">FEE</option>
                <option value="income">INCOME</option>
                <option value="payment">PAYMENT</option>
                <option value="withdrawal">WITHDRAWAL</option>
              </select>
              <select
                value={txStatusFilter}
                onChange={(e) => setTxStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="">ทุกสถานะ</option>
                <option value="completed">COMPLETED</option>
                <option value="pending">PENDING</option>
                <option value="flagged">FLAGGED</option>
                <option value="failed">FAILED</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">
                      วันที่
                    </th>
                    <th className="px-6 py-3 text-left font-semibold">
                      ID / User
                    </th>
                    <th className="px-6 py-3 text-left font-semibold">
                      ประเภท
                    </th>
                    <th className="px-6 py-3 text-right font-semibold">
                      จำนวนเงิน
                    </th>
                    <th className="px-6 py-3 text-left font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTx.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 text-slate-600">
                        {t.timestamp
                          ? new Date(t.timestamp).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-6 py-3">
                        <p className="font-mono text-slate-600">{t.id}</p>
                        <p className="text-slate-500">{t.userId}</p>
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-medium">
                          {t.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-medium">
                        ฿{Number(t.amount).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            t.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-700"
                              : t.status === "FLAGGED"
                              ? "bg-rose-100 text-rose-700"
                              : t.status === "PENDING"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {paginatedTx.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-slate-400"
                      >
                        ไม่พบธุรกรรม
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredTx.length > PAGE_SIZE && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  แสดง {(txPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(txPage * PAGE_SIZE, filteredTx.length)} จาก{" "}
                  {filteredTx.length}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={txPage <= 1}
                    onClick={() => setTxPage((p) => p - 1)}
                    className="p-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="py-2 px-3 text-sm font-medium text-slate-700">
                    หน้า {txPage} / {totalTxPages}
                  </span>
                  <button
                    disabled={txPage >= totalTxPages}
                    onClick={() => setTxPage((p) => p + 1)}
                    className="p-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
