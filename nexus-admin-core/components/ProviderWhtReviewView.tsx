import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, ReceiptText } from "lucide-react";
import { getProviderWhtPostings, type ProviderWhtPosting } from "../services/adminApi";

const money = (value: unknown) =>
  Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusCopy: Record<string, string> = {
  eligible: "พร้อมออกเอกสาร",
  blocked_missing_tax_profile: "รอข้อมูลภาษีผู้รับงาน",
  not_eligible: "ไม่เข้าเกณฑ์ WHT",
};

export const ProviderWhtReviewView: React.FC = () => {
  const [postings, setPostings] = useState<ProviderWhtPosting[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    return postings.reduce(
      (acc, row) => {
        acc.gross += Number(row.gross_income_amount || 0);
        acc.withheld += Number(row.withheld_amount || 0);
        acc.net += Number(row.net_payable_amount || 0);
        return acc;
      },
      { gross: 0, withheld: 0, net: 0 },
    );
  }, [postings]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getProviderWhtPostings({ limit: 100, status: status || undefined });
      setPostings(res.postings || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดรายการ WHT ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ReceiptText className="h-6 w-6 text-indigo-600" />
            Provider WHT & Earning Documents
          </h1>
          <p className="text-sm text-slate-500">
            ตรวจสอบภาษีหัก ณ ที่จ่ายของผู้รับงาน แยกจาก VAT 7% และผูกกับ ledger/source event ทุกครั้ง
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          รีเฟรช
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">Gross Provider Income</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">฿{money(totals.gross)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">WHT Withheld</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">฿{money(totals.withheld)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">Net Payable</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">฿{money(totals.net)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <label className="text-sm font-medium text-slate-700" htmlFor="wht-status">สถานะ</label>
        <select
          id="wht-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">ทั้งหมด</option>
          <option value="eligible">พร้อมออกเอกสาร</option>
          <option value="blocked_missing_tax_profile">รอข้อมูลภาษีผู้รับงาน</option>
          <option value="not_eligible">ไม่เข้าเกณฑ์ WHT</option>
        </select>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">WHT</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {postings.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.provider_name || row.provider_user_id}</div>
                    <div className="text-xs text-slate-500">{row.provider_email || row.provider_user_id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.source_event_type}</div>
                    <div className="font-mono text-xs text-slate-400">{row.source_event_id}</div>
                  </td>
                  <td className="px-4 py-3 text-right">฿{money(row.gross_income_amount)}</td>
                  <td className="px-4 py-3 text-right">
                    ฿{money(row.withheld_amount)}
                    <div className="text-xs text-slate-400">{Number(row.wht_rate_percent || 0)}%</div>
                  </td>
                  <td className="px-4 py-3 text-right">฿{money(row.net_payable_amount)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      {statusCopy[row.eligibility_status] || row.eligibility_status}
                    </span>
                    {row.eligibility_reason && <div className="mt-1 text-xs text-slate-500">{row.eligibility_reason}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>Earning: {row.earning_document_no || row.earning_document_status || row.earning_document_id || "-"}</div>
                    <div>WHT cert: {row.wht_certificate_document_no || row.wht_certificate_document_status || row.wht_certificate_document_id || "-"}</div>
                  </td>
                </tr>
              ))}
              {!postings.length && !loading && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>ยังไม่มีรายการ WHT ตามตัวกรองนี้</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
