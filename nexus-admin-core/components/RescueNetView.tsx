import React, { useEffect, useState } from "react";
import { Radio, TrendingUp, Package, RefreshCw } from "lucide-react";
import { getRescueNetStats, type RescueNetStatsResponse } from "../services/adminApi";

export const RescueNetView: React.FC = () => {
  const [data, setData] = useState<RescueNetStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    getRescueNetStats()
      .then(setData)
      .catch((e: Error & { status?: number }) => {
        const st = e?.status;
        if (st === 404) {
          setErr(
            "ไม่พบ API (404) — deploy backend ล่าสุดที่มี route GET /api/admin/telecom/rescue-net-stats แล้วรีสตาร์ท Node บน api.aqond.com"
          );
        } else if (st === 401 || st === 403) {
          setErr("ไม่มีสิทธิ์ — ต้องล็อกอิน Admin (role ADMIN หรือ AUDITOR ใน user_roles)");
        } else {
          setErr(e?.message || "โหลดไม่สำเร็จ");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const summary = data?.summary;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Radio className="text-orange-600" />
            AQOND Rescue Net
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            ยอดขาย eSIM / digital goods (GigaStore) · event ledger:{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">emergency_net_purchase</code>
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{err}</div>
      )}

      {data?.warning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {data.warning}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <TrendingUp size={18} className="text-emerald-600" />
            รายได้รวม (ประมาณการ)
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">
            {loading ? "—" : `฿${Number(summary?.totalRevenue ?? 0).toLocaleString()}`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <Package size={18} className="text-indigo-600" />
            จำนวนรายการ
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">
            {loading ? "—" : summary?.totalOrders ?? 0}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 font-semibold text-slate-800">
          ยอดตาม SKU
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">จำนวน</th>
                <th className="px-4 py-2">รายได้</th>
              </tr>
            </thead>
            <tbody>
              {(data?.bySku || []).length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                    ยังไม่มีข้อมูล
                  </td>
                </tr>
              )}
              {(data?.bySku || []).map((row) => (
                <tr key={row.product_sku} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-4 py-2 font-mono text-xs">{row.product_sku}</td>
                  <td className="px-4 py-2 tabular-nums">{row.cnt}</td>
                  <td className="px-4 py-2 tabular-nums">฿{Number(row.revenue).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 font-semibold text-slate-800">
          รายการล่าสุด
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2">เวลา</th>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">ยอด</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentPurchases || []).map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-4 py-2 whitespace-nowrap text-xs">
                    {r.created_at ? new Date(r.created_at).toLocaleString("th-TH") : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.product_sku}</td>
                  <td className="px-4 py-2 font-mono text-xs truncate max-w-[140px]">{r.user_id}</td>
                  <td className="px-4 py-2 tabular-nums">฿{Number(r.total_charged).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-800 mb-1">แหล่งข้อมูล</p>
        <p>
          สรุปจากตาราง <code className="bg-white px-1 rounded border border-slate-200">user_digital_assets</code> ·
          Ledger event <code className="bg-white px-1 rounded border border-slate-200">emergency_net_purchase</code> ·
          eSIM provisioning ผ่าน GigaStore / Tunz (ตามข้อกำหนดผู้ให้บริการ)
        </p>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-slate-700">
        <p className="font-medium text-indigo-900 mb-1">ไอเดียต่อยอด</p>
        <ul className="list-disc list-inside space-y-1 text-slate-600">
          <li>เชื่อมรายงานกับ Financial Audit เมื่อมีรายได้จาก Rescue Net มากขึ้น</li>
          <li>แจ้งเตือน Slack/Webhook เมื่อยอดรายวันเกินเกณฑ์</li>
          <li>Export CSV จากตาราง user_digital_assets + payment_ledger_audit</li>
        </ul>
      </div>
    </div>
  );
};

export default RescueNetView;
