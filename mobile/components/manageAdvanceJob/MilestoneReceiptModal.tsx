import React from "react";
import { X } from "lucide-react";
import type { AdvanceMilestoneAPI } from "../../types/api";
import { ADVANCE_TALENT_LABEL } from "../../utils/advanceJobLabels";

export function MilestoneReceiptModal({
  jobTitle,
  jobId,
  milestone,
  onClose,
}: {
  jobTitle?: string;
  jobId?: string;
  milestone: AdvanceMilestoneAPI;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 print:bg-white print:border print:shadow-none"
        onClick={(e) => e.stopPropagation()}
        id="receipt-print-area"
      >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold text-slate-900 print:text-black">
            สรุปการจ่ายเงิน (ใบเสร็จ)
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 print:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-slate-300 print:text-black">
            <span className="text-slate-500">งาน Advance Job:</span> {jobTitle || "—"}
          </p>
          <p className="text-slate-300 print:text-black">
            <span className="text-slate-500">Job ID:</span> {jobId}
          </p>
          <p className="text-slate-300 print:text-black">
            <span className="text-slate-500">งวดที่:</span> {milestone.order}
          </p>
          <p className="text-slate-300 print:text-black">
            <span className="text-slate-500">จำนวนที่จ่าย (งวด):</span> ฿
            {milestone.amount.toLocaleString()}
          </p>
          {milestone.commission_deducted != null && (
            <p className="text-slate-300 print:text-black">
              <span className="text-slate-500">ค่าธรรมเนียม (หัก):</span> ฿
              {milestone.commission_deducted.toLocaleString()}
            </p>
          )}
          {milestone.net_amount != null && (
            <p className="text-slate-300 print:text-black">
              <span className="text-slate-500">{ADVANCE_TALENT_LABEL} ได้รับสุทธิ:</span> ฿
              {milestone.net_amount.toLocaleString()}
            </p>
          )}
          {milestone.released_at && (
            <p className="text-slate-300 print:text-black">
              <span className="text-slate-500">วันที่ปล่อย:</span>{" "}
              {new Date(milestone.released_at).toLocaleString("th-TH")}
            </p>
          )}
        </div>
        <div className="mt-6 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-medium"
          >
            พิมพ์ / บันทึกเป็น PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-600 text-slate-100"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
