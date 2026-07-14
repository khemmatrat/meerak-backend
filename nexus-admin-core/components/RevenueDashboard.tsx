/**
 * Revenue Dashboard — Financial Analytics สำหรับเจ้าของแพลตฟอร์ม
 * เชื่อมโยง Booking + Advance Jobs: รายได้รวม, เงินถือครอง, จำนวนจองสำเร็จ, งาน Advance ที่ยังไม่จบ
 * + ตาราง Revenue Stream ล่าสุด 10 รายการ
 */
import React, { useState, useEffect } from "react";
import {
  Wallet,
  Landmark,
  CalendarCheck,
  Briefcase,
  RefreshCw,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { getAdminAnalyticsEarnings } from "../services/adminApi";
import type { AdminAnalyticsEarningsResponse } from "../services/adminApi";
import { getRevenueStreamLabel } from "../constants/feeStructure";

const CARD_CLASS =
  "bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow";

export const RevenueDashboard: React.FC = () => {
  const [data, setData] = useState<AdminAnalyticsEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminAnalyticsEarnings();
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load analytics";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <p className="font-medium">ไม่สามารถโหลดข้อมูลได้</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-rose-100 hover:bg-rose-200 rounded-lg text-sm font-medium"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const d = data!;

  const formatThb = (n: number) =>
    "฿" + (Number.isFinite(n) ? n.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "0.00");

  const cards = [
    {
      title: "Total Platform Revenue",
      value: formatThb(d.total_platform_revenue),
      sub: "รายได้รวมของแอป (Booking Fees + Job Commissions)",
      icon: Landmark,
      className: "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
    {
      title: "Active Escrow Amount",
      value: formatThb(d.active_escrow_amount),
      sub: "เงินรวมที่ถือครองอยู่ในระบบ (Booking มัดจำ + Advance Jobs)",
      icon: Wallet,
      className: "text-amber-600 bg-amber-50 border-amber-100",
    },
    {
      title: "Completed Bookings Count",
      value: String(d.completed_bookings_count),
      sub: "จำนวนการจองที่สำเร็จ (สถานะ completed)",
      icon: CalendarCheck,
      className: "text-blue-600 bg-blue-50 border-blue-100",
    },
    {
      title: "Active Advance Jobs",
      value: String(d.active_advance_jobs),
      sub: "จำนวนงาน Advance ที่ยังไม่จบ (ไม่รวม completed/disputed)",
      icon: Briefcase,
      className: "text-violet-600 bg-violet-50 border-violet-100",
    },
  ];

  const streamLabel = (event_type: string, leg: string | null, sub_category?: string | null) =>
    getRevenueStreamLabel(event_type, leg, sub_category);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Financial Analytics</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.title} className={`${CARD_CLASS} ${card.className.split(" ").find((c) => c.startsWith("border-")) || "border-slate-200"}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{card.title}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
                <p className="text-xs text-slate-400 mt-2">{card.sub}</p>
              </div>
              <div className={`p-2 rounded-lg ${card.className.split(" ").slice(0, 2).join(" ")}`}>
                <card.icon size={22} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={CARD_CLASS}>
        <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp size={20} />
          Revenue Stream — ล่าสุด 10 รายการ
        </h3>
        {d.revenue_stream.length === 0 ? (
          <p className="text-slate-500 text-sm py-8 text-center">ยังไม่มีรายการเงินเข้า</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-left">
                  <th className="pb-3 pr-4">เวลา</th>
                  <th className="pb-3 pr-4">ประเภท</th>
                  <th className="pb-3 pr-4">Payment / Job ID</th>
                  <th className="pb-3 pr-4 text-right">จำนวน (THB)</th>
                </tr>
              </thead>
              <tbody>
                {d.revenue_stream.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-600">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString("th-TH", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 font-medium">
                      {streamLabel(row.event_type, row.leg, row.sub_category)}
                    </td>
                    <td className="py-3 pr-4 text-slate-500 font-mono text-xs">
                      {row.payment_id || row.job_id || "—"}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-emerald-600">
                      +{row.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
