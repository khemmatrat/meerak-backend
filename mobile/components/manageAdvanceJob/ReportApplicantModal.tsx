import React from "react";
import { Loader2 } from "lucide-react";
import type { AdvanceApplicantWithUser } from "../../types/api";

export function ReportApplicantModal({
  user: reportUser,
  reportReason,
  setReportReason,
  loading,
  onSubmit,
  onClose,
}: {
  user: AdvanceApplicantWithUser;
  reportReason: string;
  setReportReason: (v: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-100 mb-4">แจ้งรายงานผู้ใช้</h3>
        <p className="text-sm text-slate-400 mb-2">
          รายงาน {reportUser.full_name || "ผู้สมัคร"} — เหตุผล (ไม่บังคับ)
        </p>
        <textarea
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          placeholder="เช่น สแปม, พฤติกรรมไม่เหมาะสม..."
          className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100 mb-4 min-h-[80px]"
          maxLength={500}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin mx-auto" />
            ) : (
              "แจ้งรายงาน"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
