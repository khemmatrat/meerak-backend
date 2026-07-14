import React, { useState } from "react";
import { Users } from "lucide-react";

function suggestBudgetRange(minBudget: number, maxBudget: number) {
  const min = Math.max(0, minBudget);
  const max = Math.max(min, maxBudget);
  const bump = Math.max(Math.round(max * 0.15), 500);
  const newMax = max + bump;
  const newMin = min > 0 ? min : Math.max(500, Math.round(newMax * 0.6));
  return { min: newMin, max: newMax, bump };
}

export function NoApplicantsCard({
  jobId,
  bullets,
  notify,
  minBudget = 0,
  maxBudget = 0,
}: {
  jobId: string;
  bullets: string[];
  notify: (msg: string, type?: "success" | "info" | "error" | "warning") => void;
  minBudget?: number;
  maxBudget?: number;
}) {
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const suggested = suggestBudgetRange(minBudget, maxBudget);

  return (
    <>
      <div className="rounded-xl border border-slate-600/50 bg-slate-800/30 p-8 text-center max-w-lg mx-auto">
        <Users size={40} className="mx-auto text-slate-500 mb-4" />
        <h3 className="text-lg font-bold text-slate-200 mb-3">ยังไม่มีผู้สนใจ</h3>
        <ul className="text-left text-sm text-slate-400 space-y-2 mb-6 list-disc list-inside">
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/#/job-board/${jobId}`;
              navigator.clipboard?.writeText(url).then(
                () => notify("คัดลอกลิงก์งานแล้ว", "success"),
                () => notify(url, "info"),
              );
            }}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
          >
            คัดลอกลิงก์แชร์งาน
          </button>
          <button
            type="button"
            onClick={() => setShowBudgetModal(true)}
            className="px-5 py-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-sm font-medium hover:bg-amber-500/25"
          >
            ปรับงบขึ้นเล็กน้อย
          </button>
        </div>
      </div>

      {showBudgetModal && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={() => setShowBudgetModal(false)}
            aria-hidden
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[90%] max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-600 shadow-xl">
            <h4 className="text-lg font-bold text-slate-100 mb-2">ช่วงงบที่แนะนำ</h4>
            <p className="text-sm text-slate-400 mb-4">
              เพิ่มงบประมาณสูงสุดประมาณ 15% เพื่อดึงดูดผู้สนใจมากขึ้น (แก้ไขงานด้วยตนเองในระบบ)
            </p>
            <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-4 mb-4 space-y-2 text-sm">
              <p className="text-slate-500">
                งบปัจจุบัน:{" "}
                <span className="text-slate-300">
                  ฿{minBudget.toLocaleString()} – ฿{maxBudget.toLocaleString()}
                </span>
              </p>
              <p className="text-amber-300 font-semibold">
                แนะนำ: ฿{suggested.min.toLocaleString()} – ฿{suggested.max.toLocaleString()}
                <span className="text-slate-500 font-normal text-xs ml-1">
                  (+฿{suggested.bump.toLocaleString()})
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = `฿${suggested.min.toLocaleString()} – ฿${suggested.max.toLocaleString()}`;
                  navigator.clipboard?.writeText(text).then(
                    () => notify("คัดลอกช่วงงบแนะนำแล้ว", "success"),
                    () => notify(text, "info"),
                  );
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-500/40 font-medium hover:bg-amber-500/30"
              >
                คัดลอกช่วงงบแนะนำ
              </button>
              <button
                type="button"
                onClick={() => setShowBudgetModal(false)}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-300"
              >
                ปิด
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
