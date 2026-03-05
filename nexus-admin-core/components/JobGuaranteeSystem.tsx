/**
 * Job Guarantee System — ติดตามเงินประกันงานทั้งหมด
 * สถานะ: ใช้งานอยู่ / คืนแล้ว / ถูกเรียกใช้ | ระบบปล่อยเงินประกันอัตโนมัติ
 */
import React, { useState, useEffect } from "react";
import {
  Shield,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export type GuaranteeStatus = "active" | "released" | "claimed" | "pending_release";

export interface JobGuaranteeEntry {
  id: string;
  job_id: string;
  job_title: string;
  amount: number;
  currency: string;
  status: GuaranteeStatus;
  employer_id: string;
  provider_id?: string;
  created_at: string;
  released_at?: string;
  due_release_at?: string;
  note?: string;
}

const MOCK_GUARANTEES: JobGuaranteeEntry[] = [
  {
    id: "G-001",
    job_id: "J-101",
    job_title: "ติดตั้งแอร์ 2 เครื่อง",
    amount: 2000,
    currency: "THB",
    status: "active",
    employer_id: "U001",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    due_release_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "G-002",
    job_id: "J-102",
    job_title: "ล้างแอร์รายเดือน",
    amount: 500,
    currency: "THB",
    status: "released",
    employer_id: "U002",
    provider_id: "P001",
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    released_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "G-003",
    job_id: "J-103",
    job_title: "ซ่อมประตู",
    amount: 1500,
    currency: "THB",
    status: "claimed",
    employer_id: "U003",
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    released_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    note: "เรียกใช้เนื่องจากงานไม่เสร็จตามข้อตกลง",
  },
  {
    id: "G-004",
    job_id: "J-104",
    job_title: "ทำความสะอาดหลังงานก่อสร้าง",
    amount: 3000,
    currency: "THB",
    status: "pending_release",
    employer_id: "U004",
    provider_id: "P002",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    due_release_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const JobGuaranteeSystem: React.FC = () => {
  const [entries, setEntries] = useState<JobGuaranteeEntry[]>(MOCK_GUARANTEES);
  const [loading, setLoading] = useState(false);
  const [autoReleaseEnabled, setAutoReleaseEnabled] = useState(true);

  const totalHeld = entries
    .filter((e) => e.status === "active" || e.status === "pending_release")
    .reduce((s, e) => s + e.amount, 0);
  const totalReleased = entries
    .filter((e) => e.status === "released")
    .reduce((s, e) => s + e.amount, 0);
  const totalClaimed = entries
    .filter((e) => e.status === "claimed")
    .reduce((s, e) => s + e.amount, 0);
  const liabilityToRelease = entries
    .filter((e) => e.status === "pending_release")
    .reduce((s, e) => s + e.amount, 0);

  const fetchData = async () => {
    setLoading(true);
    try {
      // TODO: replace with API getJobGuarantees() when backend ready
      await new Promise((r) => setTimeout(r, 600));
      setEntries(MOCK_GUARANTEES);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExport = () => {
    const header = "ID,Job ID,Job Title,Amount,Status,Employer,Created,Released/Due\n";
    const rows = entries
      .map(
        (e) =>
          `${e.id},${e.job_id},${e.job_title},${e.amount},${e.status},${e.employer_id},${e.created_at},${e.released_at || e.due_release_at || ""}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job_guarantees_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (status: GuaranteeStatus) => {
    const map: Record<GuaranteeStatus, { label: string; className: string }> = {
      active: { label: "ใช้งานอยู่", className: "bg-blue-100 text-blue-700" },
      pending_release: { label: "รอปล่อยอัตโนมัติ", className: "bg-amber-100 text-amber-700" },
      released: { label: "คืนแล้ว", className: "bg-emerald-100 text-emerald-700" },
      claimed: { label: "ถูกเรียกใช้", className: "bg-rose-100 text-rose-700" },
    };
    const { label, className } = map[status];
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${className}`}>{label}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-indigo-800 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Shield size={24} /> ระบบเงินประกันงาน (Job Guarantee)
        </h2>
        <p className="text-slate-200 text-sm">
          ติดตามเงินประกันงานทั้งหมด • หนี้สินที่ต้องจ่ายคืน • สถานะใช้งานอยู่/คืนแล้ว/ถูกเรียกใช้ •
          ปล่อยเงินประกันอัตโนมัติ
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="text-blue-600" size={20} />
            <span className="text-sm font-medium text-slate-500">ยอดประกันคงค้าง</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">฿{totalHeld.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">ใช้งานอยู่ + รอปล่อย</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="text-amber-600" size={20} />
            <span className="text-sm font-medium text-slate-500">รอปล่อยอัตโนมัติ</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">฿{liabilityToRelease.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">หนี้สินที่ต้องจ่ายคืน</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-emerald-600" size={20} />
            <span className="text-sm font-medium text-slate-500">คืนแล้ว (สะสม)</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700">฿{totalReleased.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="text-rose-600" size={20} />
            <span className="text-sm font-medium text-slate-500">ถูกเรียกใช้ (สะสม)</span>
          </div>
          <p className="text-2xl font-bold text-rose-700">฿{totalClaimed.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoReleaseEnabled}
              onChange={(e) => setAutoReleaseEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">ปล่อยเงินประกันอัตโนมัติเมื่องานเสร็จ</span>
          </label>
        </div>
        <div className="flex gap-2">
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
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">รายการเงินประกันงาน</h3>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">ID / งาน</th>
                <th className="px-6 py-3 text-left font-semibold">จำนวน (THB)</th>
                <th className="px-6 py-3 text-left font-semibold">สถานะ</th>
                <th className="px-6 py-3 text-left font-semibold">สร้างเมื่อ</th>
                <th className="px-6 py-3 text-left font-semibold">ครบกำหนดปล่อย / ปล่อยเมื่อ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3">
                    <p className="font-mono text-slate-600">{e.id}</p>
                    <p className="font-medium text-slate-900">{e.job_title}</p>
                    <p className="text-xs text-slate-400">Job: {e.job_id}</p>
                  </td>
                  <td className="px-6 py-3 font-medium">฿{e.amount.toLocaleString()}</td>
                  <td className="px-6 py-3">{statusBadge(e.status)}</td>
                  <td className="px-6 py-3 text-slate-600">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {e.released_at
                      ? new Date(e.released_at).toLocaleString()
                      : e.due_release_at
                      ? "ครบ " + new Date(e.due_release_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
