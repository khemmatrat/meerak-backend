import React from "react";
import { Loader2 } from "lucide-react";

export function RequestRevisionModal({
  revisionNote,
  setRevisionNote,
  revisionCount,
  revisionLimit,
  submitting,
  onSubmit,
  onClose,
}: {
  revisionNote: string;
  setRevisionNote: (v: string) => void;
  revisionCount: number;
  revisionLimit: number;
  submitting: boolean;
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
        <h3 className="text-lg font-bold text-slate-100 mb-2">ขอแก้ไขงาน</h3>
        <p className="text-sm text-slate-400 mb-4">
          ระบุรายการที่ต้องแก้ไข — ผู้รับจ้างจะได้รับแจ้งและสามารถส่งงานใหม่ได้
        </p>
        <textarea
          value={revisionNote}
          onChange={(e) => setRevisionNote(e.target.value)}
          placeholder="เช่น สีตัวอักษรควรเป็นดำ, เพิ่มโลโก้ที่มุมขวาล่าง..."
          className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100 mb-4 min-h-[120px]"
          maxLength={2000}
        />
        <p className="text-xs text-slate-500 mb-4">
          Revision: {revisionCount}/{revisionLimit} (ใช้ได้อีก{" "}
          {revisionLimit - revisionCount} ครั้ง)
        </p>
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
            disabled={
              submitting || !revisionNote.trim() || revisionCount >= revisionLimit
            }
            className="flex-1 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              "ส่งคำขอแก้ไข"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
