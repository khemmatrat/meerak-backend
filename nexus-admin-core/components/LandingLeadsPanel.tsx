import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Globe, User, Phone, Calendar, MapPin, CreditCard, Loader2 } from "lucide-react";
import { getAdminLandingLeads, type LandingPageLeadRow } from "../services/adminApi";

const PAGE = 40;

export const LandingLeadsPanel: React.FC = () => {
  const [leads, setLeads] = useState<LandingPageLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setWarn(null);
    try {
      const res = await getAdminLandingLeads({ limit: PAGE, offset });
      setLeads(res.leads || []);
      setTotal(res.pagination?.total ?? 0);
      if (res.warning === "migration_159_not_applied") {
        setWarn("ยังไม่ได้รัน migration 159 (landing_page_leads) บน PostgreSQL");
      }
    } catch (e: any) {
      setLeads([]);
      setWarn(e?.message || "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    load();
  }, [load]);

  const maskId = (s: string | null | undefined) => {
    if (!s || s.length < 5) return "—";
    return "•••••" + s.slice(-4);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="text-indigo-600" size={20} />
            ลงทะเบียนจาก Landing Page
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ข้อมูลจากฟอร์ม Early Registration + ยืนยันตัวตนเบื้องต้น (aqond.com) — เก็บใน PostgreSQL
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          รีเฟรช
        </button>
      </div>

      {warn && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-900 text-sm">{warn}</div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <th className="px-3 py-2 whitespace-nowrap">เวลา</th>
              <th className="px-3 py-2">ชื่อ / ติดต่อ</th>
              <th className="px-3 py-2">ความสนใจ</th>
              <th className="px-3 py-2">KYC เบื้องต้น</th>
              <th className="px-3 py-2">เลข ปชช.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  <Loader2 className="inline animate-spin mr-2" size={18} />
                  กำลังโหลด...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  ยังไม่มีรายการ — รอผู้ใช้กรอกจากหน้า Landing
                </td>
              </tr>
            ) : (
              leads.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600 text-xs">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString("th-TH")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900 flex items-center gap-1">
                      <User size={14} className="text-slate-400 shrink-0" />
                      {row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                      <Phone size={12} className="shrink-0" />
                      {row.contact}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={row.interest_service || ""}>
                    {row.interest_service || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.kyc_started ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                        <CreditCard size={14} />
                        กรอกแล้ว
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                    {row.address && (
                      <div className="text-[11px] text-slate-500 mt-1 flex items-start gap-1 max-w-[240px] line-clamp-2">
                        <MapPin size={12} className="shrink-0 mt-0.5" />
                        {row.address}
                      </div>
                    )}
                    {row.date_of_birth && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar size={12} />
                        {row.date_of_birth}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{maskId(row.national_id)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-sm text-slate-600">
          <span>
            แสดง {offset + 1}–{Math.min(offset + leads.length, total)} จาก {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              disabled={offset + leads.length >= total || loading}
              onClick={() => setOffset((o) => o + PAGE)}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
