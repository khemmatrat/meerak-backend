/**
 * Job Guarantee System — ติดตามเงินประกันงานทั้งหมด (Real-time จาก API)
 * ข้อมูลจาก platform_revenues, ledger, jobs, advance_jobs
 */
import React, { useState, useEffect, useCallback } from "react";
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
import { getJobGuarantees, type JobGuaranteesResponse } from "../services/financialService";

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
  source?: string;
}

const POLL_MS = 30 * 1000;

export const JobGuaranteeSystem: React.FC = () => {
  const [data, setData] = useState<JobGuaranteesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const entries = data?.entries ?? [];
  const totalHeld = data?.total_held ?? 0;
  const totalReleased = data?.total_released ?? 0;
  const totalClaimed = data?.total_claimed ?? 0;
  const liabilityToRelease = data?.liability_to_release ?? 0;
  const totalInsurancePremium = data?.total_insurance_premium ?? 0;
  const autoReleaseEnabled = data?.auto_release_enabled ?? true;
  const counts = data?.counts ?? { active: 0, pending_release: 0, released: 0, claimed: 0 };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJobGuarantees();
      setData(res);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(fetchData, POLL_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const onVisible = () => fetchData();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData]);

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
          ข้อมูลจริงจาก platform_revenues, ledger, jobs • หนี้สินที่ต้องจ่ายคืน • สถานะใช้งานอยู่/คืนแล้ว/ถูกเรียกใช้
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3">
          <AlertTriangle className="text-rose-600 shrink-0" size={20} />
          <p className="text-rose-700 text-sm">{error}</p>
          <button onClick={fetchData} className="ml-auto text-rose-600 hover:text-rose-800 text-sm font-medium">
            ลองใหม่
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="text-indigo-600" size={20} />
            <span className="text-sm font-medium text-slate-500">เงินประกันทั้งหมด</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿{(totalHeld + totalInsurancePremium).toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 mt-1">Escrow + เบี้ยประกัน (platform_revenues)</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="text-blue-600" size={20} />
            <span className="text-sm font-medium text-slate-500">ยอดประกันคงค้าง</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">฿{totalHeld.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">ใช้งานอยู่ ({counts.active}) + รอปล่อย ({counts.pending_release})</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="text-amber-600" size={20} />
            <span className="text-sm font-medium text-slate-500">หนี้สินที่ต้องจ่ายคืน</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">฿{liabilityToRelease.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">รอปล่อยอัตโนมัติ ({counts.pending_release} งาน)</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-emerald-600" size={20} />
            <span className="text-sm font-medium text-slate-500">คืนแล้ว (สะสม)</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700">฿{totalReleased.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{counts.released} งาน</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="text-rose-600" size={20} />
            <span className="text-sm font-medium text-slate-500">ถูกเรียกใช้/คืนเงิน (สะสม)</span>
          </div>
          <p className="text-2xl font-bold text-rose-700">฿{totalClaimed.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{counts.claimed} งาน (escrow_refunded)</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${autoReleaseEnabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {autoReleaseEnabled ? (
              <><CheckCircle size={16} /> ปล่อยเงินประกันอัตโนมัติ: เปิดใช้งาน</>
            ) : (
              <><AlertTriangle size={16} /> ปล่อยเงินประกันอัตโนมัติ: ปิด</>
            )}
          </span>
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
                <th className="px-6 py-3 text-left font-semibold">แหล่งที่มา</th>
                <th className="px-6 py-3 text-left font-semibold">จำนวน (THB)</th>
                <th className="px-6 py-3 text-left font-semibold">สถานะ</th>
                <th className="px-6 py-3 text-left font-semibold">สร้างเมื่อ</th>
                <th className="px-6 py-3 text-left font-semibold">ครบกำหนดปล่อย / ปล่อยเมื่อ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                    กำลังโหลดข้อมูลจริงจาก API...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    ยังไม่มีรายการเงินประกันงาน
                  </td>
                </tr>
              ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3">
                    <p className="font-mono text-slate-600">{e.id}</p>
                    <p className="font-medium text-slate-900">{e.job_title}</p>
                    <p className="text-xs text-slate-400">Job: {e.job_id}</p>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-500">
                    {(e as any).source === "advance_job" ? "Advance Job" : (e as any).source === "booking" ? "Booking" : "Match Job"}
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
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
