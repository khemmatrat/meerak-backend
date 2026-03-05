/**
 * Commission Revenue — รายได้จากค่าคอมมิชชั่น
 * แยกตามประเภทงาน • ยอดรอจ่าย vs จ่ายแล้ว • กราฟแนวโน้ม • ตั้งอัตราค่าคอมมิชชั่น
 */
import React, { useState, useEffect } from "react";
import {
  Percent,
  DollarSign,
  Clock,
  CheckCircle,
  TrendingUp,
  Settings,
  RefreshCw,
  Download,
  Loader2,
} from "lucide-react";

export interface CommissionByCategory {
  category: string;
  total_commission: number;
  paid: number;
  pending: number;
  job_count: number;
}

export interface CommissionRateConfig {
  category: string;
  rate_percent: number;
}

const MOCK_BY_CATEGORY: CommissionByCategory[] = [
  { category: "ติดตั้ง/ซ่อมแอร์", total_commission: 12500, paid: 10000, pending: 2500, job_count: 25 },
  { category: "ทำความสะอาด", total_commission: 8200, paid: 6000, pending: 2200, job_count: 41 },
  { category: "ลอจิสติกส์", total_commission: 15000, paid: 12000, pending: 3000, job_count: 30 },
  { category: "อื่นๆ", total_commission: 3300, paid: 3300, pending: 0, job_count: 11 },
];

const MOCK_TREND = [
  { period: "สัปดาห์ 1", amount: 8500 },
  { period: "สัปดาห์ 2", amount: 10200 },
  { period: "สัปดาห์ 3", amount: 11800 },
  { period: "สัปดาห์ 4", amount: 13900 },
];

const DEFAULT_RATES: CommissionRateConfig[] = [
  { category: "default", rate_percent: 10 },
  { category: "ติดตั้ง/ซ่อมแอร์", rate_percent: 10 },
  { category: "ทำความสะอาด", rate_percent: 8 },
  { category: "ลอจิสติกส์", rate_percent: 12 },
];

export const CommissionRevenue: React.FC = () => {
  const [byCategory, setByCategory] = useState<CommissionByCategory[]>(MOCK_BY_CATEGORY);
  const [trend, setTrend] = useState(MOCK_TREND);
  const [rates, setRates] = useState<CommissionRateConfig[]>(DEFAULT_RATES);
  const [loading, setLoading] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);

  const totalCommission = byCategory.reduce((s, c) => s + c.total_commission, 0);
  const totalPaid = byCategory.reduce((s, c) => s + c.paid, 0);
  const totalPending = byCategory.reduce((s, c) => s + c.pending, 0);

  const fetchData = async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setByCategory(MOCK_BY_CATEGORY);
      setTrend(MOCK_TREND);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExport = () => {
    const header = "Category,Total Commission,Paid,Pending,Job Count\n";
    const rows = byCategory
      .map(
        (c) =>
          `${c.category},${c.total_commission},${c.paid},${c.pending},${c.job_count}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission_revenue_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxTrend = Math.max(...trend.map((t) => t.amount), 1);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Percent size={24} /> รายได้จากค่าคอมมิชชั่น
        </h2>
        <p className="text-emerald-100 text-sm">
          แยกตามประเภทงาน • ยอดรอจ่าย vs จ่ายแล้ว • แนวโน้มรายได้ • ตั้งอัตราค่าคอมมิชชั่น
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-emerald-600" size={20} />
            <span className="text-sm font-medium text-slate-500">ค่าคอมมิชชั่นรวม</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">฿{totalCommission.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-blue-600" size={20} />
            <span className="text-sm font-medium text-slate-500">จ่ายแล้ว</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">฿{totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="text-amber-600" size={20} />
            <span className="text-sm font-medium text-slate-500">รอจ่าย</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">฿{totalPending.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowRateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
        >
          <Settings size={16} /> ตั้งอัตราค่าคอมมิชชั่น
        </button>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
        >
          <Download size={16} /> Export
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={18} /> แนวโน้มรายได้ (ตามช่วงเวลา)
            </h3>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {trend.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-24">{t.period}</span>
                  <div className="flex-1 h-8 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded"
                      style={{ width: `${(t.amount / maxTrend) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-800 w-20 text-right">
                    ฿{t.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800">แยกตามประเภทงาน</h3>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">ประเภท</th>
                  <th className="px-4 py-3 text-right font-semibold">รวม</th>
                  <th className="px-4 py-3 text-right font-semibold">จ่ายแล้ว</th>
                  <th className="px-4 py-3 text-right font-semibold">รอจ่าย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byCategory.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.category}</td>
                    <td className="px-4 py-3 text-right">฿{c.total_commission.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      ฿{c.paid.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-600">
                      ฿{c.pending.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showRateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">อัตราค่าคอมมิชชั่น</h3>
              <button
                onClick={() => setShowRateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {rates.map((r, i) => (
                <li key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">{r.category}</span>
                  <span className="text-sm font-bold text-indigo-600">{r.rate_percent}%</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-4">
              การแก้ไขอัตราจริงจะเชื่อมกับ Backend เมื่อมี API ตั้งค่าคอมมิชชั่น
            </p>
            <button
              onClick={() => setShowRateModal(false)}
              className="mt-4 w-full py-2 bg-indigo-600 text-white rounded-lg font-medium"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
