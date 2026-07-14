import React from "react";
import { UserCheck } from "lucide-react";
import { ADVANCE_TALENT_LABEL, goToEscrowLabel } from "../../utils/advanceJobLabels";

export function HireSummaryModal({
  talentName,
  agreedAmount,
  steps,
  onGoEscrow,
  onClose,
}: {
  talentName: string;
  agreedAmount: number;
  steps: string[];
  onGoEscrow: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="rounded-2xl border border-blue-200 bg-white shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <UserCheck size={32} className="text-blue-600 shrink-0" />
          <div>
            <h3 className="text-xl font-bold text-slate-900">จ้างสำเร็จ!</h3>
            <p className="text-sm text-slate-600">สรุปขั้นต่อไปสำหรับงานนี้</p>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4 space-y-2 text-sm">
          <p className="text-slate-700">
            <span className="text-slate-500">{ADVANCE_TALENT_LABEL}:</span>{" "}
            <strong>{talentName}</strong>
          </p>
          <p className="text-slate-700">
            <span className="text-slate-500">งบตกลง:</span>{" "}
            <strong className="text-emerald-700">
              ฿{agreedAmount.toLocaleString("th-TH")}
            </strong>
          </p>
        </div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          ขั้นถัดไป 3 อย่าง
        </p>
        <ol className="space-y-2 mb-6">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-2 text-sm text-slate-700">
              <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onGoEscrow}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500"
          >
            {goToEscrowLabel()}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            ปิด — ดูภายหลังได้
          </button>
        </div>
      </div>
    </div>
  );
}
